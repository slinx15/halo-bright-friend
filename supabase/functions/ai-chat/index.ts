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

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Fetch business context
    const [productsRes, stockOutRes] = await Promise.all([
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah, tumpukan_detail), prices(harga_modal, harga_normal, harga_grosir)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, qty_pesan, total_harga, harga_satuan, harga_type, toko, created_at").order("created_at", { ascending: false }).limit(500),
    ]);

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    // Normalize stock — handle array or object from join
    const products = rawProducts.map((p: any) => {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      return { ...p, _stok: stk?.jumlah ?? 0, _tumpukan: stk?.tumpukan_detail, _hargaModal: prc?.harga_modal ?? 0 };
    });

    // Build summary
    const totalProducts = products.length;
    const totalStock = products.reduce((s: number, p: any) => s + p._stok, 0);
    const lowStock = products.filter((p: any) => p._stok <= 15);
    const zeroStock = products.filter((p: any) => p._stok === 0);

    // Sales last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSales = stockOut.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
    const totalOmzet7d = recentSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const totalPcs7d = recentSales.reduce((s: number, r: any) => s + (r.qty_pesan || 0), 0);

    // Top sellers
    const salesByProduct: Record<string, number> = {};
    recentSales.forEach((s: any) => {
      salesByProduct[s.product_id] = (salesByProduct[s.product_id] || 0) + s.qty_pesan;
    });
    const topSellers = Object.entries(salesByProduct)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([pid, qty]) => {
        const p = products.find((pr: any) => pr.id === pid);
        return `${p?.kode || pid}: ${qty} pcs`;
      });

    // Top customers
    const salesByToko: Record<string, { pcs: number; omzet: number }> = {};
    recentSales.forEach((s: any) => {
      const t = s.toko || "Tanpa nama";
      if (!salesByToko[t]) salesByToko[t] = { pcs: 0, omzet: 0 };
      salesByToko[t].pcs += s.qty_pesan;
      salesByToko[t].omzet += s.total_harga;
    });
    const topCustomers = Object.entries(salesByToko)
      .sort(([, a], [, b]) => b.omzet - a.omzet)
      .slice(0, 5)
      .map(([name, data]) => `${name}: ${data.pcs} pcs, Rp ${data.omzet.toLocaleString("id-ID")}`);

    const lowStockList = lowStock.slice(0, 15).map((p: any) =>
      `${p.kode}: stok ${p._stok}, modal Rp${p._hargaModal}`
    );

    // Build full product list for AI context
    const allProductsList = products.map((p: any) =>
      `${p.kode}|${p.nama}|stok:${p._stok}|modal:${p._hargaModal}|kat:${p.kategori || '-'}`
    ).join("\n");

    const systemPrompt = `Kamu adalah AI assistant untuk RRCollections, toko benang craft. 
Kamu membantu boss/pemilik toko menganalisa stok, penjualan, dan keputusan bisnis.

DATA REAL-TIME TOKO:
- Total produk aktif: ${totalProducts}
- Total stok: ${totalStock} pcs
- Produk stok kosong: ${zeroStock.length}
- Produk stok rendah (≤15): ${lowStock.length}

PENJUALAN 7 HARI TERAKHIR:
- Total omzet: Rp ${totalOmzet7d.toLocaleString("id-ID")}
- Total pcs terjual: ${totalPcs7d}
- Top sellers: ${topSellers.join(", ") || "Belum ada data"}
- Top pelanggan: ${topCustomers.join("; ") || "Belum ada data"}

STOK RENDAH/KRITIS:
${lowStockList.join("\n") || "Semua stok aman"}

DAFTAR SEMUA PRODUK (kode|nama|stok|modal|kategori):
${allProductsList}

ATURAN RESPON:
1. Jawab dalam Bahasa Indonesia, gaya ringkas dan to-the-point
2. Gunakan angka konkret dari data di atas
3. Jika ditanya rekomendasi restock, prioritaskan produk kritis
4. Gunakan emoji secukupnya untuk readability
5. Format dengan markdown (bold, list, dll)
6. Jangan mengarang data — hanya pakai data yang tersedia
7. Jika user tanya produk tertentu, CARI di daftar produk di atas berdasarkan kode
8. Jika ditanya hal di luar konteks toko, bilang fokusmu adalah membantu bisnis RRCollections`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit tercapai, coba lagi nanti." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis, silakan top up." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
