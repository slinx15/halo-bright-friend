/**
 * Stock Analytics Engine — Bot Parity Mode (EXACT)
 * Clones Telegram bot behavior exactly.
 * Rule-based, deterministic, no ML/AI.
 */

import type { ProductWithDetails } from "@/hooks/useProducts";

// ─── Constants (EXACT match bot RULES) ────────────────────
export const RULES = {
  CYCLE_DAYS: 3,
  SAFETY_STOCK: 1,       // Safety 1 hari untuk warna
  SAFETY_BW: 2,          // Safety 2 hari untuk hitam/putih
  BATCH: 25,
  BATCH_BW: 50,
  MIN_ORDER_PER_CODE: 25,

  // Priority scoring weights
  WEIGHT_VELOCITY: 0.40,
  WEIGHT_URGENCY: 0.30,
  WEIGHT_TREND: 0.20,
  WEIGHT_STOCK: 0.10,

  // Display
  DISPLAY_CYCLE_DAYS: 4,
  DISPLAY_TOP_ITEMS: 20,

  // Thresholds
  CRITICAL_DAYS: 2,
  WARNING_DAYS: 4,
  ATTENTION_DAYS: 7,

  BESTSELLER_VELOCITY: 5,
  SLOWMOVER_VELOCITY: 2,
  SLOWMOVER_MIN_QTY: 25,

  // WMA
  WMA_PERIOD1_DAYS: 14,
  WMA_PERIOD1_WEIGHT: 0.70,
  WMA_PERIOD2_WEIGHT: 0.30,

  ANOMALY_MULTIPLIER: 3,
  DEAD_STOCK_DAYS: 60,
  LEAD_TIME_DAYS: 3,

  NEW_PRODUCT_WAIT_DAYS: 7,
  NEW_PRODUCT_DEFAULT_VEL: 1,

  // Budget
  BUDGET_MAX_WARNA: 25,
  BUDGET_MAX_BW: 250,
  WARNA_SUPER_VELOCITY: 5,
};

// No maturity dampening — matches bot exactly

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

// ─── Types ────────────────────────────────────────────────

export type DosStatus = "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

export interface StockOutRecord {
  product_id: string;
  qty_kirim: number;
  qty_pesan: number;
  created_at: string;
  toko: string | null;
  harga_satuan: number;
  harga_type: string;
}

export interface WMAInfo {
  velocity: number;
  adjustedVelocity: number;
  period1Days: number;
  period2Days: number;
  totalDays: number;
  totalQty: number;
  period1Velocity: number;
  period2Velocity: number;
  dataStatus: "full" | "partial" | "minimal" | "none";
  isImmature: boolean;
}

export interface ProductAnalysis {
  kode: string;
  nama: string;
  productId: string;
  currentStock: number;
  velocity: number;
  daysOfStock: number;
  dosStatus: DosStatus;
  recommendedQty: number;
  batchSize: number;
  isSpecialColor: "black" | "white" | null;
  targetDays: number;
  targetStock: number;
  isBestSeller: boolean;
  isStockOut: boolean;
  combinedScore: number;
  trendChange: number;
  cost: number;
  unitPrice: number;
  wmaInfo: WMAInfo | null;
}

// ─── Helpers ──────────────────────────────────────────────

export function identifyColorGroup(kode: string): "black" | "white" | null {
  const upper = kode.toUpperCase();
  for (const kw of COLOR_BLACK) if (upper.includes(kw)) return "black";
  for (const kw of COLOR_WHITE) if (upper.includes(kw)) return "white";
  return null;
}

export function isBlackWhiteCode(kode: string): boolean {
  return identifyColorGroup(kode) !== null;
}

function getBatchSize(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.BATCH_BW : RULES.BATCH;
}

function getSafetyDays(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
}

function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── WMA Velocity (EXACT bot parity) ─────────────────────

function buildDailySalesMap(sales: StockOutRecord[], productId: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const key = s.created_at.slice(0, 10);
    // Bot parity: use qty_kirim (terkirim), not qty_pesan
    map[key] = (map[key] ?? 0) + s.qty_kirim;
  }
  return map;
}

export function calculateWMAVelocity(
  allSales: StockOutRecord[],
  products: ProductWithDetails[]
): Record<string, WMAInfo> {
  const wmaData: Record<string, WMAInfo> = {};
  const t = today();
  const period1Start = new Date(t.getTime() - RULES.WMA_PERIOD1_DAYS * 86400000);
  const period2Start = new Date(t.getTime() - 30 * 86400000);

  for (const product of products) {
    const dailySales = buildDailySalesMap(allSales, product.id);
    const allDailyQty: number[] = [];

    for (const dateKey in dailySales) {
      allDailyQty.push(dailySales[dateKey]);
    }

    const avgDaily = allDailyQty.length > 0
      ? allDailyQty.reduce((a, b) => a + b, 0) / allDailyQty.length
      : 0;
    const anomalyThreshold = avgDaily * RULES.ANOMALY_MULTIPLIER;

    let period1Total = 0, period1Days = 0;
    let period2Total = 0, period2Days = 0;

    for (const dateKey in dailySales) {
      const saleDate = new Date(dateKey + "T00:00:00");
      const qty = dailySales[dateKey];

      // Skip anomalies
      if (anomalyThreshold > 0 && qty > anomalyThreshold) continue;

      if (saleDate >= period1Start) {
        period1Total += qty;
        period1Days++;
      } else if (saleDate >= period2Start) {
        period2Total += qty;
        period2Days++;
      }
    }

    const totalDays = period1Days + period2Days;
    const totalQty = period1Total + period2Total;
    const minDaysForCalc = 7;

    // Bot parity: divide by ACTIVE sale days (not calendar days)
    const vel1 = period1Days > 0 ? period1Total / Math.max(period1Days, minDaysForCalc) : 0;
    const vel2 = period2Days > 0 ? period2Total / Math.max(period2Days, minDaysForCalc) : 0;

    let velocity: number;
    let dataStatus: WMAInfo["dataStatus"];

    if (totalDays >= 14) {
      velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT;
      dataStatus = "full";
    } else if (totalDays >= 7) {
      velocity = vel1 * RULES.WMA_PERIOD1_WEIGHT + vel2 * RULES.WMA_PERIOD2_WEIGHT;
      dataStatus = "partial";
    } else if (totalDays > 0) {
      velocity = totalQty / minDaysForCalc;
      dataStatus = "minimal";
    } else {
      velocity = 0;
      dataStatus = "none";
    }

    // No maturity dampening — exact bot parity
    const adjustedVelocity = velocity;

    wmaData[product.id] = {
      velocity,
      adjustedVelocity,
      period1Days,
      period2Days,
      totalDays,
      totalQty,
      period1Velocity: vel1,
      period2Velocity: vel2,
      dataStatus,
      isImmature: false,
    };
  }

  return wmaData;
}

// ─── Trend Data (EXACT bot parity) ────────────────────────

export interface TrendInfo {
  thisWeek: number;
  lastWeek: number;
  change: number;
}

export function calculateTrendData(
  allSales: StockOutRecord[],
  products: ProductWithDetails[]
): Record<string, TrendInfo> {
  const t = today();
  const weekAgo = new Date(t.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(t.getTime() - 14 * 86400000);

  const thisWeek: Record<string, number> = {};
  const lastWeek: Record<string, number> = {};

  const productIdSet = new Set(products.map(p => p.id));

  for (const s of allSales) {
    if (!productIdSet.has(s.product_id)) continue;
    const d = new Date(s.created_at);
    // Bot parity: use qty_kirim
    if (d >= weekAgo) {
      thisWeek[s.product_id] = (thisWeek[s.product_id] ?? 0) + s.qty_kirim;
    } else if (d >= twoWeeksAgo && d < weekAgo) {
      lastWeek[s.product_id] = (lastWeek[s.product_id] ?? 0) + s.qty_kirim;
    }
  }

  const trendData: Record<string, TrendInfo> = {};
  for (const product of products) {
    const tw = thisWeek[product.id] ?? 0;
    const lw = lastWeek[product.id] ?? 0;
    const change = lw > 0 ? (tw - lw) / lw : (tw > 0 ? 1 : 0);
    trendData[product.id] = { thisWeek: tw, lastWeek: lw, change };
  }

  return trendData;
}

function getTrendScore(productId: string, trendData: Record<string, TrendInfo>): number {
  if (!trendData[productId]) return 0.5;
  const change = trendData[productId].change;
  return Math.max(0, Math.min(1, (change + 1) / 2));
}

// ─── DOS Status ───────────────────────────────────────────

function getDosStatus(dos: number): DosStatus {
  if (dos <= RULES.CRITICAL_DAYS) return "CRITICAL";
  if (dos <= RULES.WARNING_DAYS) return "WARNING";
  if (dos <= RULES.ATTENTION_DAYS) return "ATTENTION";
  return "SAFE";
}

// ─── First Sale Date ──────────────────────────────────────

function getFirstSaleDate(sales: StockOutRecord[], productId: string): Date | null {
  let earliest: Date | null = null;
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const d = new Date(s.created_at);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

// ─── Get Harga Modal ──────────────────────────────────────

function getHargaModal(product: ProductWithDetails): number {
  return product.prices?.harga_modal || 7000;
}

// ─── Main Analysis (EXACT bot parity) ────────────────────

export function analyzeAllProducts(
  products: ProductWithDetails[],
  allSales: StockOutRecord[]
): ProductAnalysis[] {
  const results: ProductAnalysis[] = [];
  const wmaData = calculateWMAVelocity(allSales, products);
  const trendData = calculateTrendData(allSales, products);

  // Collect all adjusted velocities for normalization
  const allVelocities: number[] = [];
  for (const product of products) {
    const wma = wmaData[product.id];
    const vel = wma?.adjustedVelocity ?? 0;
    if (vel > 0) allVelocities.push(vel);
  }
  const maxVelocity = allVelocities.length > 0 ? Math.max(...allVelocities) : 1;
  const maxDays = RULES.ATTENTION_DAYS + 7;

  for (const product of products) {
    const currentStock = product.stock?.jumlah ?? 0;
    const colorGroup = identifyColorGroup(product.kode);
    const isBW = isBlackWhiteCode(product.kode);
    const batchSize = getBatchSize(product.kode);
    const safetyDays = getSafetyDays(product.kode);
    const minOrder = RULES.MIN_ORDER_PER_CODE;

    // New product check
    const firstSale = getFirstSaleDate(allSales, product.id);
    const ageDays = firstSale
      ? Math.floor((today().getTime() - firstSale.getTime()) / 86400000)
      : 999;
    const isNew = ageDays < RULES.NEW_PRODUCT_WAIT_DAYS;

    const wma = wmaData[product.id];
    const rawVelocity = isNew ? RULES.NEW_PRODUCT_DEFAULT_VEL : (wma?.velocity ?? 0);
    let velocity = isNew ? RULES.NEW_PRODUCT_DEFAULT_VEL : (wma?.adjustedVelocity ?? 0);

    // Bot parity: slow mover skip
    const isSlowMover = velocity < RULES.SLOWMOVER_VELOCITY;
    const isStockOut = currentStock === 0;

    if (isStockOut && isSlowMover) {
      continue;
    }

    // Days of stock
    const daysOfStock = velocity > 0 ? currentStock / velocity : (currentStock > 0 ? 999 : 0);

    // Reorder target (EXACT bot: cycle + safety + lead time)
    const targetDays = RULES.CYCLE_DAYS + safetyDays + RULES.LEAD_TIME_DAYS;
    const targetStock = Math.ceil(velocity * targetDays);
    const butuh = targetStock - currentStock;

    // Bot parity: zero stock force buy
    let rawButuh = butuh;
    if (isStockOut && velocity > 0 && rawButuh <= 0) {
      rawButuh = batchSize;
    }

    // Bot parity: batch rounding with min order
    let recommendedQty = 0;
    if (rawButuh > 0) {
      if (isBW) {
        recommendedQty = Math.max(batchSize, roundUpToBatch(rawButuh, batchSize));
      } else {
        recommendedQty = Math.max(minOrder, roundUpToBatch(rawButuh, minOrder));
      }
    }

    // Bot does NOT have best seller push or safety clamp — removed for exact parity

    // Harga & cost
    const unitPrice = getHargaModal(product);
    const cost = recommendedQty * unitPrice;

    // Best seller
    const isBestSeller = velocity >= RULES.BESTSELLER_VELOCITY;

    // Priority scoring (EXACT bot)
    const velocityScore = velocity / maxVelocity;
    const urgencyScore = 1 - Math.min(daysOfStock / maxDays, 1);
    const trendScore = getTrendScore(product.id, trendData);
    const stockScore = isStockOut ? 1 : (1 - Math.min(currentStock / (targetStock || 1), 1));

    const stockOutBonus = (isStockOut && isBestSeller) ? 0.3 : 0;
    const leadTimeBonus = daysOfStock <= RULES.LEAD_TIME_DAYS ? 0.2 : 0;

    const combinedScore =
      (velocityScore * RULES.WEIGHT_VELOCITY) +
      (urgencyScore * RULES.WEIGHT_URGENCY) +
      (trendScore * RULES.WEIGHT_TREND) +
      (stockScore * RULES.WEIGHT_STOCK) +
      stockOutBonus + leadTimeBonus;

    const trendChange = trendData[product.id]?.change ?? 0;
    const dosStatus = getDosStatus(daysOfStock);

    results.push({
      kode: product.kode,
      nama: product.nama,
      productId: product.id,
      currentStock,
      velocity: Math.round(velocity * 100) / 100,
      daysOfStock: Math.round(daysOfStock * 10) / 10,
      dosStatus,
      recommendedQty,
      batchSize,
      isSpecialColor: colorGroup,
      targetDays,
      targetStock,
      isBestSeller,
      isStockOut,
      combinedScore: Math.round(combinedScore * 1000) / 1000,
      trendChange: Math.round(trendChange * 100) / 100,
      cost,
      unitPrice,
      wmaInfo: wma ?? null,
    });
  }

  // Sort by combinedScore DESC (bot behavior)
  results.sort((a, b) => b.combinedScore - a.combinedScore);

  return results;
}

// ─── Status Counts ────────────────────────────────────────

export function getStatusCounts(analyses: ProductAnalysis[]) {
  let critical = 0, warning = 0, attention = 0, safe = 0;
  for (const a of analyses) {
    switch (a.dosStatus) {
      case "CRITICAL": critical++; break;
      case "WARNING": warning++; break;
      case "ATTENTION": attention++; break;
      case "SAFE": safe++; break;
    }
  }
  return { critical, warning, attention, safe };
}
