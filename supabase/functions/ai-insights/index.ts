import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Simplified Engine Rules (matching web app) ───
const RULES = {
  CYCLE_DAYS: 3, SAFETY_STOCK: 1, SAFETY_BW: 2,
  BATCH: 25, BATCH_BW: 50, MIN_ORDER_PER_CODE: 25,
  WMA_PERIOD1_DAYS: 14, WMA_PERIOD1_WEIGHT: 0.70, WMA_PERIOD2_WEIGHT: 0.30,
  ANOMALY_MULTIPLIER: 3, LEAD_TIME_DAYS: 3,
  BESTSELLER_VELOCITY: 5, SLOWMOVER_VELOCITY: 2,
  CRITICAL_DAYS: 2, WARNING_DAYS: 4, ATTENTION_DAYS: 7,
};

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

function isBlackWhite(kode: string): boolean {
  const upper = kode.toUpperCase();
  return COLOR_BLACK.some(k => upper.includes(k)) || COLOR_WHITE.some(k => upper.includes(k));
}

function computeVelocity(sales: any[], productId: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const p1Start = new Date(now.getTime() - RULES.WMA_PERIOD1_DAYS * 86400000);
  const p2Start = new Date(now.getTime() - 30 * 86400000);

  const daily: Record<string, number> = {};
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const key = s.created_at.slice(0, 10);
    daily[key] = (daily[key] ?? 0) + s.qty_pesan;
  }

  const allQty = Object.values(daily);
  const avg = allQty.length > 0 ? allQty.reduce((a, b) => a + b, 0) / allQty.length : 0;
  const anomaly = avg * RULES.ANOMALY_MULTIPLIER;

  let p1T = 0, p1D = 0, p2T = 0, p2D = 0;
  for (const [dk, qty] of Object.entries(daily)) {
    if (anomaly > 0 && qty > anomaly) continue;
    const d = new Date(dk + "T00:00:00");
    if (d >= p1Start) { p1T += qty; p1D++; }
    else if (d >= p2Start) { p2T += qty; p2D++; }
  }

  const totalDays = p1D + p2D;
  const totalQty = p1T + p2T;
  const v1 = p1D > 0 ? p1T / Math.max(RULES.WMA_PERIOD1_DAYS, 7) : 0;
  const v2 = p2D > 0 ? p2T / Math.max(16, 7) : 0;

  let vel: number;
  if (totalDays >= 7) vel = v1 * RULES.WMA_PERIOD1_WEIGHT + v2 * RULES.WMA_PERIOD2_WEIGHT;
  else if (totalDays > 0) vel = totalQty / 7;
  else vel = 0;

  // Maturity dampening
  if (totalDays > 0 && totalDays < 3) vel /= (3 / totalDays);
  if (totalDays === 1 && vel > 20) vel *= 0.5;
  if (totalDays > 0 && totalDays < 7 && totalQty >= 20) vel *= 0.55;

  return Math.round(vel * 100) / 100;
}

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const [productsRes, stockOutRes] = await Promise.all([
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah), prices(harga_modal, harga_normal)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, qty_pesan, total_harga, toko, created_at").gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).limit(5000),
    ]);

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    const products = rawProducts.map((p: any) => {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      return { ...p, _stok: stk?.jumlah ?? 0, _modal: prc?.harga_modal ?? 0 };
    });

    // Compute analysis for each product
    const analyses = products.map((p: any) => {
      const vel = computeVelocity(stockOut, p.id);
      const isBW = isBlackWhite(p.kode);
      const safety = isBW ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
      const dos = vel > 0 ? p._stok / vel : (p._stok > 0 ? 999 : 0);
      const targetDays = RULES.CYCLE_DAYS + safety + RULES.LEAD_TIME_DAYS;
      const targetStock = Math.ceil(vel * targetDays);
      const butuh = targetStock - p._stok;
      let dosStatus = "SAFE";
      if (dos <= RULES.CRITICAL_DAYS) dosStatus = "CRITICAL";
      else if (dos <= RULES.WARNING_DAYS) dosStatus = "WARNING";
      else if (dos <= RULES.ATTENTION_DAYS) dosStatus = "ATTENTION";

      return { kode: p.kode, stok: p._stok, vel, dos: Math.round(dos * 10) / 10, dosStatus, butuh: Math.max(0, butuh), isBestSeller: vel >= RULES.BESTSELLER_VELOCITY };
    }).filter((a: any) => !(a.stok === 0 && a.vel < RULES.SLOWMOVER_VELOCITY));

    const critical = analyses.filter((a: any) => a.dosStatus === "CRITICAL");
    const warning = analyses.filter((a: any) => a.dosStatus === "WARNING");
    const bestSellers = analyses.filter((a: any) => a.isBestSeller);
    const needRestock = analyses.filter((a: any) => a.butuh > 0);

    // Sales stats
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSales = stockOut.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
    const totalOmzet = recentSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const totalPcs = recentSales.reduce((s: number, r: any) => s + (r.qty_pesan || 0), 0);

    // Trend comparison
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const lastWeekSales = stockOut.filter((s: any) => {
      const d = new Date(s.created_at);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    });
    const lastWeekOmzet = lastWeekSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const omzetTrend = lastWeekOmzet > 0 ? ((totalOmzet - lastWeekOmzet) / lastWeekOmzet * 100).toFixed(1) : "N/A";

    const prompt = `Kamu adalah asisten toko RRCollections (toko benang craft).
Kasih 3-5 tips singkat buat boss berdasarkan kondisi toko hari ini.

KONDISI TOKO:
- ${products.length} produk aktif, total stok ${products.reduce((s: number, p: any) => s + p._stok, 0)} pcs
- ${critical.length} produk darurat (stok tinggal 1-2 hari, bisa habis besok!)
- ${warning.length} produk mulai menipis (stok cukup 3-4 hari)
- ${bestSellers.length} produk paling laris (laku ≥ 5 pcs/hari)
- ${needRestock.length} produk perlu diorder lagi
- Omzet 7 hari: Rp ${totalOmzet.toLocaleString("id-ID")} (${totalPcs} pcs)
- Dibanding minggu lalu: ${omzetTrend}%

PRODUK DARURAT (bisa habis besok-lusa):
${critical.slice(0, 5).map((a: any) => `${a.kode}: stok ${a.stok}, laku ${a.vel} pcs/hari, cukup ${a.dos} hari lagi`).join("\n") || "Tidak ada — semua aman 👍"}

PRODUK PALING LARIS:
${bestSellers.slice(0, 5).map((a: any) => `${a.kode}: laku ${a.vel} pcs/hari, stok ${a.stok}, cukup ${a.dos} hari`).join("\n") || "Tidak ada"}

ATURAN:
- Bahasa Indonesia santai, kayak ngobrol sama temen
- JANGAN pakai istilah teknis (velocity, DOS, WMA, threshold, engine, dsb)
- Pakai bahasa awam: "laku X pcs/hari", "stok cukup X hari", "perlu order X pcs"
- Maks 3-5 bullet points, setiap point ada langkah konkret
- Emoji di awal setiap point 😊
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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
