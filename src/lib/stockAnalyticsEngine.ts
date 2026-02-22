/**
 * Stock Analytics Engine — Bot Parity Mode
 * Clones Telegram bot behavior exactly.
 * Rule-based, deterministic, no ML/AI.
 */

import type { ProductWithDetails } from "@/hooks/useProducts";

// ─── Constants (match bot) ────────────────────────────────
const CYCLE_DAYS = 3;
const SAFETY_NORMAL = 1;
const SAFETY_BW = 2;
const BATCH_NORMAL = 25;
const BATCH_BW = 50;
const ANOMALY_MULTIPLIER = 3;
const NEW_PRODUCT_AGE_DAYS = 7;
const NEW_PRODUCT_VELOCITY = 1;

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

// ─── Types ────────────────────────────────────────────────

export type DosStatus = "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

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
}

export interface StockOutRecord {
  product_id: string;
  qty_kirim: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function identifyColorGroup(kode: string): "black" | "white" | null {
  const upper = kode.toUpperCase();
  for (const kw of COLOR_BLACK) if (upper.includes(kw)) return "black";
  for (const kw of COLOR_WHITE) if (upper.includes(kw)) return "white";
  return null;
}

function getBatchSize(kode: string): number {
  const g = identifyColorGroup(kode);
  return g ? BATCH_BW : BATCH_NORMAL;
}

function getSafetyDays(kode: string): number {
  const g = identifyColorGroup(kode);
  return g ? SAFETY_BW : SAFETY_NORMAL;
}

function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

// ─── Daily Sales Map ──────────────────────────────────────

function buildDailySalesMap(sales: StockOutRecord[], productId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const key = s.created_at.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + s.qty_kirim);
  }
  return map;
}

function getDailyQtys(dailyMap: Map<string, number>, startDay: number, count: number): number[] {
  const t = today();
  const qtys: number[] = [];
  for (let i = startDay; i < startDay + count; i++) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    qtys.push(dailyMap.get(toDateKey(d)) ?? 0);
  }
  return qtys;
}

// ─── Anomaly Filter ───────────────────────────────────────

function filterAnomalies(qtys: number[]): number[] {
  if (qtys.length === 0) return [];
  const avg = qtys.reduce((a, b) => a + b, 0) / qtys.length;
  const threshold = avg * ANOMALY_MULTIPLIER;
  return qtys.filter((q) => q <= threshold);
}

// ─── WMA Velocity (bot-style) ─────────────────────────────

function calcVelocity(dailyMap: Map<string, number>): number {
  const recent = getDailyQtys(dailyMap, 0, 14);
  const older = getDailyQtys(dailyMap, 14, 16);

  const filteredRecent = filterAnomalies(recent);
  const filteredOlder = filterAnomalies(older);

  const avg14 = filteredRecent.length > 0
    ? filteredRecent.reduce((a, b) => a + b, 0) / filteredRecent.length
    : 0;
  const avg15_30 = filteredOlder.length > 0
    ? filteredOlder.reduce((a, b) => a + b, 0) / filteredOlder.length
    : 0;

  return avg14 * 0.7 + avg15_30 * 0.3;
}

// ─── DOS Status ───────────────────────────────────────────

function getDosStatus(dos: number): DosStatus {
  if (dos <= 2) return "CRITICAL";
  if (dos <= 4) return "WARNING";
  if (dos <= 7) return "ATTENTION";
  return "SAFE";
}

// ─── First Sale Date (for new product check) ──────────────

function getFirstSaleDate(sales: StockOutRecord[], productId: string): Date | null {
  let earliest: Date | null = null;
  for (const s of sales) {
    if (s.product_id !== productId) continue;
    const d = new Date(s.created_at);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

// ─── Main Analysis ───────────────────────────────────────

export function analyzeAllProducts(
  products: ProductWithDetails[],
  allSales: StockOutRecord[]
): ProductAnalysis[] {
  const results: ProductAnalysis[] = [];

  for (const product of products) {
    const dailyMap = buildDailySalesMap(allSales, product.id);
    const currentStock = product.stock?.jumlah ?? 0;
    const colorGroup = identifyColorGroup(product.kode);
    const batch = getBatchSize(product.kode);
    const safetyDays = getSafetyDays(product.kode);

    // New product check
    const firstSale = getFirstSaleDate(allSales, product.id);
    const ageDays = firstSale
      ? Math.floor((today().getTime() - firstSale.getTime()) / 86400000)
      : 999;
    const isNew = ageDays < NEW_PRODUCT_AGE_DAYS;

    const velocity = isNew ? NEW_PRODUCT_VELOCITY : calcVelocity(dailyMap);

    // Days of stock
    const daysOfStock = velocity > 0 ? currentStock / velocity : (currentStock > 0 ? 999 : 0);

    // Reorder target (bot style)
    const targetDays = CYCLE_DAYS + safetyDays;
    const targetStock = Math.ceil(velocity * targetDays);
    const rawNeed = targetStock - currentStock;
    const recommendedQty = rawNeed > 0 ? roundUpToBatch(rawNeed, batch) : 0;

    // Status
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
      batchSize: batch,
      isSpecialColor: colorGroup,
      targetDays,
      targetStock,
    });
  }

  // Sort: CRITICAL first, then WARNING, ATTENTION, SAFE
  const statusOrder: Record<DosStatus, number> = { CRITICAL: 0, WARNING: 1, ATTENTION: 2, SAFE: 3 };
  results.sort((a, b) => {
    const so = statusOrder[a.dosStatus] - statusOrder[b.dosStatus];
    if (so !== 0) return so;
    return a.daysOfStock - b.daysOfStock;
  });

  return results;
}

// ─── Summary ──────────────────────────────────────────────

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
