/**
 * Stock Analytics Engine — Rule-Based, Deterministic
 * All calculations are transparent and configurable via stockAnalyticsConfig.
 */

import {
  VELOCITY_CONFIG,
  ANOMALY_CONFIG,
  DOS_THRESHOLDS,
  SAFETY_STOCK_CONFIG,
  PRIORITY_WEIGHTS,
  TREND_CONFIG,
  DEAD_STOCK_CONFIG,
  NEW_PRODUCT_CONFIG,
  BATCH_CONFIG,
  COLOR_GROUPS,
  RESTOCK_SCHEDULE,
  type DosStatus,
  type TrendStatus,
} from "./stockAnalyticsConfig";
import type { ProductWithDetails } from "@/hooks/useProducts";
import type { StockOutRecord } from "@/hooks/useSalesAnalysis";

// ─── Types ────────────────────────────────────────────────

export interface ProductAnalysis {
  kode: string;
  nama: string;
  productId: string;
  currentStock: number;
  velocity: number;
  daysOfStock: number;
  dosStatus: DosStatus;
  trend: TrendStatus;
  trendPct: number;
  priorityScore: number;
  safetyStock: number;
  recommendedQty: number;
  batchSize: number;
  isSpecialColor: "black" | "white" | null;
  isDeadStock: boolean;
  isNewProduct: boolean;
  nextRestockDay: string;      // YYYY-MM-DD
  recommendedOrderDate: string; // YYYY-MM-DD
  daysSinceLastSale: number;
  avgDaily14: number;
  avgDaily15_30: number;
}

// ─── Helpers ──────────────────────────────────────────────

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
}

export function identifyColorGroup(kode: string): "black" | "white" | null {
  const upper = kode.toUpperCase();
  for (const keyword of COLOR_GROUPS.black) {
    if (upper.includes(keyword)) return "black";
  }
  for (const keyword of COLOR_GROUPS.white) {
    if (upper.includes(keyword)) return "white";
  }
  return null;
}

export function getBatchSize(kode: string): number {
  const group = identifyColorGroup(kode);
  if (group === "black") return BATCH_CONFIG.blackBatch;
  if (group === "white") return BATCH_CONFIG.whiteBatch;
  return BATCH_CONFIG.normalBatch;
}

function getSafetyDays(kode: string): number {
  const group = identifyColorGroup(kode);
  return group ? SAFETY_STOCK_CONFIG.specialDays : SAFETY_STOCK_CONFIG.normalDays;
}

/** Round up to nearest batch multiple */
function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

// ─── Daily Sales Map Builder ──────────────────────────────

function buildDailySalesMap(
  sales: StockOutRecord[],
  productId: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const key = s.created_at.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + s.qty_kirim);
  }
  return map;
}

// ─── Anomaly Filter ───────────────────────────────────────

function filterAnomalies(dailyQtys: number[]): number[] {
  if (dailyQtys.length === 0) return [];
  const avg = dailyQtys.reduce((a, b) => a + b, 0) / dailyQtys.length;
  const threshold = avg * ANOMALY_CONFIG.multiplier;
  return dailyQtys.filter((q) => q <= threshold);
}

// ─── Core Calculations ───────────────────────────────────

function calcVelocity(
  dailyMap: Map<string, number>
): { velocity: number; avg14: number; avg15_30: number } {
  const t = today();

  // Recent: last 14 days
  const recentQtys: number[] = [];
  for (let i = 0; i < VELOCITY_CONFIG.recentPeriodDays; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    const qty = dailyMap.get(toDateKey(d)) ?? 0;
    recentQtys.push(qty);
  }

  // Older: day 15-30
  const olderQtys: number[] = [];
  for (let i = VELOCITY_CONFIG.recentPeriodDays; i < VELOCITY_CONFIG.recentPeriodDays + VELOCITY_CONFIG.olderPeriodDays; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    const qty = dailyMap.get(toDateKey(d)) ?? 0;
    olderQtys.push(qty);
  }

  // Filter anomalies
  const filteredRecent = filterAnomalies(recentQtys);
  const filteredOlder = filterAnomalies(olderQtys);

  const avg14 = filteredRecent.length > 0
    ? filteredRecent.reduce((a, b) => a + b, 0) / filteredRecent.length
    : 0;

  const avg15_30 = filteredOlder.length > 0
    ? filteredOlder.reduce((a, b) => a + b, 0) / filteredOlder.length
    : 0;

  const velocity = avg14 * VELOCITY_CONFIG.recentWeight + avg15_30 * VELOCITY_CONFIG.olderWeight;

  return { velocity, avg14, avg15_30 };
}

function calcDaysOfStock(stock: number, velocity: number): number {
  if (velocity <= 0) return stock > 0 ? 999 : 0;
  return stock / velocity;
}

function getDosStatus(dos: number): DosStatus {
  if (dos <= DOS_THRESHOLDS.critical) return "CRITICAL";
  if (dos <= DOS_THRESHOLDS.warning) return "WARNING";
  if (dos <= DOS_THRESHOLDS.attention) return "ATTENTION";
  return "SAFE";
}

function calcTrend(dailyMap: Map<string, number>): { trend: TrendStatus; pct: number } {
  const t = today();
  let recent = 0;
  let previous = 0;

  for (let i = 0; i < TREND_CONFIG.periodDays; i++) {
    const d1 = new Date(t);
    d1.setDate(d1.getDate() - i);
    recent += dailyMap.get(toDateKey(d1)) ?? 0;

    const d2 = new Date(t);
    d2.setDate(d2.getDate() - TREND_CONFIG.periodDays - i);
    previous += dailyMap.get(toDateKey(d2)) ?? 0;
  }

  if (previous === 0 && recent === 0) return { trend: "STABLE", pct: 0 };
  if (previous === 0) return { trend: "UP", pct: 1 };

  const pct = (recent - previous) / previous;
  if (pct > TREND_CONFIG.changeThreshold) return { trend: "UP", pct };
  if (pct < -TREND_CONFIG.changeThreshold) return { trend: "DOWN", pct };
  return { trend: "STABLE", pct };
}

function calcDaysSinceLastSale(dailyMap: Map<string, number>): number {
  const t = today();
  for (let i = 0; i < 365; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    if ((dailyMap.get(toDateKey(d)) ?? 0) > 0) return i;
  }
  return 999;
}

function isDeadStock(daysSinceLastSale: number): boolean {
  return daysSinceLastSale >= DEAD_STOCK_CONFIG.thresholdDays;
}

function isNewProduct(product: ProductWithDetails): boolean {
  const created = new Date(product.id); // fallback
  // Use a heuristic: if no stock_out data older than 7 days, treat as new
  // We'll handle this in the main function with sales data
  return false;
}

function calcPriorityScore(
  velocity: number,
  dos: number,
  trend: TrendStatus,
  currentStock: number,
  maxVelocity: number
): number {
  // Normalize velocity: 0-1 relative to max
  const velScore = maxVelocity > 0 ? Math.min(velocity / maxVelocity, 1) : 0;

  // Urgency: inverse of DOS, capped
  const urgScore = Math.max(0, Math.min(1, 1 - dos / 14));

  // Trend score
  const trendScore = trend === "UP" ? 1 : trend === "STABLE" ? 0.5 : 0;

  // Stock level: lower = higher score
  const stockScore = Math.max(0, Math.min(1, 1 - currentStock / 200));

  const raw =
    velScore * PRIORITY_WEIGHTS.velocity +
    urgScore * PRIORITY_WEIGHTS.urgency +
    trendScore * PRIORITY_WEIGHTS.trend +
    stockScore * PRIORITY_WEIGHTS.stockLevel;

  return Math.round(raw * 100);
}

// ─── Restock Schedule ─────────────────────────────────────

function getNextRestockDay(stockRunsOutDate: Date): { nextRestockDay: Date; orderDate: Date } {
  const orderDays = RESTOCK_SCHEDULE.orderDays;
  const leadTime = RESTOCK_SCHEDULE.leadTimeDays;

  // Need to order so that arrival <= stockRunsOutDate
  // arrival = orderDate + leadTime
  // orderDate = stockRunsOutDate - leadTime
  const latestOrder = new Date(stockRunsOutDate);
  latestOrder.setDate(latestOrder.getDate() - leadTime);

  // Find next valid order day <= latestOrder
  const findOrderDay = (fromDate: Date): Date => {
    const d = new Date(fromDate);
    // Go backwards to find the most recent valid order day
    for (let i = 0; i < 7; i++) {
      const dow = d.getDay();
      if (orderDays.includes(dow)) return d;
      d.setDate(d.getDate() - 1);
    }
    return fromDate;
  };

  // But also ensure orderDate >= today
  const t = today();
  let orderDate = findOrderDay(latestOrder);

  if (orderDate < t) {
    // Find next future order day from today
    orderDate = new Date(t);
    for (let i = 0; i < 7; i++) {
      if (orderDays.includes(orderDate.getDay())) break;
      orderDate.setDate(orderDate.getDate() + 1);
    }
  }

  const arrival = new Date(orderDate);
  arrival.setDate(arrival.getDate() + leadTime);

  return { nextRestockDay: arrival, orderDate };
}

// ─── Main Analysis Function ──────────────────────────────

export function analyzeAllProducts(
  products: ProductWithDetails[],
  allSales: StockOutRecord[]
): ProductAnalysis[] {
  const results: ProductAnalysis[] = [];

  // Pre-calc max velocity for normalization
  const velocities: number[] = [];
  const productDataMap = new Map<string, { dailyMap: Map<string, number>; vel: ReturnType<typeof calcVelocity> }>();

  for (const product of products) {
    const dailyMap = buildDailySalesMap(allSales, product.id);
    const vel = calcVelocity(dailyMap);
    velocities.push(vel.velocity);
    productDataMap.set(product.id, { dailyMap, vel });
  }

  const maxVelocity = Math.max(...velocities, 0.01);

  for (const product of products) {
    const data = productDataMap.get(product.id)!;
    const { dailyMap, vel } = data;
    const currentStock = product.stock?.jumlah ?? 0;
    const colorGroup = identifyColorGroup(product.kode);
    const batch = getBatchSize(product.kode);
    const safetyDays = getSafetyDays(product.kode);

    // Check new product
    const daysSinceLast = calcDaysSinceLastSale(dailyMap);
    const firstSaleDate = getFirstSaleDate(allSales, product.id);
    const productAgeDays = firstSaleDate
      ? Math.floor((today().getTime() - firstSaleDate.getTime()) / 86400000)
      : 999;
    const isNew = productAgeDays < NEW_PRODUCT_CONFIG.minAgeDays;

    const velocity = isNew ? NEW_PRODUCT_CONFIG.defaultVelocity : vel.velocity;
    const dos = calcDaysOfStock(currentStock, velocity);
    const dosStatus = getDosStatus(dos);
    const { trend, pct: trendPct } = calcTrend(dailyMap);
    const dead = isDeadStock(daysSinceLast);
    const priority = dead ? 0 : calcPriorityScore(velocity, dos, trend, currentStock, maxVelocity);

    // Safety stock & restock qty
    const safetyStock = Math.ceil(velocity * safetyDays);
    const targetStock = Math.ceil(velocity * (RESTOCK_SCHEDULE.leadTimeDays + safetyDays));
    const rawNeed = Math.max(0, targetStock - currentStock);
    const recommendedQty = roundUpToBatch(rawNeed, batch);

    // Restock schedule
    const stockRunsOut = new Date(today());
    stockRunsOut.setDate(stockRunsOut.getDate() + Math.floor(dos));
    const { nextRestockDay, orderDate } = getNextRestockDay(stockRunsOut);

    results.push({
      kode: product.kode,
      nama: product.nama,
      productId: product.id,
      currentStock,
      velocity: Math.round(velocity * 100) / 100,
      daysOfStock: Math.round(dos * 10) / 10,
      dosStatus,
      trend,
      trendPct: Math.round(trendPct * 100),
      priorityScore: priority,
      safetyStock,
      recommendedQty,
      batchSize: batch,
      isSpecialColor: colorGroup,
      isDeadStock: dead,
      isNewProduct: isNew,
      nextRestockDay: toDateKey(nextRestockDay),
      recommendedOrderDate: toDateKey(orderDate),
      daysSinceLastSale: daysSinceLast,
      avgDaily14: Math.round(vel.avg14 * 100) / 100,
      avgDaily15_30: Math.round(vel.avg15_30 * 100) / 100,
    });
  }

  // Sort by priority descending
  results.sort((a, b) => b.priorityScore - a.priorityScore);
  return results;
}

function getFirstSaleDate(allSales: StockOutRecord[], productId: string): Date | null {
  let earliest: Date | null = null;
  for (const s of allSales) {
    if (s.product_id !== productId) continue;
    const d = new Date(s.created_at);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

// ─── Summary Helpers ──────────────────────────────────────

export function getStatusCounts(analyses: ProductAnalysis[]) {
  let critical = 0, warning = 0, attention = 0, safe = 0, dead = 0;
  for (const a of analyses) {
    if (a.isDeadStock) { dead++; continue; }
    switch (a.dosStatus) {
      case "CRITICAL": critical++; break;
      case "WARNING": warning++; break;
      case "ATTENTION": attention++; break;
      case "SAFE": safe++; break;
    }
  }
  return { critical, warning, attention, safe, dead };
}

export function getTotalRestockCost(
  analyses: ProductAnalysis[],
  products: ProductWithDetails[]
): number {
  const priceMap = new Map<string, number>();
  for (const p of products) {
    priceMap.set(p.id, p.prices?.harga_modal ?? 0);
  }
  let total = 0;
  for (const a of analyses) {
    if (a.recommendedQty > 0) {
      total += a.recommendedQty * (priceMap.get(a.productId) ?? 0);
    }
  }
  return total;
}
