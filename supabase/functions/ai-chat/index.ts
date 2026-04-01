import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Engine Rules (EXACT parity with web app stockAnalyticsEngine.ts) ───
const RULES = {
  CYCLE_DAYS: 3, SAFETY_STOCK: 1, SAFETY_BW: 2,
  BATCH: 25, BATCH_BW: 50, MIN_ORDER_PER_CODE: 25,
  WMA_PERIOD1_DAYS: 14, WMA_PERIOD1_WEIGHT: 0.70, WMA_PERIOD2_WEIGHT: 0.30,
  ANOMALY_MULTIPLIER: 3, LEAD_TIME_DAYS: 3,
  BESTSELLER_VELOCITY: 5, SLOWMOVER_VELOCITY: 2,
  CRITICAL_DAYS: 2, WARNING_DAYS: 4, ATTENTION_DAYS: 7,
  NEW_PRODUCT_WAIT_DAYS: 7, NEW_PRODUCT_DEFAULT_VEL: 1,
};

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

function isBlackWhite(kode: string): boolean {
  const upper = kode.toUpperCase();
  return COLOR_BLACK.some(k => upper.includes(k)) || COLOR_WHITE.some(k => upper.includes(k));
}
function getBatchSize(kode: string): number { return isBlackWhite(kode) ? RULES.BATCH_BW : RULES.BATCH; }
function getSafetyDays(kode: string): number { return isBlackWhite(kode) ? RULES.SAFETY_BW : RULES.SAFETY_STOCK; }
function roundUpToBatch(qty: number, batch: number): number { return qty <= 0 ? 0 : Math.ceil(qty / batch) * batch; }

interface SaleRecord { product_id: string; qty_pesan: number; created_at: string; }
interface ProductData { id: string; kode: string; nama: string; kategori: string | null; _stok: number; _hargaModal: number; _hargaNormal: number; _hargaGrosir: number; _hargaGrosir2: number; _tumpukan: number[] | null; }

function computeWMAVelocity(sales: SaleRecord[], productId: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const period1Start = new Date(now.getTime() - RULES.WMA_PERIOD1_DAYS * 86400000);
  const period2Start = new Date(now.getTime() - 30 * 86400000);
  const dailySales: Record<string, number> = {};
  for (const s of sales) { if (s.product_id !== productId) continue; const key = s.created_at.slice(0, 10); dailySales[key] = (dailySales[key] ?? 0) + s.qty_pesan; }
  const allQty = Object.values(dailySales);
  const avgDaily = allQty.length > 0 ? allQty.reduce((a, b) => a + b, 0) / allQty.length : 0;
  const anomalyThreshold = avgDaily * RULES.ANOMALY_MULTIPLIER;
  let p1Total = 0, p1Days = 0, p2Total = 0, p2Days = 0;
  for (const [dateKey, qty] of Object.entries(dailySales)) {
    if (anomalyThreshold > 0 && qty > anomalyThreshold) continue;
    const d = new Date(dateKey + "T00:00:00");
    if (d >= period1Start) { p1Total += qty; p1Days++; } else if (d >= period2Start) { p2Total += qty; p2Days++; }
  }
  const totalDays = p1Days + p2Days; const totalQty = p1Total + p2Total; const minDays = 7;
  const vel1 = p1Days > 0 ? p1Total / Math.max(RULES.WMA_PERIOD1_DAYS, minDays) : 0;
  const vel2 = p2Days > 0 ? p2Total / Math.max(30 - RULES.WMA_PERIOD1_DAYS, minDays) : 0;
  let velocity: number, dataStatus: string;
  if (totalDays >= 7) { velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT; dataStatus = totalDays >= 14 ? "full" : "partial"; }
  else if (totalDays > 0) { velocity = totalQty / minDays; dataStatus = "minimal"; }
  else { velocity = 0; dataStatus = "none"; }
  if (totalDays > 0 && totalDays < 3) velocity /= (3 / totalDays);
  if (totalDays === 1 && velocity > 20) velocity *= 0.5;
  if (totalDays > 0 && totalDays < 7 && totalQty >= 20) velocity *= 0.55;
  return { velocity: Math.round(velocity * 100) / 100, totalQty, salesDays: totalDays, dataStatus };
}

function analyzeProduct(product: ProductData, sales: SaleRecord[], firstSaleDates: Record<string, string>) {
  const stok = product._stok; const isBW = isBlackWhite(product.kode);
  const batch = getBatchSize(product.kode); const safety = getSafetyDays(product.kode);
  const { velocity, totalQty, salesDays, dataStatus } = computeWMAVelocity(sales, product.id);
  const firstSale = firstSaleDates[product.id];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const ageDays = firstSale ? Math.floor((now.getTime() - new Date(firstSale).getTime()) / 86400000) : 999;
  const isNew = ageDays < RULES.NEW_PRODUCT_WAIT_DAYS;
  const finalVelocity = isNew ? RULES.NEW_PRODUCT_DEFAULT_VEL : velocity;
  if (stok === 0 && finalVelocity < RULES.SLOWMOVER_VELOCITY) return null;
  const dos = finalVelocity > 0 ? stok / finalVelocity : (stok > 0 ? 999 : 0);
  const targetDays = RULES.CYCLE_DAYS + safety + RULES.LEAD_TIME_DAYS;
  const targetStock = Math.ceil(finalVelocity * targetDays);
  let butuh = targetStock - stok;
  if (stok === 0 && finalVelocity > 0 && butuh <= 0) butuh = batch;
  let rekomendasi = 0;
  if (butuh > 0) { rekomendasi = isBW ? Math.max(batch, roundUpToBatch(butuh, batch)) : Math.max(RULES.MIN_ORDER_PER_CODE, roundUpToBatch(butuh, RULES.MIN_ORDER_PER_CODE)); }
  const maxStock = Math.ceil(finalVelocity * (targetDays + 3));
  if (stok + rekomendasi > maxStock && rekomendasi > 0) rekomendasi = Math.max(0, roundUpToBatch(maxStock - stok, batch));
  let dosStatus: string;
  if (dos <= RULES.CRITICAL_DAYS) dosStatus = "CRITICAL"; else if (dos <= RULES.WARNING_DAYS) dosStatus = "WARNING"; else if (dos <= RULES.ATTENTION_DAYS) dosStatus = "ATTENTION"; else dosStatus = "SAFE";
  return { kode: product.kode, nama: product.nama, stok, velocity: finalVelocity, dos: Math.round(dos * 10) / 10, dosStatus, rekomendasi, targetStock, cost: rekomendasi * product._hargaModal, isBestSeller: finalVelocity >= RULES.BESTSELLER_VELOCITY, isStockOut: stok === 0, dataStatus, salesDays, totalQty };
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, conversation_id, extract_memories, research_mode } = await req.json();

    // ─── Load memories for context ───
    const { data: memories } = await supabase
      .from("ai_memories")
      .select("category, content, created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    const memoryBlock = memories && memories.length > 0
      ? memories.map((m: any) => `[${m.category.toUpperCase()}] ${m.content}`).join("\n")
      : "Belum ada catatan tersimpan.";

    // ─── If this is a memory extraction request (post-response) ───
    if (extract_memories && messages.length >= 2) {
      const lastUserMsg = messages.filter((m: any) => m.role === "user").pop()?.content || "";
      const lastAiMsg = messages.filter((m: any) => m.role === "assistant").pop()?.content || "";

      const extractPrompt = `Analisis percakapan berikut dan extract informasi PENTING yang perlu diingat untuk jangka panjang.

PERCAKAPAN:
User: ${lastUserMsg}
AI: ${lastAiMsg}

KATEGORIKAN setiap memory ke salah satu:
- keputusan: keputusan bisnis yang diambil (misal: "Boss memutuskan untuk mulai jual online di Shopee")
- project: rencana/project yang sedang dikerjakan (misal: "Project: Ekspansi ke TikTok Shop, target bulan depan")  
- target: target bisnis (misal: "Target omzet Rp 50 juta/bulan")
- catatan: informasi penting tentang bisnis (misal: "Supplier utama benang adalah PT XYZ")
- ide: ide bisnis yang muncul (misal: "Ide: Bikin bundling benang + jarum untuk pemula")

ATURAN:
- HANYA extract yang benar-benar penting dan layak diingat jangka panjang
- Jangan extract hal sepele seperti "user tanya soal stok"
- Tulis dalam kalimat singkat dan jelas
- Kalau tidak ada yang perlu diingat, return array kosong

Return HANYA JSON array (tanpa markdown code block):
[{"category": "keputusan", "content": "..."}]
atau [] jika tidak ada yang perlu diingat.`;

      try {
        const extractResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: extractPrompt }], stream: false }),
        });

        if (extractResp.ok) {
          const extractData = await extractResp.json();
          const content = extractData.choices?.[0]?.message?.content || "[]";
          try {
            const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            const newMemories = JSON.parse(cleaned);
            if (Array.isArray(newMemories) && newMemories.length > 0) {
              for (const mem of newMemories) {
                if (mem.category && mem.content) {
                  await supabase.from("ai_memories").insert({
                    user_id: user.id,
                    category: mem.category,
                    content: mem.content,
                    source_conversation_id: conversation_id || null,
                  });
                }
              }
            }
          } catch { /* parsing failed, skip */ }
        }
      } catch { /* extraction failed, skip silently */ }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Fetch business data ───
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const [productsRes, stockOutRes] = await Promise.all([
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah, tumpukan_detail), prices(harga_modal, harga_normal, harga_grosir, harga_grosir2)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, qty_pesan, total_harga, harga_satuan, harga_type, toko, created_at").gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).limit(5000),
    ]);

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];
    const products: ProductData[] = rawProducts.map((p: any) => {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      return { id: p.id, kode: p.kode, nama: p.nama, kategori: p.kategori, _stok: stk?.jumlah ?? 0, _hargaModal: prc?.harga_modal ?? 0, _hargaNormal: prc?.harga_normal ?? 0, _hargaGrosir: prc?.harga_grosir ?? 0, _hargaGrosir2: prc?.harga_grosir2 ?? 0, _tumpukan: stk?.tumpukan_detail ?? null };
    });

    const firstSaleDates: Record<string, string> = {};
    for (const s of stockOut) { if (!firstSaleDates[s.product_id] || s.created_at < firstSaleDates[s.product_id]) firstSaleDates[s.product_id] = s.created_at; }

    const analyses = products.map(p => analyzeProduct(p, stockOut, firstSaleDates)).filter(Boolean)
      .sort((a: any, b: any) => { const o: Record<string, number> = { CRITICAL: 0, WARNING: 1, ATTENTION: 2, SAFE: 3 }; const d = (o[a.dosStatus] ?? 4) - (o[b.dosStatus] ?? 4); return d !== 0 ? d : b.velocity - a.velocity; });

    const critical = analyses.filter((a: any) => a.dosStatus === "CRITICAL");
    const warning = analyses.filter((a: any) => a.dosStatus === "WARNING");
    const bestSellers = analyses.filter((a: any) => a.isBestSeller);
    const needRestock = analyses.filter((a: any) => a.rekomendasi > 0);
    const totalRestockCost = needRestock.reduce((s: number, a: any) => s + a.cost, 0);
    const totalRestockQty = needRestock.reduce((s: number, a: any) => s + a.rekomendasi, 0);

    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSales = stockOut.filter((s: any) => new Date(s.created_at) >= sevenDaysAgo);
    const totalOmzet7d = recentSales.reduce((s: number, r: any) => s + (r.total_harga || 0), 0);
    const totalPcs7d = recentSales.reduce((s: number, r: any) => s + (r.qty_pesan || 0), 0);

    const salesByToko: Record<string, { pcs: number; omzet: number }> = {};
    recentSales.forEach((s: any) => { const t = s.toko || "Tanpa nama"; if (!salesByToko[t]) salesByToko[t] = { pcs: 0, omzet: 0 }; salesByToko[t].pcs += s.qty_pesan; salesByToko[t].omzet += s.total_harga; });
    const topCustomers = Object.entries(salesByToko).sort(([, a], [, b]) => b.omzet - a.omzet).slice(0, 5).map(([name, data]) => `${name}: ${data.pcs} pcs, Rp ${data.omzet.toLocaleString("id-ID")}`);

    const criticalList = critical.slice(0, 15).map((a: any) => `${a.kode} (${a.nama}): stok ${a.stok}, laku ${a.velocity}/hari, cukup ${a.dos} hari, order ${a.rekomendasi} pcs (Rp ${a.cost.toLocaleString("id-ID")})`).join("\n");
    const warningList = warning.slice(0, 10).map((a: any) => `${a.kode}: stok ${a.stok}, laku ${a.velocity}/hari, cukup ${a.dos} hari, order ${a.rekomendasi} pcs`).join("\n");
    const bestSellerList = bestSellers.slice(0, 10).map((a: any) => `${a.kode}: laku ${a.velocity}/hari, stok ${a.stok}, cukup ${a.dos} hari`).join("\n");
    const restockSummary = needRestock.slice(0, 20).map((a: any) => `${a.kode}: order ${a.rekomendasi} pcs (${a.dosStatus === "CRITICAL" ? "darurat" : a.dosStatus === "WARNING" ? "menipis" : "pantau"}, laku ${a.velocity}/hari, stok ${a.stok})`).join("\n");
    const allProductsList = products.map((p: any) => { const a = analyses.find((x: any) => x.kode === p.kode); return a ? `${p.kode}|${p.nama}|stok:${p._stok}|laku:${a.velocity}/hari|cukup:${a.dos}hari|status:${a.dosStatus}|order:${a.rekomendasi}|modal:${p._hargaModal}` : `${p.kode}|${p.nama}|stok:${p._stok}|modal:${p._hargaModal}|kat:${p.kategori || '-'}`; }).join("\n");

    // ─── Hari Ramai Analysis ───
    const HARI_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const dayBuckets: Record<number, { pcs: number; dates: Set<string> }> = {};
    for (let i = 0; i < 7; i++) dayBuckets[i] = { pcs: 0, dates: new Set() };
    const hourBuckets: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourBuckets[i] = 0;
    for (const s of stockOut) {
      const d = new Date(s.created_at);
      dayBuckets[d.getDay()].pcs += s.qty_kirim;
      dayBuckets[d.getDay()].dates.add(s.created_at.slice(0, 10));
      hourBuckets[d.getHours()] += s.qty_kirim;
    }
    const hariRamaiData = Object.entries(dayBuckets).map(([i, d]) => {
      const weeks = d.dates.size || 1;
      return { hari: HARI_NAMES[Number(i)], avgPcs: Math.round(d.pcs / weeks) };
    }).sort((a, b) => b.avgPcs - a.avgPcs);
    const jamRamaiData = Object.entries(hourBuckets).filter(([, pcs]) => pcs > 0).sort(([, a], [, b]) => b - a).slice(0, 5);
    const hariRamaiBlock = `HARI RAMAI (rata-rata pcs/hari):\n${hariRamaiData.map(h => `${h.hari}: ${h.avgPcs} pcs`).join(", ")}\nJAM RAMAI (top 5): ${jamRamaiData.map(([h, pcs]) => `${String(h).padStart(2, "0")}:00 (${pcs} pcs)`).join(", ")}`;

    // ─── Repeat Customer Analysis ───
    const tokoOrderData: Record<string, { dates: string[]; totalQty: number; totalTrx: number; favs: Record<string, number> }> = {};
    for (const s of stockOut) {
      const toko = (s.toko ?? "").trim().toUpperCase();
      if (!toko) continue;
      if (!tokoOrderData[toko]) tokoOrderData[toko] = { dates: [], totalQty: 0, totalTrx: 0, favs: {} };
      const td = tokoOrderData[toko];
      td.dates.push(s.created_at.slice(0, 10));
      td.totalQty += s.qty_kirim;
      td.totalTrx += 1;
      const prod = products.find((p: any) => p.id === s.product_id);
      if (prod) td.favs[prod.kode] = (td.favs[prod.kode] ?? 0) + s.qty_kirim;
    }
    const nowMs = Date.now();
    const customerAnalysis: { nama: string; status: string; siklus: number; terlambat: number; lastOrder: string; totalQty: number; favs: string }[] = [];
    for (const [nama, td] of Object.entries(tokoOrderData)) {
      const uniqueDays = [...new Set(td.dates)].sort();
      const lastOrderDate = new Date(uniqueDays[uniqueDays.length - 1]);
      const daysSinceLast = Math.floor((nowMs - lastOrderDate.getTime()) / 86400000);
      let avgCycle = 0;
      if (uniqueDays.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < uniqueDays.length; i++) {
          const gap = Math.round((new Date(uniqueDays[i]).getTime() - new Date(uniqueDays[i - 1]).getTime()) / 86400000);
          if (gap > 0) gaps.push(gap);
        }
        if (gaps.length > 0) avgCycle = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      }
      const overdue = avgCycle > 0 ? daysSinceLast - avgCycle : 0;
      let status = "reguler";
      if (uniqueDays.length <= 1) status = "baru";
      else if (avgCycle > 0 && overdue > avgCycle * 2) status = "hilang";
      else if (avgCycle > 0 && overdue > avgCycle * 0.5) status = "mulai_hilang";
      else if (uniqueDays.length >= 5 && avgCycle <= 10) status = "VIP";
      const topFavs = Object.entries(td.favs).sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k).join(",");
      customerAnalysis.push({ nama, status, siklus: avgCycle, terlambat: overdue, lastOrder: uniqueDays[uniqueDays.length - 1], totalQty: td.totalQty, favs: topFavs });
    }
    customerAnalysis.sort((a, b) => { const o: Record<string, number> = { mulai_hilang: 0, hilang: 1, VIP: 2, reguler: 3, baru: 4 }; return (o[a.status] ?? 5) - (o[b.status] ?? 5); });
    const atRiskCustomers = customerAnalysis.filter(c => c.status === "mulai_hilang");
    const lostCustomers = customerAnalysis.filter(c => c.status === "hilang");
    const vipCustomers = customerAnalysis.filter(c => c.status === "VIP");
    const repeatBlock = `ANALISA PELANGGAN (${customerAnalysis.length} toko):\nVIP: ${vipCustomers.length} | Mulai hilang: ${atRiskCustomers.length} | Hilang: ${lostCustomers.length}\n` +
      (atRiskCustomers.length > 0 ? `⚠️ MULAI HILANG:\n${atRiskCustomers.map(c => `${c.nama}: siklus ${c.siklus}hr, terakhir ${c.lastOrder}, terlambat ${c.terlambat}hr, beli ${c.totalQty}pcs, favorit: ${c.favs}`).join("\n")}\n` : "") +
      (lostCustomers.length > 0 ? `🚨 HILANG:\n${lostCustomers.map(c => `${c.nama}: siklus ${c.siklus}hr, terakhir ${c.lastOrder}, terlambat ${c.terlambat}hr, beli ${c.totalQty}pcs, favorit: ${c.favs}`).join("\n")}\n` : "") +
      (vipCustomers.length > 0 ? `🏆 VIP:\n${vipCustomers.map(c => `${c.nama}: siklus ${c.siklus}hr, terakhir ${c.lastOrder}, beli ${c.totalQty}pcs, favorit: ${c.favs}`).join("\n")}` : "");

    // ─── Color Trend Analysis ───
    const thisWeekStart = new Date(nowMs - 7 * 86400000);
    const lastWeekStart = new Date(nowMs - 14 * 86400000);
    const colorSales: Record<string, { tw: number; lw: number }> = {};
    for (const s of stockOut) {
      const d = new Date(s.created_at);
      const prod = products.find((p: any) => p.id === s.product_id);
      if (!prod) continue;
      if (!colorSales[prod.kode]) colorSales[prod.kode] = { tw: 0, lw: 0 };
      if (d >= thisWeekStart) colorSales[prod.kode].tw += s.qty_kirim;
      else if (d >= lastWeekStart) colorSales[prod.kode].lw += s.qty_kirim;
    }
    const risingColors = Object.entries(colorSales).filter(([, d]) => d.tw > d.lw && d.tw > 0).sort(([, a], [, b]) => (b.tw - b.lw) - (a.tw - a.lw)).slice(0, 10);
    const fallingColors = Object.entries(colorSales).filter(([, d]) => d.tw < d.lw && d.lw > 0).sort(([, a], [, b]) => (a.tw - a.lw) - (b.tw - b.lw)).slice(0, 10);
    const trendBlock = `TREN WARNA:\n🔥 Naik: ${risingColors.length > 0 ? risingColors.map(([k, d]) => `${k}(${d.lw}→${d.tw})`).join(", ") : "Tidak ada"}\n📉 Turun: ${fallingColors.length > 0 ? fallingColors.map(([k, d]) => `${k}(${d.lw}→${d.tw})`).join(", ") : "Tidak ada"}`;

    // ─── Knowledge Modules ───
    const KNOWLEDGE_MODULES: Record<string, { keywords: string[]; content: string }> = {
      industri: {
        keywords: ["benang", "obras", "craft", "jenis", "supplier", "margin", "musim", "ramai", "sepi", "konveksi", "tailor", "crafter", "polyester", "cotton", "bordir", "rajut", "sulam"],
        content: `📦 INDUSTRI BENANG: Jenis: obras/overlock, jahit, bordir, rajut, sulam, nilon, polyester, cotton. BW (hitam/putih) SELALU paling laris→wajib stok banyak. Warna terang=seasonal. Supplier: Bandung/Solo/Surabaya, lead time 2-5 hari. Margin ideal: 30-50%. Pelanggan: tukang jahit, konveksi, crafter, toko jahit. Ramai: pra-Lebaran, tahun ajaran baru, wedding. Sepi: pasca-Lebaran, awal tahun.`,
      },
      offline: {
        keywords: ["offline", "toko", "grosir", "retail", "walk-in", "loyalitas", "piutang", "nawar", "display", "upsell", "cross-sell", "bundling"],
        content: `🛒 JUALAN OFFLINE: Grosir→pelanggan tetap/konveksi, retail→walk-in. Loyalitas: diskon setia, bonus besar, poin. Piutang: batas kredit, jatuh tempo, follow-up. Nawar→kasih bundling, jangan potong harga. Display: kelompok warna/jenis, rak mudah. Upsell: "Beli 10 cone, harga turun". Cross-sell: obras+jarum+kain perca starter pack.`,
      },
      online: {
        keywords: ["online", "shopee", "tokopedia", "tiktok", "marketplace", "jualan online", "e-commerce", "digital"],
        content: `🌐 JUALAN ONLINE (boss belum online): Platform: Shopee(volume), Tokopedia(trust), TikTok Shop(viral). Mulai: pilih 10-20 best seller, foto bg putih+close-up tekstur, judul SEO "Benang Obras Polyester [WARNA] 5000 Yard Kualitas Premium", harga sedikit>offline, free shipping awal. Marketplace: flash sale↑ranking, bundling, minta review offline→online, live selling demo. Sosmed: IG/TikTok video jahit, WA Business katalog+broadcast, FB Group crafter.`,
      },
      strategi: {
        keywords: ["strategi", "abc", "pareto", "break-even", "cash flow", "pricing", "ekspansi", "kpi", "target", "rencana", "planning", "bisnis"],
        content: `📊 STRATEGI BISNIS: ABC analysis (20% SKU=80% revenue→full stock). Pareto: 20% pelanggan=80% omzet. Break-even: minimal jual/hari tutup operasional. Cash flow: sisakan 2-3 bulan operasional. Pricing: cost-plus(aman), competitive, value-based, psychological(49.900 vs 50.000). Ekspansi: horizontal(jarum,gunting,kain), vertical(distributor), geografis(cabang/online). KPI: omzet, pelanggan baru vs repeat, margin/transaksi, stock turnover, dead stock ratio(>30 hari).`,
      },
      marketing: {
        keywords: ["marketing", "brand", "branding", "promo", "promosi", "seasonal", "persona", "iklan"],
        content: `📈 MARKETING: Brand "RRCollections — Benang Berkualitas, Harga Bersahabat". Persona: konveksi=harga+volume, crafter=variasi+kualitas. Promo: "Beli 20 gratis 2", "50 cone+free ongkir", "Diskon 10% pelanggan pertama", "Happy Hour order<jam 12 kirim hari ini". Seasonal: pra-Ramadan(baju muslim), back-to-school(seragam putih/navy/abu), year-end clearance.`,
      },
      keuangan: {
        keywords: ["keuangan", "profit", "untung", "rugi", "harga", "modal", "margin", "diskon", "investasi", "biaya", "omzet", "pendapatan", "uang"],
        content: `💰 KEUANGAN: Profit=omzet-HPP-operasional(sewa,gaji,listrik,transport). Naikin harga kalau modal naik>5% atau margin<20%. Diskon kalau dead stock atau tarik pelanggan baru. Reinvestasi: stok best seller→peralatan→ekspansi.`,
      },
      psikologi: {
        keywords: ["pelanggan", "closing", "handle", "keberatan", "nawar", "mahal", "psikologi", "langganan", "loyal", "repeat", "customer"],
        content: `🎯 PSIKOLOGI PELANGGAN & CLOSING:
Tipe: Konveksi besar(harga termurah,rutin)→harga khusus+jaminan stok. Konveksi kecil(fleksibel)→"Ambil 20 cone harga turun". Tukang jahit(satuan,loyal)→sample+personal relationship. Crafter(variasi,bayar lebih)→koleksi lengkap+inspirasi. Reseller→harga reseller+margin menarik.
Closing: Urgency("tinggal sedikit"), Social proof("konveksi X juga pakai"), Bundling("paket 5 warna lebih murah"), Trial("coba 5 dulu"), Reciprocity(bonus kecil→hutang budi), Anchoring(harga normal dulu→spesial).
Keberatan: "Mahal"→"Kualitas premium, murah=boros 2x". "Pikir-pikir"→"Harga sampai akhir minggu, mau disisihkan?". "Lain lebih murah"→"Berapa? Cek kualitas+panjang juga". "Ga butuh"→"Menjelang [musim] harga naik".
Langganan: Follow-up WA 1 minggu, kartu nama/stiker, grup WA, loyalty "Beli 10x diskon 15% ke-11", ingat nama pelanggan.
Psikologi harga: ganjil(49.900), "Hemat Rp 5.000" > "Diskon 5%", tampil harga/cone DAN /lusin, jangan turun harga tanpa alasan.`,
      },
      kompetitor: {
        keywords: ["kompetitor", "pesaing", "saingan", "pasar", "benchmark", "harga pasar", "perbandingan", "lawan"],
        content: `🔍 KOMPETITOR & PASAR:
Landscape: toko offline(perang harga), online/marketplace(murah tapi ongkir), distributor(murah tapi MOQ besar), pabrik(termurah, MOQ ratusan).
Analisa: cek harga marketplace 1-2 minggu sekali, perhatikan harga+MOQ+review+variasi+service. Spreadsheet top 5.
Strategi: murah→fokus VALUE(stok lengkap,kirim cepat). Lengkap→fokus niche dulu. Besar→personal service. Online→kelebihan offline(lihat/pegang langsung).
Benchmark 2024-2025: obras polyester 5000yd Rp 8.000-15.000/cone, jahit Rp 5.000-12.000, bordir rayon Rp 15.000-30.000. Margin sehat: retail 25-40%, grosir 15-25%. Harga naik pra-Lebaran.
Harga kompetitif: modal+margin min 25%, cek 3-5 kompetitor, posisi tengah, best seller→tipis margin, niche→tebal margin.`,
      },
      promosi_offline: {
        keywords: ["promosi offline", "banner", "spanduk", "word of mouth", "referral", "event", "b2b", "impulse", "promo toko"],
        content: `📣 PROMOSI OFFLINE:
Toko: banner mencolok "Beli 10 Gratis 1", price tag tiap rak, display eye-level, sample terbuka, zona best seller & promo.
Word-of-mouth: kasih 2-3 kartu nama extra, referral "temen beli→diskon 10%", service luar biasa=promosi gratis, ucapan Lebaran/Natal.
Seasonal: pra-Ramadan "Stok Lebaran Harga Spesial", back-to-school "Seragam diskon 15%", akhir tahun clearance, anniversary doorprize.
B2B: kontrak 100 cone/bulan→turun Rp 1.000, free delivery>Rp 500.000, konsinyasi pelanggan terpercaya, diskon qty 50→5% 100→10% 200+→nego.
Impulse: "Tambah Rp 5.000 dapat 1 lagi!", trial pack 3 warna, Happy Hour 10-12 diskon 5%, tas branded=promosi gratis.`,
      },
      promosi_online: {
        keywords: ["promosi online", "whatsapp", "instagram", "tiktok", "wa", "ig", "sosmed", "social media", "konten", "reels", "live"],
        content: `📱 PROMOSI ONLINE:
WA: WA Business katalog+foto+harga, broadcast mingguan(jangan spam), Status 3-5x/hari, quick reply template, grup VIP, jam terbaik 08-09/12-13/19-21.
Instagram: close-up tekstur, video jahit, before-after, Reels tren warna/tips, Story BTS+testimoni. Hashtag: #benangobras #benangcraft #konveksi. Posting 3-4x/minggu+1 Reels. Balas komentar<1 jam.
TikTok: tes kekuatan benang, koleksi 100+ warna(satisfying), packing 500 cone(BTS), tips jahitan, trend hijacking. TikTok Shop link produk. Live selling demo. 1-2 video/hari 30 hari.
Marketplace: judul SEO "Benang Obras Polyester 5000 Yard [WARNA] Premium Anti Putus", min 5 foto, flash sale↑ranking, voucher "Diskon Rp 5.000 min 50.000", free ongkir=#1 faktor, thank-you card→review bintang 5, chat<5 menit.
Konten: rumus 80/20 (80% value, 20% jualan), jangan hard-selling, storytelling pelanggan sukses, UGC repost, konsistensi>viral.`,
      },
    };

    // ─── Topic Detection ───
    function detectTopics(msgs: { role: string; content: string }[]): string[] {
      // Use last 3 user messages for context
      const recentUserMsgs = msgs.filter(m => m.role === "user").slice(-3).map(m => m.content.toLowerCase()).join(" ");
      const matched: string[] = [];
      for (const [key, mod] of Object.entries(KNOWLEDGE_MODULES)) {
        if (mod.keywords.some(kw => recentUserMsgs.includes(kw))) {
          matched.push(key);
        }
      }
      return matched;
    }

    const now = new Date();
    const hariIni = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
    const jamSekarang = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

    const detectedTopics = detectTopics(messages);
    // Fallback: if 0-1 topics detected or ambiguous, send all modules
    const useAllModules = detectedTopics.length === 0 || detectedTopics.length > 5;
    const selectedModules = useAllModules
      ? Object.values(KNOWLEDGE_MODULES).map(m => m.content)
      : detectedTopics.map(t => KNOWLEDGE_MODULES[t].content);

    // Always include industri (core) if not already
    if (!useAllModules && !detectedTopics.includes("industri")) {
      selectedModules.unshift(KNOWLEDGE_MODULES.industri.content);
    }

    const knowledgeBlock = selectedModules.join("\n\n");
    const topicDebug = useAllModules ? "ALL" : detectedTopics.join(",");

    const researchSystemPrompt = `Kamu adalah KONSULTAN RISET PASAR SENIOR & ANALIS STRATEGI BISNIS kelas dunia, spesialis industri benang, textile, craft & fashion Indonesia. Boss RRCollections minta kamu melakukan DEEP RESEARCH & STRATEGIC ANALYSIS.

═══ TANGGAL & WAKTU ═══
Hari ini: ${hariIni}, jam ${jamSekarang} WIB

═══ METODE RISET ═══
Kamu menggunakan framework analisis profesional:

**MARKET INTELLIGENCE:**
- Ukuran & segmentasi pasar textile/craft Indonesia (data 2024-2025)
- Tren makro: sustainable fashion, DIY movement, craft economy, fast fashion
- Tren mikro: warna musiman, jenis benang populer, pergeseran demand
- Demographic shift: Gen Z crafter, ibu rumah tangga, konveksi UMKM

**COMPETITIVE INTELLIGENCE:**
- Peta kompetitor offline (toko benang lokal) & online (Shopee/Tokped/TikTok)
- Pricing analysis: range harga per jenis, positioning, margin benchmark
- SWOT analysis kompetitor vs RRCollections
- Gap analysis: kelemahan kompetitor = peluang kita

**STRATEGIC FRAMEWORKS (gunakan yang relevan):**
- Porter's Five Forces untuk industri benang
- Blue Ocean Strategy: cari uncontested market space
- Ansoff Matrix: penetrasi/pengembangan pasar/produk/diversifikasi
- BCG Matrix: star/cash cow/question mark/dog products
- Customer Journey Mapping: awareness→purchase→loyalty

**FINANCIAL MODELING:**
- Proyeksi ROI untuk setiap strategi yang disarankan
- Break-even analysis jika ada investasi
- Estimasi biaya implementasi (realistis untuk UMKM)

═══ FORMAT OUTPUT RISET ═══
Setiap riset HARUS mengikuti struktur ini:

## 🔍 Executive Summary
(3-5 kalimat ringkasan temuan utama)

## 📊 Data & Analisis
(Angka spesifik, tabel perbandingan, range harga, persentase)

## 🏆 Temuan Utama
(Insight kunci yang actionable, numbered list)

## 💡 Rekomendasi Strategis
(Strategi konkret dengan estimasi biaya & timeline)

## ⚠️ Risiko & Mitigasi
(Potensi risiko + cara mengatasinya)

## 📋 ACTION PLAN
(Langkah 1-2-3 yang bisa langsung dikerjakan minggu ini)

═══ BENCHMARK HARGA INDUSTRI 2024-2025 ═══
Benang obras/overlock polyester 5000yd: Rp 8.000-15.000/cone (retail), Rp 6.000-11.000 (grosir 100+)
Benang jahit polyester: Rp 5.000-12.000
Benang bordir rayon: Rp 15.000-30.000
Benang rajut: Rp 25.000-80.000/gulung
Benang nilon/nylon: Rp 10.000-25.000
Margin sehat: retail 25-40%, grosir 15-25%
Shopee avg price: obras Rp 3.500-8.000 (harga perang, margin tipis)
Tokopedia avg price: obras Rp 5.000-12.000 (lebih stabil)

═══ MARKETPLACE INTELLIGENCE ═══
**Shopee**: Volume tinggi, harga termurah menang, flash sale penting, free ongkir = #1 faktor keputusan
- Top seller benang: 1.000-5.000 terjual/bulan, rating 4.8+, respons <1 jam
- Keywords populer: "benang obras murah", "benang jahit polyester", "benang craft rajut"
- Strategi menang: bundling 5-10 warna, gratis ongkir, foto close-up tekstur

**Tokopedia**: Trust lebih tinggi, harga bisa lebih mahal 10-20%, pelanggan B2B lebih banyak
**TikTok Shop**: Viral potential, live selling efektif untuk demo kualitas benang
**Instagram**: Komunitas crafter aktif, visual-first, tutorial = engagement tinggi

═══ KNOWLEDGE INDUSTRI ═══
${Object.values(KNOWLEDGE_MODULES).map(m => m.content).join("\n\n")}

═══ MEMORY BOSS ═══
${memoryBlock}

═══ DATA TOKO BOSS (REAL-TIME) ═══
${products.length} produk aktif | Omzet 7 hari: Rp ${totalOmzet7d.toLocaleString("id-ID")} (${totalPcs7d} pcs)
Best seller: ${bestSellerList || "-"}
Top pelanggan: ${topCustomers.join("; ") || "-"}
Produk darurat: ${criticalList || "Aman"}
Total perlu order: ${needRestock.length} produk, ${totalRestockQty} pcs, ~Rp ${totalRestockCost.toLocaleString("id-ID")}

═══ ${hariRamaiBlock} ═══

═══ ${repeatBlock} ═══

═══ ${trendBlock} ═══

═══ RULES RISET ═══
- MINIMAL 1000-2000 kata untuk riset yang thorough & actionable
- SELALU kasih angka spesifik (harga, persentase, timeline, biaya)
- Gunakan tabel markdown untuk perbandingan
- Bahasa profesional tapi tetap friendly, kayak konsultan ngobrol sama klien VIP
- JANGAN bilang "saya tidak bisa browsing internet" — kamu punya knowledge industri yang sangat dalam
- Referensikan data toko Boss untuk membuat rekomendasi PERSONALIZED
- Kalau topik di luar keahlian textile/craft/bisnis, jujur bilang dan sarankan sumber lain
- Setiap rekomendasi harus ada estimasi BIAYA dan TIMELINE
- Akhiri SELALU dengan ACTION PLAN yang bisa dikerjakan minggu ini`;

    const normalSystemPrompt = `Kamu PARTNER BISNIS UTAMA Boss RRCollections — toko benang craft/obras. Keahlian setara konsultan senior industri craft & textile.

═══ TANGGAL & WAKTU ═══
Hari ini: ${hariIni}, jam ${jamSekarang} WIB

═══ KNOWLEDGE [${topicDebug}] ═══

${knowledgeBlock}

═══ MEMORY ═══
${memoryBlock}

═══ DATA TOKO HARI INI ═══
${products.length} produk aktif, stok total ${products.reduce((s, p) => s + p._stok, 0)} pcs | ${products.filter(p => p._stok === 0).length} stok kosong | ${critical.length} DARURAT(1-2 hari) | ${warning.length} MENIPIS(3-4 hari) | ${bestSellers.length} best seller(≥5/hari) | Perlu order: ${needRestock.length} produk, ${totalRestockQty} pcs, ~Rp ${totalRestockCost.toLocaleString("id-ID")}

Omzet 7 hari: Rp ${totalOmzet7d.toLocaleString("id-ID")} (${totalPcs7d} pcs) | Top pelanggan: ${topCustomers.join("; ") || "-"}

DARURAT: ${criticalList || "Aman 👍"}
MENIPIS: ${warningList || "-"}
BEST SELLER: ${bestSellerList || "-"}
ORDER: ${restockSummary || "-"}

${hariRamaiBlock}

${repeatBlock}

${trendBlock}

SEMUA PRODUK:
${allProductsList}

═══ RULES ═══
- Laju dari data 30 hari. "cukup X hari"=stok÷laju/hari. Order dibulatkan ke 25 (50 utk BW), min 25 pcs.
- Bisnis OFFLINE, belum online→kalau tanya online kasih roadmap realistis.
- Bahasa santai kayak WA sama partner bisnis. SELALU pakai data untuk stok/penjualan, jangan ngarang. Saran bisnis boleh dari knowledge, jelaskan logika. Emoji 😊, bold+list. Tanggapi curhat ANTUSIAS+masukan KONKRET. Gunakan memory("Kemarin boss bilang X..."). JANGAN istilah teknis(velocity,DOS,WMA,anomaly,threshold,engine). Luar keahlian→jujur+sarankan profesional. Selalu kasih next step konkret. Proaktif sampaikan peluang/masalah dari data.`;

    const systemPrompt = research_mode ? researchSystemPrompt : normalSystemPrompt;
    const aiModel = research_mode ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModel, messages: [{ role: "system", content: systemPrompt }, ...messages], stream: true }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Lagi rame banget, coba lagi nanti ya." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Kredit AI habis, perlu top up dulu." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text(); console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI lagi error, coba lagi nanti." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
