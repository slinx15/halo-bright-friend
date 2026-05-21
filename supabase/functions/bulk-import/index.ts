import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BulkRow {
  kode: string;
  kategori: string;
  modal: number;
  normal: number;
  grosir: number;
  stok: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Use service role for DB operations (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows } = await req.json() as { rows: BulkRow[] };

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by kode + kategori. The same kode can exist in multiple sizes.
    const seen = new Set<string>();
    const deduped: BulkRow[] = [];
    for (const row of rows) {
      const code = row.kode.toUpperCase();
      const category = (row.kategori || "").trim();
      const key = `${code}::${category.toUpperCase()}`;
      if (code && !seen.has(key)) {
        seen.add(key);
        deduped.push(row);
      }
    }

    let totalInserted = 0;
    const errors: string[] = [];
    const BATCH = 50;

    for (let i = 0; i < deduped.length; i += BATCH) {
      const chunk = deduped.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;

      try {
        // Insert products
        const { data: prods, error: prodError } = await supabase
          .from("products")
          .insert(
            chunk.map((r) => ({
              kode: r.kode.toUpperCase(),
              nama: r.kode.toUpperCase(),
              kategori: r.kategori || null,
            }))
          )
          .select("id");

        if (prodError || !prods) {
          errors.push(`Batch ${batchNum}: ${prodError?.message || "no data"}`);
          continue;
        }

        totalInserted += prods.length;

        // Insert prices
        const { error: priceError } = await supabase.from("prices").insert(
          prods.map((p, idx) => ({
            product_id: p.id,
            harga_modal: chunk[idx].modal || 0,
            harga_normal: chunk[idx].normal || 0,
            harga_grosir: chunk[idx].grosir || 0,
          }))
        );

        if (priceError) {
          errors.push(`Batch ${batchNum} prices: ${priceError.message}`);
        }

        // Insert stock (only if > 0)
        const stockRows = prods
          .map((p, idx) => ({
            product_id: p.id,
            jumlah: chunk[idx].stok || 0,
          }))
          .filter((s) => s.jumlah > 0);

        if (stockRows.length > 0) {
          const { error: stockError } = await supabase.from("stock").insert(stockRows);
          if (stockError) {
            errors.push(`Batch ${batchNum} stock: ${stockError.message}`);
          }
        }
      } catch (err) {
        errors.push(`Batch ${batchNum}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalInserted,
        totalRequested: deduped.length,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
