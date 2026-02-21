/**
 * Stock Analytics Engine — PRO Edition
 * Rule-Based, Deterministic, with Predictive Layer
 * All calculations are transparent and configurable via stockAnalyticsConfig.
 */

import {
  VELOCITY_CONFIG,
  ANOMALY_CONFIG,
  SMOOTHING_CONFIG,
  FORECAST_CONFIG,
  VOLATILITY_CONFIG,
  DYNAMIC_SAFETY_CONFIG,
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
  type VolatilityLevel,
} from "./stockAnalyticsConfig";
import type { ProductWithDetails } from "@/hooks/useProducts";
import type { StockOutRecord } from "@/hooks/useSalesAnalysis";

// ─── Types ────────────────────────────────────────────────

export interface ProductAnalysis {
  kode: string;
  nama: string;
  productId: string;
  currentStock: number;

  // Velocity (WMA)
  velocity: number;
  avgDaily14: number;
  avgDaily15_30: number;

  // Forecast (WMA + Exponential Smoothing blend)
  forecastDailyDemand: number;
  forecast7Days: number;
  forecast14Days: number;

  // Volatility
  demandStdDev: number;
  demandCV: number;
  volatilityLevel: VolatilityLevel;

  // Dynamic Safety Stock
  safetyStock: number;
  safetyStockDynamic: number;

  // Reorder Point
  reorderPoint: number;
  needsReorder: boolean;

  // Days of Stock
  daysOfStock: number;
  dosStatus: DosStatus;

  // Predicted Stockout
  predictedStockoutDate: string; // YYYY-MM-DD

  // Trend
  trend: TrendStatus;
  trendPct: number;

  // Priority
  priorityScore: number;

  // Restock
  recommendedQty: number;
  batchSize: number;
  nextRestockDay: string;
  recommendedOrderDate: string;

  // Metadata
  isSpecialColor: "black" | "white" | null;
  isDeadStock: boolean;
  isNewProduct: boolean;
  daysSinceLastSale: number;
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

function getMinSafetyDays(kode: string): number {
  const group = identifyColorGroup(kode);
  return group ? DYNAMIC_SAFETY_CONFIG.minSpecialDays : DYNAMIC_SAFETY_CONFIG.minNormalDays;
}

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

/** Get daily quantities array for last N days (index 0 = most recent) */
function getDailyQtys(dailyMap: Map<string, number>, days: number): number[] {
  const t = today();
  const qtys: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    qtys.push(dailyMap.get(toDateKey(d)) ?? 0);
  }
  return qtys;
}

// ─── Anomaly Filter ───────────────────────────────────────

function filterAnomalies(dailyQtys: number[]): number[] {
  if (dailyQtys.length === 0) return [];
  const avg = dailyQtys.reduce((a, b) => a + b, 0) / dailyQtys.length;
  const threshold = avg * ANOMALY_CONFIG.multiplier;
  return dailyQtys.filter((q) => q <= threshold);
}

// ─── Velocity (WMA) ──────────────────────────────────────

function calcVelocity(
  dailyMap: Map<string, number>
): { velocity: number; avg14: number; avg15_30: number } {
  const recentQtys = getDailyQtys(dailyMap, VELOCITY_CONFIG.recentPeriodDays);
  const olderQtys: number[] = [];
  const t = today();
  for (let i = VELOCITY_CONFIG.recentPeriodDays; i < VELOCITY_CONFIG.recentPeriodDays + VELOCITY_CONFIG.olderPeriodDays; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    olderQtys.push(dailyMap.get(toDateKey(d)) ?? 0);
  }

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

// ─── Exponential Smoothing ────────────────────────────────

function calcExponentialSmoothing(dailyMap: Map<string, number>): number {
  const days = 30;
  const qtys = getDailyQtys(dailyMap, days);
  const filtered = filterAnomalies(qtys);
  if (filtered.length === 0) return 0;

  // Reverse so oldest first for ES
  const ordered = [...filtered].reverse();
  const alpha = SMOOTHING_CONFIG.alpha;

  let forecast = ordered[0];
  for (let i = 1; i < ordered.length; i++) {
    forecast = alpha * ordered[i] + (1 - alpha) * forecast;
  }
  return forecast;
}

// ─── Forecast (Blended WMA + ES) ─────────────────────────

function calcForecast(
  velocity: number,
  esValue: number
): { daily: number; f7: number; f14: number } {
  const daily = velocity * FORECAST_CONFIG.wmaWeight + esValue * FORECAST_CONFIG.esWeight;
  return {
    daily,
    f7: daily * FORECAST_CONFIG.shortTermDays,
    f14: daily * FORECAST_CONFIG.longTermDays,
  };
}

// ─── Demand Volatility ───────────────────────────────────

function calcVolatility(
  dailyMap: Map<string, number>
): { stdDev: number; cv: number; level: VolatilityLevel } {
  const qtys = getDailyQtys(dailyMap, VOLATILITY_CONFIG.periodDays);
  const filtered = filterAnomalies(qtys);

  if (filtered.length < 2) return { stdDev: 0, cv: 0, level: "STABLE" };

  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  if (mean === 0) return { stdDev: 0, cv: 0, level: "STABLE" };

  const variance = filtered.reduce((sum, v) => sum + (v - mean) ** 2, 0) / filtered.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  let level: VolatilityLevel = "STABLE";
  if (cv > VOLATILITY_CONFIG.mediumThreshold) level = "VOLATILE";
  else if (cv >= VOLATILITY_CONFIG.stableThreshold) level = "MEDIUM";

  return { stdDev, cv, level };
}

// ─── Dynamic Safety Stock ─────────────────────────────────

function calcDynamicSafetyStock(
  stdDev: number,
  kode: string
): number {
  const leadTime = RESTOCK_SCHEDULE.leadTimeDays;
  const z = DYNAMIC_SAFETY_CONFIG.zScore;
  const dynamic = z * stdDev * Math.sqrt(leadTime);

  // Enforce minimum floor
  const minDays = getMinSafetyDays(kode);
  // We don't know velocity here, so return the raw dynamic value
  // The caller will enforce the minimum
  return Math.max(dynamic, 0);
}

// ─── Days of Stock ────────────────────────────────────────

function calcDaysOfStock(stock: number, forecastDaily: number): number {
  if (forecastDaily <= 0) return stock > 0 ? 999 : 0;
  return stock / forecastDaily;
}

function getDosStatus(dos: number): DosStatus {
  if (dos <= DOS_THRESHOLDS.critical) return "CRITICAL";
  if (dos <= DOS_THRESHOLDS.warning) return "WARNING";
  if (dos <= DOS_THRESHOLDS.attention) return "ATTENTION";
  return "SAFE";
}

// ─── Trend ────────────────────────────────────────────────

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

// ─── Dead Stock & Last Sale ───────────────────────────────

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

// ─── Priority Score (ADVANCED) ────────────────────────────

function calcPriorityScore(
  forecastDaily: number,
  dos: number,
  trend: TrendStatus,
  volatilityCV: number,
  currentStock: number,
  maxForecast: number
): number {
  // Urgency: inverse of DOS, capped at 14
  const urgScore = Math.max(0, Math.min(1, 1 - dos / 14));

  // Velocity/forecast normalized
  const velScore = maxForecast > 0 ? Math.min(forecastDaily / maxForecast, 1) : 0;

  // Volatility risk: higher CV = higher risk
  const volScore = Math.min(volatilityCV / 2, 1); // cap at CV=2

  // Trend
  const trendScore = trend === "UP" ? 1 : trend === "STABLE" ? 0.5 : 0;

  // Stock level
  const stockScore = Math.max(0, Math.min(1, 1 - currentStock / 200));

  const raw =
    urgScore * PRIORITY_WEIGHTS.urgency +
    velScore * PRIORITY_WEIGHTS.velocity +
    volScore * PRIORITY_WEIGHTS.volatility +
    trendScore * PRIORITY_WEIGHTS.trend +
    stockScore * PRIORITY_WEIGHTS.stockLevel;

  return Math.round(raw * 100);
}

// ─── Restock Schedule ─────────────────────────────────────

function getNextRestockDay(stockRunsOutDate: Date): { nextRestockDay: Date; orderDate: Date } {
  const orderDays = RESTOCK_SCHEDULE.orderDays;
  const leadTime = RESTOCK_SCHEDULE.leadTimeDays;

  const latestOrder = new Date(stockRunsOutDate);
  latestOrder.setDate(latestOrder.getDate() - leadTime);

  const findOrderDay = (fromDate: Date): Date => {
    const d = new Date(fromDate);
    for (let i = 0; i < 7; i++) {
      if (orderDays.includes(d.getDay())) return d;
      d.setDate(d.getDate() - 1);
    }
    return fromDate;
  };

  const t = today();
  let orderDate = findOrderDay(latestOrder);

  if (orderDate < t) {
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

// ─── First Sale Date ──────────────────────────────────────

function getFirstSaleDate(allSales: StockOutRecord[], productId: string): Date | null {
  let earliest: Date | null = null;
  for (const s of allSales) {
    if (s.product_id !== productId) continue;
    const d = new Date(s.created_at);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

// ─── Main Analysis Function ──────────────────────────────

export function analyzeAllProducts(
  products: ProductWithDetails[],
  allSales: StockOutRecord[]
): ProductAnalysis[] {
  const results: ProductAnalysis[] = [];

  // Pre-compute all product data
  const productDataMap = new Map<string, {
    dailyMap: Map<string, number>;
    vel: ReturnType<typeof calcVelocity>;
    es: number;
    vol: ReturnType<typeof calcVolatility>;
  }>();

  const forecasts: number[] = [];

  for (const product of products) {
    const dailyMap = buildDailySalesMap(allSales, product.id);
    const vel = calcVelocity(dailyMap);
    const es = calcExponentialSmoothing(dailyMap);
    const vol = calcVolatility(dailyMap);
    const fc = calcForecast(vel.velocity, es);
    forecasts.push(fc.daily);
    productDataMap.set(product.id, { dailyMap, vel, es, vol });
  }

  const maxForecast = Math.max(...forecasts, 0.01);

  for (const product of products) {
    const data = productDataMap.get(product.id)!;
    const { dailyMap, vel, es, vol } = data;
    const currentStock = product.stock?.jumlah ?? 0;
    const colorGroup = identifyColorGroup(product.kode);
    const batch = getBatchSize(product.kode);
    const minSafetyDays = getMinSafetyDays(product.kode);

    // New product check
    const daysSinceLast = calcDaysSinceLastSale(dailyMap);
    const firstSaleDate = getFirstSaleDate(allSales, product.id);
    const productAgeDays = firstSaleDate
      ? Math.floor((today().getTime() - firstSaleDate.getTime()) / 86400000)
      : 999;
    const isNew = productAgeDays < NEW_PRODUCT_CONFIG.minAgeDays;

    const velocity = isNew ? NEW_PRODUCT_CONFIG.defaultVelocity : vel.velocity;
    const esValue = isNew ? NEW_PRODUCT_CONFIG.defaultVelocity : es;

    // Forecast
    const forecast = calcForecast(velocity, esValue);
    const forecastDaily = isNew ? NEW_PRODUCT_CONFIG.defaultVelocity : forecast.daily;

    // Dynamic safety stock
    const dynamicSS = calcDynamicSafetyStock(vol.stdDev, product.kode);
    const minFloor = forecastDaily * minSafetyDays;
    const safetyStockDynamic = Math.ceil(Math.max(dynamicSS, minFloor));
    const legacySafetyStock = Math.ceil(velocity * (colorGroup ? SAFETY_STOCK_CONFIG.specialDays : SAFETY_STOCK_CONFIG.normalDays));

    // Reorder point
    const reorderPoint = Math.ceil(forecastDaily * RESTOCK_SCHEDULE.leadTimeDays + safetyStockDynamic);
    const needsReorder = currentStock <= reorderPoint;

    // Days of stock (use forecast for better prediction)
    const dos = calcDaysOfStock(currentStock, forecastDaily);
    const dosStatus = getDosStatus(dos);

    // Predicted stockout date
    const stockoutDate = new Date(today());
    stockoutDate.setDate(stockoutDate.getDate() + Math.floor(dos));

    // Trend
    const { trend, pct: trendPct } = calcTrend(dailyMap);

    // Dead stock
    const dead = isDeadStock(daysSinceLast);

    // Priority (advanced)
    const priority = dead ? 0 : calcPriorityScore(
      forecastDaily, dos, trend, vol.cv, currentStock, maxForecast
    );

    // Restock qty: target = forecast × (lead_time + safety buffer equivalent days) = reorderPoint + buffer
    const targetStock = reorderPoint + Math.ceil(forecastDaily * minSafetyDays);
    const rawNeed = Math.max(0, targetStock - currentStock);
    const recommendedQty = roundUpToBatch(rawNeed, batch);

    // Restock schedule
    const { nextRestockDay, orderDate } = getNextRestockDay(stockoutDate);

    results.push({
      kode: product.kode,
      nama: product.nama,
      productId: product.id,
      currentStock,
      velocity: round2(velocity),
      avgDaily14: round2(vel.avg14),
      avgDaily15_30: round2(vel.avg15_30),
      forecastDailyDemand: round2(forecastDaily),
      forecast7Days: Math.round(forecast.f7),
      forecast14Days: Math.round(forecast.f14),
      demandStdDev: round2(vol.stdDev),
      demandCV: round2(vol.cv),
      volatilityLevel: vol.level,
      safetyStock: legacySafetyStock,
      safetyStockDynamic,
      reorderPoint,
      needsReorder,
      daysOfStock: round1(dos),
      dosStatus,
      predictedStockoutDate: toDateKey(stockoutDate),
      trend,
      trendPct: Math.round(trendPct * 100),
      priorityScore: priority,
      recommendedQty,
      batchSize: batch,
      isSpecialColor: colorGroup,
      isDeadStock: dead,
      isNewProduct: isNew,
      nextRestockDay: toDateKey(nextRestockDay),
      recommendedOrderDate: toDateKey(orderDate),
      daysSinceLastSale: daysSinceLast,
    });
  }

  results.sort((a, b) => b.priorityScore - a.priorityScore);
  return results;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round1(n: number): number { return Math.round(n * 10) / 10; }

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
