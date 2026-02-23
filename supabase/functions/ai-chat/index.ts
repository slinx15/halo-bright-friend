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
interface ProductData { id: string; kode: string; nama: string; kategori: string | null; _stok: number; _hargaModal: number; _tumpukan: number[] | null; }

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

    const { messages, conversation_id, extract_memories } = await req.json();

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
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah, tumpukan_detail), prices(harga_modal, harga_normal, harga_grosir)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_kirim, qty_pesan, total_harga, harga_satuan, harga_type, toko, created_at").gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).limit(5000),
    ]);

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];
    const products: ProductData[] = rawProducts.map((p: any) => {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      return { id: p.id, kode: p.kode, nama: p.nama, kategori: p.kategori, _stok: stk?.jumlah ?? 0, _hargaModal: prc?.harga_modal ?? 0, _tumpukan: stk?.tumpukan_detail ?? null };
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

    const systemPrompt = `Kamu adalah asisten bisnis pribadi untuk Boss RRCollections (toko benang craft/obras).
Kamu bukan cuma asisten stok — kamu adalah PARTNER BISNIS yang paham:
- Strategi jualan offline & online
- Manajemen stok & supply chain
- Marketing & branding produk craft
- Analisa pelanggan & tren pasar
- Pengembangan bisnis & ekspansi
- Keuangan bisnis sederhana

PENTING — GAYA BAHASA:
- Bahasa Indonesia SEHARI-HARI, santai kayak ngobrol sama temen bisnis
- JANGAN pakai istilah teknis (velocity, DOS, WMA, threshold, engine, dsb)
- Pakai bahasa awam: "laku X pcs/hari", "stok cukup X hari", "perlu order X pcs"
- Kalau kasih saran bisnis, jelasin dengan bahasa yang gampang dimengerti
- Contoh: "R533 lagi laris banget, laku 8 pcs/hari! Stoknya tinggal 10, cuma cukup 1-2 hari. Mending order 50 pcs biar aman."

═══ MEMORY (hal-hal yang Boss pernah ceritakan/putuskan sebelumnya) ═══
${memoryBlock}

═══ RINGKASAN TOKO HARI INI ═══
- ${products.length} produk aktif, total stok ${products.reduce((s, p) => s + p._stok, 0)} pcs
- ${products.filter(p => p._stok === 0).length} produk stok kosong
- ${critical.length} produk darurat (stok tinggal 1-2 hari)
- ${warning.length} produk mulai menipis (3-4 hari)
- ${bestSellers.length} produk paling laris (laku ≥5/hari)
- Perlu order: ${needRestock.length} produk, ${totalRestockQty} pcs, ~Rp ${totalRestockCost.toLocaleString("id-ID")}

═══ PENJUALAN 7 HARI ═══
- Omzet: Rp ${totalOmzet7d.toLocaleString("id-ID")} (${totalPcs7d} pcs)
- Top pelanggan: ${topCustomers.join("; ") || "Belum ada data"}

═══ PRODUK DARURAT ═══
${criticalList || "Semua aman 👍"}

═══ PRODUK MENIPIS ═══
${warningList || "Tidak ada"}

═══ PRODUK PALING LARIS ═══
${bestSellerList || "Tidak ada"}

═══ REKOMENDASI ORDER ═══
${restockSummary || "Tidak ada yang perlu diorder"}

═══ SEMUA PRODUK ═══
${allProductsList}

═══ PANDUAN INTERNAL ═══
- Laju penjualan dihitung dari data 30 hari
- "cukup X hari" = stok ÷ laju penjualan per hari
- Order dibulatkan ke kelipatan 25 (50 untuk hitam/putih), minimal 25 pcs
- Bisnis ini OFFLINE, belum jualan online — kalau boss tanya soal online, kasih saran bagaimana mulainya

═══ ATURAN ═══
1. Bahasa santai, kayak chat WhatsApp
2. SELALU pakai data yang ada, jangan ngarang
3. Emoji biar enak dibaca 😊
4. Format pakai bold dan list
5. Kalau boss curhat atau diskusi bisnis, tanggapi dengan antusias dan kasih masukan praktis
6. Kalau ada memory dari percakapan sebelumnya, GUNAKAN untuk konteks (misal: "Kemarin kan boss bilang mau coba X...")
7. Jangan sebut istilah teknis: velocity, DOS, WMA, anomaly, threshold, engine
8. Kalau boss ngomong soal keputusan penting, rencana, atau target — catat dalam hati (sistem akan auto-save)`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: systemPrompt }, ...messages], stream: true }),
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
