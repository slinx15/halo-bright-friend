import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RULES = {
  CYCLE_DAYS: 3, SAFETY_STOCK: 1, SAFETY_BW: 2,
  BATCH: 25, BATCH_BW: 50, MIN_ORDER_PER_CODE: 25,
  WMA_PERIOD1_DAYS: 14, WMA_PERIOD1_WEIGHT: 0.70, WMA_PERIOD2_WEIGHT: 0.30,
  ANOMALY_MULTIPLIER: 3, LEAD_TIME_DAYS: 3,
  BESTSELLER_VELOCITY: 5, SLOWMOVER_VELOCITY: 2,
  CRITICAL_DAYS: 2, WARNING_DAYS: 4, ATTENTION_DAYS: 7,
  NEW_PRODUCT_WAIT_DAYS: 7, NEW_PRODUCT_DEFAULT_VEL: 1,
};

const MATURITY_CONFIG = {
  minSalesDays: 3,
  divisorFloor: 7,
};

const HARD_MATURITY_CONFIG = {
  immatureDaysThreshold: 7,
  velocityCapFactor: 0.55,
  minSalesForCap: 20,
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

type Verdict = "kurang" | "pas" | "lebih" | "ok" | "unknown";
type Status = "kritis" | "segera" | "perhatian" | "aman";

interface ReviewCard {
  kode: string;
  nama: string;
  qty_boss: number;
  stok: number;
  velocity: number;
  dos: number;
  status: Status;
  ideal_qty: number;
  verdict: Verdict;
  verdict_note: string;
  cost: number;
  harga_modal: number;
  is_bestseller: boolean;
  is_bw: boolean;
  batch: number;
  pending_qty: number;
}

interface MissedCard {
  kode: string;
  nama: string;
  stok: number;
  velocity: number;
  dos: number;
  status: Status;
  ideal_qty: number;
  is_bw: boolean;
  harga_modal: number;
  cost: number;
  pending_qty: number;
}

interface OtherItem {
  kode: string;
  nama: string;
  kategori: string;
  qty: number;
  harga_modal: number;
  cost: number;
}

function getStatus(dos: number): Status {
  if (dos <= RULES.CRITICAL_DAYS) return "kritis";
  if (dos <= RULES.WARNING_DAYS) return "segera";
  if (dos <= RULES.ATTENTION_DAYS) return "perhatian";
  return "aman";
}

function getVerdict(qtyBoss: number, idealQty: number, status: Status): { verdict: Verdict; note: string } {
  if (idealQty === 0 && status === "aman") {
    if (qtyBoss > 0) return { verdict: "lebih", note: "Stok masih aman, belum perlu restock" };
    return { verdict: "ok", note: "Stok aman" };
  }
  const diff = qtyBoss - idealQty;
  const threshold = idealQty * 0.2;
  if (Math.abs(diff) <= threshold) return { verdict: "pas", note: "Qty sudah sesuai kebutuhan" };
  if (diff < -threshold) {
    return { verdict: "kurang", note: `Kurang ${Math.abs(diff)} pcs dari rekomendasi (${idealQty} pcs)` };
  }
  return { verdict: "lebih", note: `Lebih ${diff} pcs dari rekomendasi (${idealQty} pcs)` };
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

    const { items, mode, ordered_at, target_days, already_sent } = await req.json();
    const customTargetDays = target_days && Number(target_days) > 0 ? Number(target_days) : null;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Kirim minimal 1 item untuk di-review" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isTopup = mode === "topup";

    // Fetch ALL active products (2 Ons for review, others for passthrough cost)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const queries: Promise<any>[] = [
      supabase.from("products").select("id, kode, nama, kategori, stock(jumlah), prices(harga_modal, harga_normal, harga_grosir)").eq("is_active", true),
      supabase.from("stock_out").select("product_id, qty_pesan, created_at").gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).limit(5000),
      supabase.from("pending_restock").select("id, status").in("status", ["pending", "active"]),
    ];
    if (isTopup && ordered_at) {
      queries.push(
        supabase.from("stock_out").select("product_id, qty_pesan, created_at").gte("created_at", ordered_at).order("created_at", { ascending: false }).limit(5000)
      );
    }

    const queryResults = await Promise.all(queries);
    const [productsRes, stockOutRes, pendingRestockRes] = queryResults;
    const stockOutAfterOrder = isTopup && queryResults[3] ? queryResults[3].data || [] : [];
    const rawProducts = productsRes.data || [];
    const stockOut = stockOutRes.data || [];

    // Build pending qty map
    const pendingMap: Record<string, number> = {};
    const pendingRestocks = pendingRestockRes.data || [];
    if (pendingRestocks.length > 0) {
      const restockIds = pendingRestocks.map((r: any) => r.id);
      const { data: pendingItems } = await supabase
        .from("pending_restock_items")
        .select("kode, qty")
        .in("restock_id", restockIds);
      for (const pi of (pendingItems || [])) {
        const k = pi.kode.toUpperCase().trim();
        pendingMap[k] = (pendingMap[k] || 0) + pi.qty;
      }
    }

    // Build product lookup — ALL categories
    const productMap: Record<string, any> = {};
    for (const p of rawProducts) {
      const stk = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      const prc = Array.isArray(p.prices) ? p.prices[0] : p.prices;
      productMap[p.kode.toUpperCase()] = {
        id: p.id, kode: p.kode, nama: p.nama, kategori: p.kategori || "2 Ons",
        stok: stk?.jumlah ?? 0,
        hargaModal: prc?.harga_modal ?? 0,
      };
    }

    // ─── Separate items into 2 Ons (review) vs others (passthrough) ───
    const cards: ReviewCard[] = [];
    const otherItems: OtherItem[] = [];
    let totalCost2Ons = 0;
    let totalCostOther = 0;
    const unknownCodes: string[] = [];

    for (const item of items) {
      const kode = String(item.kode).toUpperCase().trim();
      const qty = Number(item.qty) || 0;
      const product = productMap[kode];

      if (!product) {
        unknownCodes.push(kode);
        continue;
      }

      // Non-2 Ons: passthrough (no review, just cost)
      if (product.kategori !== "2 Ons") {
        const cost = qty * product.hargaModal;
        totalCostOther += cost;
        otherItems.push({
          kode: product.kode,
          nama: product.nama,
          kategori: product.kategori,
          qty,
          harga_modal: product.hargaModal,
          cost,
        });
        continue;
      }

      // 2 Ons: full review
      const { velocity, salesDays } = computeWMAVelocity(stockOut, product.id);
      const isBW = isBlackWhite(kode);
      const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
      const safety = isBW ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
      const computedTargetDays = customTargetDays || (RULES.CYCLE_DAYS + safety + RULES.LEAD_TIME_DAYS);
      const targetStock = Math.ceil(velocity * computedTargetDays);
      const pendingQty = pendingMap[kode] || 0;
      const effectiveStock = product.stok + pendingQty;
      const dos = velocity > 0 ? effectiveStock / velocity : (effectiveStock > 0 ? 999 : 0);
      const idealQty = Math.max(0, targetStock - effectiveStock);
      const idealRounded = idealQty > 0 ? Math.max(isBW ? batch : RULES.MIN_ORDER_PER_CODE, Math.ceil(idealQty / batch) * batch) : 0;
      const cost = qty * product.hargaModal;
      totalCost2Ons += cost;

      const status = getStatus(dos);
      const isBestSeller = velocity >= RULES.BESTSELLER_VELOCITY;
      const { verdict, note } = getVerdict(qty, idealRounded, status);

      cards.push({
        kode: product.kode, nama: product.nama,
        qty_boss: qty, stok: product.stok,
        velocity, dos: Math.round(dos * 10) / 10,
        status, ideal_qty: idealRounded,
        verdict, verdict_note: note,
        cost, harga_modal: product.hargaModal,
        is_bestseller: isBestSeller, is_bw: isBW,
        batch, pending_qty: pendingQty,
      });
    }

    // ─── Missed critical products (only 2 Ons) ───
    const selectedKodes = new Set(items.map((i: any) => String(i.kode).toUpperCase().trim()));
    const missed: MissedCard[] = [];

    for (const p of rawProducts) {
      if (p.kategori !== "2 Ons") continue;
      if (selectedKodes.has(p.kode.toUpperCase())) continue;
      const prod = productMap[p.kode.toUpperCase()];
      if (!prod) continue;
      const { velocity } = computeWMAVelocity(stockOut, prod.id);
      if (velocity <= 0) continue;
      const kodeUpper = p.kode.toUpperCase();
      const pendingQty = pendingMap[kodeUpper] || 0;
      const effectiveStock = prod.stok + pendingQty;
      const dos = effectiveStock / velocity;
      if (dos <= RULES.WARNING_DAYS) {
        const isBW = isBlackWhite(p.kode);
        const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
        const missedTargetDays = customTargetDays || (RULES.CYCLE_DAYS + (isBW ? RULES.SAFETY_BW : RULES.SAFETY_STOCK) + RULES.LEAD_TIME_DAYS);
        const idealQty = Math.max(batch, Math.ceil(velocity * missedTargetDays - effectiveStock));
        const idealRounded = idealQty > 0 ? Math.ceil(idealQty / batch) * batch : 0;
        const missedCost = idealRounded * (prod.hargaModal || 0);
        if (idealRounded <= 0) continue;
        missed.push({
          kode: p.kode, nama: p.nama,
          stok: prod.stok, velocity,
          dos: Math.round(dos * 10) / 10,
          status: getStatus(dos),
          ideal_qty: idealRounded, is_bw: isBW,
          harga_modal: prod.hargaModal || 0,
          cost: missedCost, pending_qty: pendingQty,
        });
      }
    }
    missed.sort((a, b) => a.dos - b.dos);

    // ─── Budget breakdown ───
    const budgetTambah = cards.filter(c => c.verdict === "kurang").reduce((sum, c) => sum + (c.ideal_qty - c.qty_boss) * c.harga_modal, 0);
    const budgetMissed = missed.reduce((sum, m) => sum + m.cost, 0);
    const budgetTotal = totalCost2Ons + totalCostOther + budgetTambah + budgetMissed;

    // ─── Score calculation (only 2 Ons) ───
    const totalCards = cards.length;
    const pasCount = cards.filter(c => c.verdict === "pas" || c.verdict === "ok").length;
    const kurangCount = cards.filter(c => c.verdict === "kurang").length;
    const lebihCount = cards.filter(c => c.verdict === "lebih").length;
    const score = totalCards > 0 ? Math.max(1, Math.min(10, Math.round(10 * (pasCount / totalCards) - (kurangCount * 0.5 + lebihCount * 0.3 + missed.length * 0.2)))) : 5;

    // ─── Short AI summary ───
    const summaryData = {
      total_items: totalCards,
      pas: pasCount, kurang: kurangCount, lebih: lebihCount,
      missed_count: missed.length,
      total_cost: totalCost2Ons,
      unknown_count: unknownCodes.length,
      budget_tambah: budgetTambah,
      budget_missed: budgetMissed,
      budget_total: budgetTotal,
      other_items_count: otherItems.length,
      other_items_cost: totalCostOther,
    };

    const isSent = !!already_sent;
    const sentContext = isSent 
      ? `\nKONTEKS KRITIS: Pesanan ini SUDAH DIKIRIM ke supplier dan TIDAK BISA diubah/dibatalkan. Jadi:
- JANGAN PERNAH sarankan untuk mengurangi, memangkas, menghapus, atau membatalkan item yang kebanyakan. Itu sudah terlanjur dikirim.
- Item yang "lebih" cukup dicatat saja, bukan masalah karena stok tambahan tetap berguna.
- Fokus saran HANYA pada: (1) item yang KURANG — perlu tambah pesanan baru, (2) produk kritis yang BELUM dipesan — perlu pesan terpisah.
- Gunakan istilah "pesan tambahan" atau "top-up" bukan "pangkas" atau "kurangi".\n`
      : "";
    
    const otherContext = otherItems.length > 0
      ? `\n- Pesanan ukuran lain (3 Ons/5 Ons/18 Gram): ${otherItems.length} item, budget Rp ${totalCostOther.toLocaleString("id-ID")} (tidak perlu di-review, hanya dihitung biaya)`
      : "";

    const summaryPrompt = `Kamu analis inventaris RRCollections (toko benang grosir). Panggil user "Boss". Bahasa Indonesia casual.${sentContext}
Buat RINGKASAN SINGKAT 2-3 kalimat untuk hasil review restock ini:
- ${summaryData.total_items} item 2 Ons di-review
- ${summaryData.pas} sudah tepat, ${summaryData.kurang} kurang, ${summaryData.lebih} kebanyakan
- ${summaryData.missed_count} produk kritis belum dipesan
- Budget pesanan 2 Ons: Rp ${totalCost2Ons.toLocaleString("id-ID")}
- Budget tambahan yang perlu: Rp ${budgetTambah.toLocaleString("id-ID")} (item kurang) + Rp ${budgetMissed.toLocaleString("id-ID")} (item belum pesan)${otherContext}
- Total budget SEMUA ukuran: Rp ${budgetTotal.toLocaleString("id-ID")}
${unknownCodes.length > 0 ? `- ${unknownCodes.length} kode tidak dikenal: ${unknownCodes.join(", ")}` : ""}

Beri penilaian singkat + 1 saran paling penting. MAX 3 kalimat. Jangan pake markdown heading, cukup teks biasa.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: summaryPrompt },
          { role: "user", content: "Beri ringkasan singkat." },
        ],
        max_tokens: 200,
      }),
    });

    let aiSummary = "";
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      aiSummary = aiData.choices?.[0]?.message?.content || "";
    }

    const result = {
      score,
      summary: aiSummary,
      cards,
      missed,
      other_items: otherItems,
      unknown_codes: unknownCodes,
      total_cost: totalCost2Ons,
      total_cost_other: totalCostOther,
      budget_tambah: budgetTambah,
      budget_missed: budgetMissed,
      budget_total: budgetTotal,
      stats: summaryData,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("review-restock error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
