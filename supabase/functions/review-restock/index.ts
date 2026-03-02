import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Engine Rules (parity with stockAnalyticsEngine.ts) ───
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

interface SaleRecord { product_id: string; qty_pesan: number; created_at: string; }

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
  let velocity: number;
  if (totalDays >= 7) { velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT; }
  else if (totalDays > 0) { velocity = totalQty / minDays; }
  else { velocity = 0; }
  if (totalDays > 0 && totalDays < 3) velocity /= (3 / totalDays);
  if (totalDays === 1 && velocity > 20) velocity *= 0.5;
  if (totalDays > 0 && totalDays < 7 && totalQty >= 20) velocity *= 0.55;
  return { velocity: Math.round(velocity * 100) / 100, totalQty, salesDays: totalDays };
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

    const { items, mode, ordered_at } = await req.json();
    // items = [{ kode: "ABC-123", qty: 50 }, ...]
    // mode = "review" (default) | "topup"
    // ordered_at = ISO timestamp (for topup mode)

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Kirim minimal 1 item untuk di-review" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isTopup = mode === "topup";

    // ─── Fetch business data ───
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const queries: Promise<any>[] = [
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah), prices(harga_modal, harga_normal, harga_grosir)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_pesan, created_at").gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).limit(5000),
    ];

    // For topup mode: also fetch stock_out after ordered_at
    if (isTopup && ordered_at) {
      queries.push(
        supabase.from("stock_out").select("product_id, qty_pesan, created_at").gte("created_at", ordered_at).order("created_at", { ascending: false }).limit(5000)
      );
    }

    const queryResults = await Promise.all(queries);
    const [productsRes, stockOutRes] = queryResults;
    const stockOutAfterOrder = isTopup && queryResults[2] ? queryResults[2].data || [] : [];

    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    // Build product lookup
    const productMap: Record<string, any> = {};
    for (const p of rawProducts) {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      productMap[p.kode.toUpperCase()] = {
        id: p.id, kode: p.kode, nama: p.nama, kategori: p.kategori,
        stok: stk?.jumlah ?? 0,
        hargaModal: prc?.harga_modal ?? 0,
        hargaNormal: prc?.harga_normal ?? 0,
        hargaGrosir: prc?.harga_grosir ?? 0,
      };
    }

    // ─── Analyze selected items ───
    const reviewData: string[] = [];
    let totalCost = 0;
    let unknownCodes: string[] = [];

    for (const item of items) {
      const kode = String(item.kode).toUpperCase().trim();
      const qty = Number(item.qty) || 0;
      const product = productMap[kode];

      if (!product) {
        unknownCodes.push(kode);
        reviewData.push(`❌ ${kode}: qty ${qty} — TIDAK ADA DI MASTER (produk tidak dikenal)`);
        continue;
      }

      const { velocity, totalQty, salesDays } = computeWMAVelocity(stockOut, product.id);
      const isBW = isBlackWhite(kode);
      const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
      const safety = isBW ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
      const targetDays = RULES.CYCLE_DAYS + safety + RULES.LEAD_TIME_DAYS;
      const targetStock = Math.ceil(velocity * targetDays);
      const dos = velocity > 0 ? product.stok / velocity : (product.stok > 0 ? 999 : 0);
      const idealQty = Math.max(0, targetStock - product.stok);
      const idealRounded = idealQty > 0 ? Math.max(isBW ? batch : RULES.MIN_ORDER_PER_CODE, Math.ceil(idealQty / batch) * batch) : 0;
      const cost = qty * product.hargaModal;
      totalCost += cost;

      const status = dos <= RULES.CRITICAL_DAYS ? "🔴KRITIS" : dos <= RULES.WARNING_DAYS ? "🟠SEGERA" : dos <= RULES.ATTENTION_DAYS ? "🟡PERHATIAN" : "🟢AMAN";
      const isBestSeller = velocity >= RULES.BESTSELLER_VELOCITY;

      reviewData.push(
        `${kode} (${product.nama}): pilihan boss=${qty}pcs | stok=${product.stok} | laku=${velocity}/hari | sisa=${Math.round(dos*10)/10}hari | status=${status} | rekomendasi sistem=${idealRounded}pcs | modal=Rp${product.hargaModal.toLocaleString("id-ID")}/pcs | biaya=Rp${cost.toLocaleString("id-ID")} | ${isBestSeller ? "🔥BESTSELLER" : "reguler"} | batch=${batch}`
      );
    }

    // ─── TOPUP MODE: Calculate shortfall from stock_out after ordered_at ───
    const shortfallData: string[] = [];
    let shortfallItems: { kode: string; qty: number }[] = [];

    if (isTopup && ordered_at) {
      // Group stock_out after ordered_at by product_id
      const outAfter: Record<string, number> = {};
      for (const s of stockOutAfterOrder) {
        outAfter[s.product_id] = (outAfter[s.product_id] ?? 0) + s.qty_pesan;
      }

      // For each item in the original order, check if stock went out after ordering
      const originalKodes = new Set(items.map((i: any) => String(i.kode).toUpperCase().trim()));
      
      // Check original order items for shortfall
      for (const item of items) {
        const kode = String(item.kode).toUpperCase().trim();
        const product = productMap[kode];
        if (!product) continue;
        const outQty = outAfter[product.id] ?? 0;
        if (outQty > 0) {
          const isBW = isBlackWhite(kode);
          const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
          const roundedQty = Math.max(batch, Math.ceil(outQty / batch) * batch);
          shortfallData.push(`${kode} (${product.nama}): keluar=${outQty}pcs setelah pesan | tambahan=${roundedQty}pcs | stok sekarang=${product.stok} | modal=Rp${product.hargaModal.toLocaleString("id-ID")}/pcs`);
          shortfallItems.push({ kode, qty: roundedQty });
        }
      }

      // Also check products NOT in original order but had significant outflow
      for (const [productId, outQty] of Object.entries(outAfter)) {
        const prod = rawProducts.find(p => p.id === productId);
        if (!prod) continue;
        if (originalKodes.has(prod.kode.toUpperCase())) continue; // already checked
        const pm = productMap[prod.kode.toUpperCase()];
        if (!pm) continue;
        const { velocity } = computeWMAVelocity(stockOut, pm.id);
        const dos = velocity > 0 ? pm.stok / velocity : (pm.stok > 0 ? 999 : 0);
        if (dos <= RULES.WARNING_DAYS && outQty > 0) {
          const isBW = isBlackWhite(prod.kode);
          const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
          const roundedQty = Math.max(batch, Math.ceil(outQty / batch) * batch);
          shortfallData.push(`${prod.kode} (${prod.nama}): TIDAK di pesanan awal | keluar=${outQty}pcs | stok=${pm.stok} | laku=${velocity}/hari | sisa=${Math.round(dos*10)/10}hari | tambahan=${roundedQty}pcs`);
          shortfallItems.push({ kode: prod.kode, qty: roundedQty });
        }
      }
    }

    // ─── Build items NOT selected but might be important ───
    const selectedKodes = new Set(items.map((i: any) => String(i.kode).toUpperCase().trim()));
    const missedCritical: string[] = [];

    for (const p of rawProducts) {
      if (selectedKodes.has(p.kode.toUpperCase())) continue;
      const prod = productMap[p.kode.toUpperCase()];
      if (!prod) continue;
      const { velocity } = computeWMAVelocity(stockOut, prod.id);
      if (velocity <= 0) continue;
      const dos = prod.stok / velocity;
      if (dos <= RULES.WARNING_DAYS) {
        const isBW = isBlackWhite(p.kode);
        const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
        const idealQty = Math.max(batch, Math.ceil(velocity * (RULES.CYCLE_DAYS + (isBW ? RULES.SAFETY_BW : RULES.SAFETY_STOCK) + RULES.LEAD_TIME_DAYS) - prod.stok));
        missedCritical.push(`${p.kode} (${p.nama}): stok=${prod.stok}, laku=${velocity}/hari, sisa=${Math.round(dos*10)/10}hari, ${dos <= RULES.CRITICAL_DAYS ? "🔴KRITIS" : "🟠SEGERA"}, order ideal=${Math.ceil(idealQty/batch)*batch}pcs`);
      }
    }

    // ─── Get current date/time WIB ───
    const nowWIB = new Date(new Date().getTime() + 7 * 3600000);
    const dateStr = nowWIB.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // ─── Build AI prompt ───
    let systemPrompt: string;
    let userContent: string;

    if (isTopup) {
      const orderedAtWIB = new Date(new Date(ordered_at).getTime() + 7 * 3600000);
      const orderedAtStr = orderedAtWIB.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

      systemPrompt = `Kamu adalah analis inventaris senior untuk RRCollections (toko benang/obras grosir).
Tanggal sekarang: ${dateStr}
Gaya bahasa: CASUAL, bahasa Indonesia awam (seperti ngobrol di WhatsApp), tapi analisis harus tajam dan berbasis data.
Panggil user "Boss".

KONTEKS: Boss sudah pesan restock ke supplier pada ${orderedAtStr}. 
Tapi barang belum datang. Setelah pesan, ada pesanan pelanggan masuk yang mengurangi stok.
Boss mau tau TAMBAHAN apa yang perlu dipesan ke supplier yang sama.

ATURAN BISNIS:
- Siklus belanja: ${RULES.CYCLE_DAYS} hari
- Minimum order: ${RULES.MIN_ORDER_PER_CODE} pcs (BW: ${RULES.BATCH_BW} pcs)
- Warna hitam/putih (BW) SELALU paling laris, wajib stok banyak
- Best seller = laku ≥${RULES.BESTSELLER_VELOCITY}/hari
- KRITIS = sisa ≤${RULES.CRITICAL_DAYS} hari

FORMAT OUTPUT (gunakan heading markdown):

## 📊 Ringkasan
Berapa total barang keluar setelah Boss pesan, dan seberapa urgent tambahannya.

## 📋 Pesanan Tambahan yang Harus Ditambah
Tabel/daftar: KODE | NAMA | Keluar Setelah Pesan | Qty Tambahan | Alasan
(Ini yang PALING PENTING - daftar konkret yang bisa langsung dikirim ke supplier)

## ⚠️ Produk Kritis Belum Dipesan
Produk yang stoknya kritis tapi TIDAK ada di pesanan awal Boss (perlu dipertimbangkan)

## 📦 Gabungan Pesanan Final
Daftar lengkap: pesanan awal + tambahan, jadi Boss bisa langsung kirim ke supplier sebagai UPDATE pesanan.
Format: KODE | Pesanan Awal | Tambahan | TOTAL

## 💰 Estimasi Biaya Tambahan
Total biaya tambahan yang perlu disiapkan.

PENTING:
- Fokus pada yang PRAKTIS — Boss mau langsung kirim daftar ke supplier
- Jangan terlalu panjang, cukup poin-poin tajam
- Pakai emoji untuk memperjelas
- Semua angka pakai format Indonesia (titik ribuan)`;

      userContent = `Boss sudah pesan ke supplier (${orderedAtStr}):\n\n${reviewData.join("\n")}\n\nTotal biaya pesanan awal: Rp ${totalCost.toLocaleString("id-ID")}`;
      
      if (shortfallData.length > 0) {
        userContent += `\n\n📉 BARANG YANG KELUAR SETELAH PESAN:\n${shortfallData.join("\n")}`;
      } else {
        userContent += `\n\n✅ Tidak ada barang keluar setelah Boss pesan. Pesanan awal masih aman.`;
      }

      if (missedCritical.length > 0) {
        userContent += `\n\n📋 PRODUK KRITIS YANG TIDAK ADA DI PESANAN:\n${missedCritical.join("\n")}`;
      }
    } else {
      systemPrompt = `Kamu adalah analis inventaris senior untuk RRCollections (toko benang/obras grosir).
Tanggal: ${dateStr}
Gaya bahasa: CASUAL, bahasa Indonesia awam (seperti ngobrol di WhatsApp), tapi analisis harus tajam dan berbasis data.
Panggil user "Boss".

ATURAN BISNIS:
- Siklus belanja: ${RULES.CYCLE_DAYS} hari
- Minimum order: ${RULES.MIN_ORDER_PER_CODE} pcs (BW: ${RULES.BATCH_BW} pcs)
- Warna hitam/putih (BW) SELALU paling laris, wajib stok banyak
- Best seller = laku ≥${RULES.BESTSELLER_VELOCITY}/hari
- KRITIS = sisa ≤${RULES.CRITICAL_DAYS} hari
- Lead time supplier: ${RULES.LEAD_TIME_DAYS} hari

TUGAS: Review pilihan restock boss dan berikan analisis JUJUR.

FORMAT OUTPUT (gunakan heading markdown):

## 📊 Skor Keseluruhan: X/10
Ringkasan singkat 1-2 kalimat.

## ✅ Yang Sudah Tepat
- Produk yang pilihannya bagus + alasan singkat

## ⚠️ Yang Perlu Diperbaiki
- Produk yang qty-nya kurang/kebanyakan + qty yang disarankan + alasan

## 🚨 Produk Terlewat (Wajib Ditambah)
- Produk kritis/segera habis yang TIDAK dipilih boss tapi seharusnya dipesan

## 💡 Saran Alternatif
- Produk pengganti/tambahan yang bisa dipertimbangkan

## ⚡ Risiko
- Warning kalau ada slow mover, overstock, dead stock risk, budget tidak optimal

## 💰 Ringkasan Budget
Total biaya, efisiensi penggunaan budget, estimasi coverage hari.

PENTING:
- Jangan terlalu panjang, cukup poin-poin tajam
- Kalau ada yang bagus, puji. Kalau ada yang salah, bilang terus terang tapi sopan
- Pakai emoji untuk memperjelas
- Semua angka pakai format Indonesia (titik ribuan)`;

      userContent = `Boss mau pesan barang berikut:\n\n${reviewData.join("\n")}\n\nTotal biaya: Rp ${totalCost.toLocaleString("id-ID")}${unknownCodes.length > 0 ? `\n\n⚠️ Kode tidak dikenal: ${unknownCodes.join(", ")}` : ""}${missedCritical.length > 0 ? `\n\n📋 PRODUK KRITIS YANG TIDAK DIPILIH:\n${missedCritical.join("\n")}` : "\n\n✅ Semua produk kritis sudah tercover dalam pilihan boss."}`;
    }

    // ─── Call AI (streaming) ───
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
          { role: "user", content: userContent },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Terlalu banyak request. Coba lagi dalam 1 menit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kuota AI habis. Hubungi admin." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Gagal menghubungi AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (e) {
    console.error("review-restock error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
