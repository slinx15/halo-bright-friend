import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch data
    const [productsRes, stockOutRes] = await Promise.all([
      supabase.from("products").select("kode, nama, kategori, stock(jumlah), prices(harga_modal, harga_normal)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, total_harga, toko, created_at").order("created_at", { ascending: false }).limit(1000),
    ]);

    const products = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    const totalStock = products.reduce((s: number, p: any) => s + (p.stock?.jumlah ?? 0), 0);
    const zeroStock = products.filter((p: any) => (p.stock?.jumlah ?? 0) === 0);
    const lowStock = products.filter((p: any) => {
      const j = p.stock?.jumlah ?? 0;
      return j > 0 && j <= 15;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSales = stockOut.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
    const totalOmzet = recentSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const totalPcs = recentSales.reduce((s: number, r: any) => s + (r.qty_kirim || 0), 0);

    // Velocity per product
    const salesByProduct: Record<string, number> = {};
    recentSales.forEach((s: any) => {
      salesByProduct[s.product_id] = (salesByProduct[s.product_id] || 0) + s.qty_kirim;
    });

    const topSellers = Object.entries(salesByProduct)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pid, qty]) => {
        const p = products.find((pr: any) => pr.id === pid);
        return `${p?.kode || "?"}: ${qty} pcs (stok sisa: ${p?.stock?.jumlah ?? 0})`;
      });

    const criticalProducts = products
      .filter((p: any) => {
        const stok = p.stock?.jumlah ?? 0;
        const velocity = salesByProduct[p.id] || 0;
        return stok <= 15 && velocity > 0;
      })
      .slice(0, 10)
      .map((p: any) => `${p.kode}: stok ${p.stock?.jumlah ?? 0}, terjual ${salesByProduct[p.id] || 0}/minggu`);

    const prompt = `Kamu adalah AI business analyst untuk RRCollections (toko benang craft).
Berikan 3-5 insight ACTIONABLE dalam format singkat.

DATA:
- ${products.length} produk aktif, total stok ${totalStock}
- ${zeroStock.length} produk stok kosong, ${lowStock.length} produk stok rendah
- Omzet 7 hari: Rp ${totalOmzet.toLocaleString("id-ID")} (${totalPcs} pcs)
- Top sellers: ${topSellers.join("; ") || "Belum ada"}
- Produk kritis (stok rendah + laku): ${criticalProducts.join("; ") || "Tidak ada"}

FORMAT OUTPUT (wajib):
- Tulis dalam Bahasa Indonesia
- Maks 3-5 bullet points
- Setiap point harus actionable (ada langkah konkret)
- Gunakan emoji di awal setiap point
- Ringkas, maks 2 kalimat per point
- Jangan mengarang data`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, coba lagi nanti." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Tidak ada insight saat ini.";

    return new Response(JSON.stringify({ insights: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
