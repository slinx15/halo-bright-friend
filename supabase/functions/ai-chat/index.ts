import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Engine Rules (EXACT parity with web app stockAnalyticsEngine.ts) ───
const RULES = {
  CYCLE_DAYS: 3,
  SAFETY_STOCK: 1,
  SAFETY_BW: 2,
  BATCH: 25,
  BATCH_BW: 50,
  MIN_ORDER_PER_CODE: 25,
  WMA_PERIOD1_DAYS: 14,
  WMA_PERIOD1_WEIGHT: 0.70,
  WMA_PERIOD2_WEIGHT: 0.30,
  ANOMALY_MULTIPLIER: 3,
  LEAD_TIME_DAYS: 3,
  BESTSELLER_VELOCITY: 5,
  SLOWMOVER_VELOCITY: 2,
  CRITICAL_DAYS: 2,
  WARNING_DAYS: 4,
  ATTENTION_DAYS: 7,
  NEW_PRODUCT_WAIT_DAYS: 7,
  NEW_PRODUCT_DEFAULT_VEL: 1,
};

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

function isBlackWhite(kode: string): boolean {
  const upper = kode.toUpperCase();
  return COLOR_BLACK.some(k => upper.includes(k)) || COLOR_WHITE.some(k => upper.includes(k));
}

function getBatchSize(kode: string): number {
  return isBlackWhite(kode) ? RULES.BATCH_BW : RULES.BATCH;
}

function getSafetyDays(kode: string): number {
  return isBlackWhite(kode) ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
}

function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

interface SaleRecord {
  product_id: string;
  qty_pesan: number;
  created_at: string;
}

interface ProductData {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  _stok: number;
  _hargaModal: number;
  _tumpukan: number[] | null;
}

// ─── WMA Velocity Calculator (EXACT parity) ───
function computeWMAVelocity(sales: SaleRecord[], productId: string): { velocity: number; totalQty: number; salesDays: number; dataStatus: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const period1Start = new Date(now.getTime() - RULES.WMA_PERIOD1_DAYS * 86400000);
  const period2Start = new Date(now.getTime() - 30 * 86400000);

  // Build daily sales map
  const dailySales: Record<string, number> = {};
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const key = s.created_at.slice(0, 10);
    dailySales[key] = (dailySales[key] ?? 0) + s.qty_pesan;
  }

  // Anomaly detection
  const allQty = Object.values(dailySales);
  const avgDaily = allQty.length > 0 ? allQty.reduce((a, b) => a + b, 0) / allQty.length : 0;
  const anomalyThreshold = avgDaily * RULES.ANOMALY_MULTIPLIER;

  let p1Total = 0, p1Days = 0, p2Total = 0, p2Days = 0;
  for (const [dateKey, qty] of Object.entries(dailySales)) {
    if (anomalyThreshold > 0 && qty > anomalyThreshold) continue;
    const d = new Date(dateKey + "T00:00:00");
    if (d >= period1Start) { p1Total += qty; p1Days++; }
    else if (d >= period2Start) { p2Total += qty; p2Days++; }
  }

  const totalDays = p1Days + p2Days;
  const totalQty = p1Total + p2Total;
  const minDays = 7;

  const p1CalDays = RULES.WMA_PERIOD1_DAYS;
  const p2CalDays = 30 - RULES.WMA_PERIOD1_DAYS;
  const vel1 = p1Days > 0 ? p1Total / Math.max(p1CalDays, minDays) : 0;
  const vel2 = p2Days > 0 ? p2Total / Math.max(p2CalDays, minDays) : 0;

  let velocity: number;
  let dataStatus: string;

  if (totalDays >= 14) {
    velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT;
    dataStatus = "full";
  } else if (totalDays >= 7) {
    velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT;
    dataStatus = "partial";
  } else if (totalDays > 0) {
    velocity = totalQty / minDays;
    dataStatus = "minimal";
  } else {
    velocity = 0;
    dataStatus = "none";
  }

  // Maturity dampening
  if (totalDays > 0 && totalDays < 3) {
    velocity = velocity / (3 / totalDays);
  }
  if (totalDays === 1 && velocity > 20) {
    velocity = velocity * 0.5;
  }
  if (totalDays > 0 && totalDays < 7 && totalQty >= 20) {
    velocity = velocity * 0.55;
  }

  return { velocity: Math.round(velocity * 100) / 100, totalQty, salesDays: totalDays, dataStatus };
}

// ─── Analyze Single Product (EXACT parity) ───
function analyzeProduct(product: ProductData, sales: SaleRecord[], firstSaleDates: Record<string, string>) {
  const stok = product._stok;
  const isBW = isBlackWhite(product.kode);
  const batch = getBatchSize(product.kode);
  const safety = getSafetyDays(product.kode);

  const { velocity, totalQty, salesDays, dataStatus } = computeWMAVelocity(sales, product.id);

  // New product check
  const firstSale = firstSaleDates[product.id];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const ageDays = firstSale ? Math.floor((now.getTime() - new Date(firstSale).getTime()) / 86400000) : 999;
  const isNew = ageDays < RULES.NEW_PRODUCT_WAIT_DAYS;
  const finalVelocity = isNew ? RULES.NEW_PRODUCT_DEFAULT_VEL : velocity;

  // Skip slow movers with zero stock
  if (stok === 0 && finalVelocity < RULES.SLOWMOVER_VELOCITY) return null;

  const dos = finalVelocity > 0 ? stok / finalVelocity : (stok > 0 ? 999 : 0);
  const targetDays = RULES.CYCLE_DAYS + safety + RULES.LEAD_TIME_DAYS;
  const targetStock = Math.ceil(finalVelocity * targetDays);
  let butuh = targetStock - stok;

  if (stok === 0 && finalVelocity > 0 && butuh <= 0) butuh = batch;

  let rekomendasi = 0;
  if (butuh > 0) {
    if (isBW) {
      rekomendasi = Math.max(batch, roundUpToBatch(butuh, batch));
    } else {
      rekomendasi = Math.max(RULES.MIN_ORDER_PER_CODE, roundUpToBatch(butuh, RULES.MIN_ORDER_PER_CODE));
    }
  }

  // Safety clamp
  const maxStock = Math.ceil(finalVelocity * (targetDays + 3));
  if (stok + rekomendasi > maxStock && rekomendasi > 0) {
    rekomendasi = Math.max(0, roundUpToBatch(maxStock - stok, batch));
  }

  let dosStatus: string;
  if (dos <= RULES.CRITICAL_DAYS) dosStatus = "CRITICAL";
  else if (dos <= RULES.WARNING_DAYS) dosStatus = "WARNING";
  else if (dos <= RULES.ATTENTION_DAYS) dosStatus = "ATTENTION";
  else dosStatus = "SAFE";

  const isBestSeller = finalVelocity >= RULES.BESTSELLER_VELOCITY;
  const cost = rekomendasi * product._hargaModal;

  return {
    kode: product.kode,
    nama: product.nama,
    stok,
    velocity: finalVelocity,
    dos: Math.round(dos * 10) / 10,
    dosStatus,
    rekomendasi,
    targetStock,
    cost,
    isBestSeller,
    isStockOut: stok === 0,
    dataStatus,
    salesDays,
    totalQty,
  };
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Fetch 30-day data (matching web app engine)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString();

    const [productsRes, stockOutRes] = await Promise.all([
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah, tumpukan_detail), prices(harga_modal, harga_normal, harga_grosir)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, qty_pesan, total_harga, harga_satuan, harga_type, toko, created_at").gte("created_at", cutoffStr).order("created_at", { ascending: false }).limit(5000),
    ]);

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    // Normalize
    const products: ProductData[] = rawProducts.map((p: any) => {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      return {
        id: p.id,
        kode: p.kode,
        nama: p.nama,
        kategori: p.kategori,
        _stok: stk?.jumlah ?? 0,
        _hargaModal: prc?.harga_modal ?? 0,
        _tumpukan: stk?.tumpukan_detail ?? null,
      };
    });

    // Find first sale dates
    const firstSaleDates: Record<string, string> = {};
    for (const s of stockOut) {
      if (!firstSaleDates[s.product_id] || s.created_at < firstSaleDates[s.product_id]) {
        firstSaleDates[s.product_id] = s.created_at;
      }
    }

    // Run analysis on all products (same as web app engine)
    const analyses = products
      .map(p => analyzeProduct(p, stockOut, firstSaleDates))
      .filter(Boolean)
      .sort((a: any, b: any) => {
        // Sort: CRITICAL first, then by velocity desc
        const statusOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, ATTENTION: 2, SAFE: 3 };
        const diff = (statusOrder[a.dosStatus] ?? 4) - (statusOrder[b.dosStatus] ?? 4);
        return diff !== 0 ? diff : b.velocity - a.velocity;
      });

    // Build analysis summary for AI
    const critical = analyses.filter((a: any) => a.dosStatus === "CRITICAL");
    const warning = analyses.filter((a: any) => a.dosStatus === "WARNING");
    const bestSellers = analyses.filter((a: any) => a.isBestSeller);
    const needRestock = analyses.filter((a: any) => a.rekomendasi > 0);
    const totalRestockCost = needRestock.reduce((s: number, a: any) => s + a.cost, 0);
    const totalRestockQty = needRestock.reduce((s: number, a: any) => s + a.rekomendasi, 0);

    // Sales stats
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSales = stockOut.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
    const totalOmzet7d = recentSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const totalPcs7d = recentSales.reduce((s: number, r: any) => s + (r.qty_pesan || 0), 0);

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

    // Format analysis data for prompt
    const criticalList = critical.slice(0, 15).map((a: any) =>
      `${a.kode} (${a.nama}): stok ${a.stok}, vel ${a.velocity}/hari, DOS ${a.dos} hari, restock ${a.rekomendasi} pcs (Rp ${a.cost.toLocaleString("id-ID")})`
    ).join("\n");

    const warningList = warning.slice(0, 10).map((a: any) =>
      `${a.kode}: stok ${a.stok}, vel ${a.velocity}/hari, DOS ${a.dos} hari, restock ${a.rekomendasi} pcs`
    ).join("\n");

    const bestSellerList = bestSellers.slice(0, 10).map((a: any) =>
      `${a.kode}: vel ${a.velocity}/hari, stok ${a.stok}, DOS ${a.dos} hari`
    ).join("\n");

    const restockSummary = needRestock.slice(0, 20).map((a: any) =>
      `${a.kode}: restock ${a.rekomendasi} pcs (${a.dosStatus}, vel ${a.velocity}/hari, stok ${a.stok})`
    ).join("\n");

    // Full product list (compact)
    const allProductsList = products.map((p: any) => {
      const analysis = analyses.find((a: any) => a.kode === p.kode);
      if (analysis) {
        return `${p.kode}|${p.nama}|stok:${p._stok}|vel:${analysis.velocity}/hari|DOS:${analysis.dos}|status:${analysis.dosStatus}|restock:${analysis.rekomendasi}|modal:${p._hargaModal}`;
      }
      return `${p.kode}|${p.nama}|stok:${p._stok}|modal:${p._hargaModal}|kat:${p.kategori || '-'}`;
    }).join("\n");

    const systemPrompt = `Kamu adalah AI analyst untuk RRCollections, toko benang craft.
Kamu membantu boss/pemilik toko menganalisa stok, penjualan, dan keputusan bisnis.
Kamu menggunakan MESIN ANALISIS yang SAMA dengan web app — data di bawah sudah dihitung oleh engine yang sama.

═══ RINGKASAN ANALISIS (dari Engine) ═══
- Total produk aktif: ${products.length}
- Total stok: ${products.reduce((s, p) => s + p._stok, 0)} pcs
- Produk stok kosong: ${products.filter(p => p._stok === 0).length}
- Produk KRITIS (DOS ≤ 2 hari): ${critical.length}
- Produk WARNING (DOS ≤ 4 hari): ${warning.length}
- Best sellers (velocity ≥ 5/hari): ${bestSellers.length}
- Perlu restock: ${needRestock.length} produk, total ${totalRestockQty} pcs, estimasi Rp ${totalRestockCost.toLocaleString("id-ID")}

═══ PENJUALAN 7 HARI TERAKHIR ═══
- Total omzet: Rp ${totalOmzet7d.toLocaleString("id-ID")}
- Total pcs terjual: ${totalPcs7d}
- Top pelanggan: ${topCustomers.join("; ") || "Belum ada data"}

═══ PRODUK KRITIS (HARUS SEGERA RESTOCK) ═══
${criticalList || "Tidak ada produk kritis"}

═══ PRODUK WARNING ═══
${warningList || "Tidak ada"}

═══ BEST SELLERS ═══
${bestSellerList || "Tidak ada"}

═══ REKOMENDASI RESTOCK (diurutkan prioritas) ═══
${restockSummary || "Tidak ada rekomendasi"}

═══ SEMUA PRODUK (kode|nama|stok|velocity|DOS|status|restock|modal) ═══
${allProductsList}

═══ CARA ENGINE BERPIKIR (gunakan ini saat menjawab) ═══
1. VELOCITY dihitung pakai WMA (Weighted Moving Average) 30 hari:
   - 14 hari terakhir diberi bobot 70%, 16 hari sebelumnya 30%
   - Menggunakan qty_pesan (pesanan) bukan qty_kirim, karena qty_pesan mencerminkan demand asli
   - Anomali (lonjakan > 3x rata-rata) otomatis dibuang
   - Produk baru (< 7 hari) diberi velocity default 1/hari

2. DAYS OF STOCK (DOS) = stok saat ini / velocity per hari
   - CRITICAL: DOS ≤ 2 hari → HARUS restock SEGERA
   - WARNING: DOS ≤ 4 hari → perlu restock minggu ini
   - ATTENTION: DOS ≤ 7 hari → pantau terus
   - SAFE: DOS > 7 hari → aman

3. RESTOCK = (cycle 3 hari + safety + lead time 3 hari) × velocity − stok
   - Safety: 1 hari (warna), 2 hari (hitam/putih)
   - Dibulatkan ke kelipatan 25 (warna) atau 50 (hitam/putih)
   - Minimum order: 25 pcs per kode (50 untuk BW)
   - Safety clamp mencegah overstock

4. BEST SELLER = velocity ≥ 5/hari
5. SLOW MOVER = velocity < 2/hari (skip jika stok kosong)

═══ ATURAN RESPON ═══
1. Jawab dalam Bahasa Indonesia, gaya ringkas dan to-the-point
2. SELALU gunakan data yang sudah dihitung engine di atas — jangan hitung ulang sendiri
3. Saat rekomendasi restock, SELALU gunakan angka dari kolom "restock" di atas
4. Gunakan emoji secukupnya
5. Format dengan markdown (bold, list, dll)
6. Jangan mengarang data — hanya pakai data yang tersedia
7. Jika user tanya produk tertentu, CARI di daftar produk dan berikan: stok, velocity, DOS, status, rekomendasi restock
8. Jika ditanya hal di luar konteks toko, bilang fokusmu adalah membantu bisnis RRCollections
9. Jelaskan alasan di balik rekomendasi (misal: "velocity tinggi 8/hari tapi stok tinggal 10, DOS hanya 1.3 hari")`;

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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis, silakan top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
