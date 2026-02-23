import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows, clear_before_import } = await req.json() as {
      rows: { tanggal: string; toko: string; kode: string; pesanan: number; kiriman: number }[];
      clear_before_import?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No data rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear existing stock_out if requested
    if (clear_before_import) {
      const { error: delError } = await supabase.from("stock_out").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delError) {
        console.error("Delete error:", delError);
        return new Response(JSON.stringify({ error: "Gagal menghapus data lama: " + delError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch all products with prices
    const { data: products } = await supabase
      .from("products")
      .select("id, kode, prices(harga_normal, harga_grosir, harga_modal)")
      .eq("is_active", true);

    if (!products) {
      return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also fetch aliases
    const { data: aliases } = await supabase
      .from("product_aliases")
      .select("alias, product_id");

    const productByKode = new Map<string, { id: string; harga_normal: number }>();
    for (const p of products) {
      const price = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      const harga = price?.harga_normal ?? 0;
      productByKode.set(p.kode.toUpperCase(), { id: p.id, harga_normal: harga });
    }

    // Add aliases
    if (aliases) {
      for (const a of aliases) {
        const prod = products.find((p: any) => p.id === a.product_id);
        if (prod) {
          const price = Array.isArray(prod.prices) ? prod.prices[0] : prod.prices;
          productByKode.set(a.alias.toUpperCase(), { id: prod.id, harga_normal: price?.harga_normal ?? 0 });
        }
      }
    }

    const insertRows: any[] = [];
    const notFound: string[] = [];

    for (const row of rows) {
      const kode = (row.kode || "").trim().toUpperCase();
      const product = productByKode.get(kode);
      if (!product) {
        if (!notFound.includes(kode) && kode) notFound.push(kode);
        continue;
      }

      const qtyPesan = row.pesanan || 0;
      const qtyKirim = row.kiriman || 0;

      // Parse date - try various formats
      let createdAt: string;
      try {
        const d = parseDate(row.tanggal);
        createdAt = d.toISOString();
      } catch {
        createdAt = new Date().toISOString();
      }

      insertRows.push({
        product_id: product.id,
        qty_pesan: qtyPesan,
        qty_kirim: qtyKirim,
        harga_type: "normal",
        harga_satuan: product.harga_normal,
        total_harga: product.harga_normal * qtyKirim,
        toko: (row.toko || "").trim(),
        user_id: user.id,
        created_at: createdAt,
      });
    }

    // Insert in chunks of 50
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += 50) {
      const chunk = insertRows.slice(i, i + 50);
      const { error } = await supabase.from("stock_out").insert(chunk);
      if (error) {
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message, inserted, total: insertRows.length }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        skipped: rows.length - insertRows.length,
        not_found: notFound,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseDate(str: string): Date {
  if (!str) return new Date();
  const s = str.trim();

  // DD/MM/YYYY HH:MM or DD/MM/YYYY HH:MM:SS or DD-MM-YYYY HH:MM
  const dmyTime = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyTime) {
    const year = dmyTime[3].length === 2 ? 2000 + parseInt(dmyTime[3]) : parseInt(dmyTime[3]);
    return new Date(year, parseInt(dmyTime[2]) - 1, parseInt(dmyTime[1]), parseInt(dmyTime[4]), parseInt(dmyTime[5]), parseInt(dmyTime[6] || "0"));
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3]) : parseInt(dmy[3]);
    return new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]), 12, 0, 0);
  }

  // YYYY-MM-DD with optional time
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]), 12, 0, 0);
  }

  // Fallback - DO NOT use native Date() to avoid MM/DD vs DD/MM ambiguity
  return new Date();
}
