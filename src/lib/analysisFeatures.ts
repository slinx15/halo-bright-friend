/**
 * Analysis Features — Bot Parity
 * All analysis sub-features from the Telegram bot.
 */

import type { ProductWithDetails } from "@/hooks/useProducts";
import {
  type StockOutRecord,
  type ProductAnalysis,
  RULES,
  calculateWMAVelocity,
  calculateTrendData,
  isBlackWhiteCode,
} from "./stockAnalyticsEngine";

// ─── Types ────────────────────────────────────────────────

export interface TopSellerItem {
  kode: string;
  productId: string;
  totalQty: number;
  days: number;
  velocity: number;
  stok: number;
  daysLeft: number;
  isBestSeller: boolean;
}

export interface TrendItem {
  kode: string;
  productId: string;
  thisWeek: number;
  lastWeek: number;
  changePct: number;
  velocity: number;
  isBestSeller: boolean;
}

export interface DeadStockItem {
  kode: string;
  productId: string;
  stok: number;
  daysSinceLastSale: number;
  lastSaleDate: Date | null;
  nilai: number;
}

export interface LowStockItem {
  kode: string;
  productId: string;
  stok: number;
  velocity: number;
  isBestSeller: boolean;
}

export interface PredictionItem {
  kode: string;
  productId: string;
  stok: number;
  velocity: number;
  daysLeft: number;
  predictedDate: Date;
  urgency: "critical" | "warning" | "attention" | "safe";
  isBestSeller: boolean;
}

export interface ProfitItem {
  kode: string;
  productId: string;
  totalQty: number;
  modal: number;
  jual: number;
  margin: number;
  marginPersen: number;
  totalProfit: number;
  velocity: number;
  isBestSeller: boolean;
}

export interface TokoItem {
  nama: string;
  totalQty: number;
  totalNilai: number;
  transaksiCount: number;
  hariAktif: number;
  favorit: string[];
}

export interface BudgetEstimate {
  days: number;
  cost: number;
  items: number;
  qty: number;
}

export interface StatsData {
  totalSKU: number;
  totalStock: number;
  totalValue: number;
  outOfStock: number;
  bestSellerCount: number;
  criticalCount: number;
}

// ─── Helpers ──────────────────────────────────────────────

function getHargaModal(p: ProductWithDetails): number {
  return p.prices?.harga_modal || 7000;
}

function getHargaNormal(p: ProductWithDetails): number {
  return p.prices?.harga_normal || 0;
}

function getUrgencyLevel(days: number): PredictionItem["urgency"] {
  if (days <= RULES.CRITICAL_DAYS) return "critical";
  if (days <= RULES.WARNING_DAYS) return "warning";
  if (days <= RULES.ATTENTION_DAYS) return "attention";
  return "safe";
}

// ─── TOP SELLER ───────────────────────────────────────────

export function calcTopSellers(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): TopSellerItem[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const thirtyAgo = new Date(t.getTime() - 30 * 86400000);
  const wmaData = calculateWMAVelocity(sales, products);

  const WIB_OFFSET = 7 * 3600000;
  const salesMap: Record<string, { qty: number; days: Set<string> }> = {};
  for (const s of sales) {
    if (new Date(s.created_at) < thirtyAgo) continue;
    if (!salesMap[s.product_id]) salesMap[s.product_id] = { qty: 0, days: new Set() };
    salesMap[s.product_id].qty += s.qty_kirim;
    const wibDate = new Date(new Date(s.created_at).getTime() + WIB_OFFSET);
    salesMap[s.product_id].days.add(wibDate.toISOString().slice(0, 10));
  }

  const items: TopSellerItem[] = [];
  for (const p of products) {
    const s = salesMap[p.id];
    if (!s || s.qty === 0) continue;
    const wma = wmaData[p.id];
    // Use adjustedVelocity (maturity-dampened) for ranking
    const vel = wma?.adjustedVelocity ?? (s.qty / 30);
    const stok = p.stock?.jumlah ?? 0;
    const daysLeft = vel > 0 ? stok / vel : 999;
    items.push({
      kode: p.kode,
      productId: p.id,
      totalQty: s.qty,
      days: s.days.size,
      velocity: vel,
      stok,
      daysLeft,
      isBestSeller: vel >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.velocity - a.velocity);
  return items.slice(0, RULES.DISPLAY_TOP_ITEMS);
}

// ─── TREND ────────────────────────────────────────────────

export function calcTrend(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): TrendItem[] {
  const trendData = calculateTrendData(sales, products);
  const wmaData = calculateWMAVelocity(sales, products);

  const items: TrendItem[] = [];
  for (const p of products) {
    const t = trendData[p.id];
    if (!t || (t.thisWeek === 0 && t.lastWeek === 0)) continue;
    const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
    items.push({
      kode: p.kode,
      productId: p.id,
      thisWeek: t.thisWeek,
      lastWeek: t.lastWeek,
      changePct: t.change * 100,
      velocity: vel,
      isBestSeller: vel >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.thisWeek - a.thisWeek);
  return items;
}

// ─── DEAD STOCK ───────────────────────────────────────────

export function calcDeadStock(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): DeadStockItem[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const deadThreshold = new Date(t.getTime() - RULES.DEAD_STOCK_DAYS * 86400000);

  // Last sale date per product
  const lastSale: Record<string, Date> = {};
  for (const s of sales) {
    if (s.qty_pesan <= 0) continue;
    const d = new Date(s.created_at);
    if (!lastSale[s.product_id] || d > lastSale[s.product_id]) {
      lastSale[s.product_id] = d;
    }
  }

  const items: DeadStockItem[] = [];
  for (const p of products) {
    const stok = p.stock?.jumlah ?? 0;
    if (stok <= 0) continue;
    const ls = lastSale[p.id];
    if (!ls || ls < deadThreshold) {
      const daysSince = ls ? Math.floor((t.getTime() - ls.getTime()) / 86400000) : 999;
      items.push({
        kode: p.kode,
        productId: p.id,
        stok,
        daysSinceLastSale: daysSince,
        lastSaleDate: ls ?? null,
        nilai: stok * getHargaModal(p),
      });
    }
  }

  items.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
  return items;
}

// ─── LOW STOCK ────────────────────────────────────────────

export function calcLowStock(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): LowStockItem[] {
  const wmaData = calculateWMAVelocity(sales, products);

  const items: LowStockItem[] = products.map((p) => {
    const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
    return {
      kode: p.kode,
      productId: p.id,
      stok: p.stock?.jumlah ?? 0,
      velocity: vel,
      isBestSeller: vel >= RULES.BESTSELLER_VELOCITY,
    };
  });

  items.sort((a, b) => a.stok - b.stok);
  return items.slice(0, 10);
}

// ─── PREDICTION ───────────────────────────────────────────

export function calcPredictions(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): PredictionItem[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const wmaData = calculateWMAVelocity(sales, products);

  const items: PredictionItem[] = [];
  for (const p of products) {
    const stok = p.stock?.jumlah ?? 0;
    const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
    if (vel <= 0) continue;

    const daysLeft = stok / vel;
    const predictedDate = new Date(t.getTime() + daysLeft * 86400000);

    items.push({
      kode: p.kode,
      productId: p.id,
      stok,
      velocity: vel,
      daysLeft,
      predictedDate,
      urgency: getUrgencyLevel(daysLeft),
      isBestSeller: vel >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return items;
}

// ─── PROFIT ───────────────────────────────────────────────

export function calcProfit(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): ProfitItem[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const thirtyAgo = new Date(t.getTime() - 30 * 86400000);
  const wmaData = calculateWMAVelocity(sales, products);

  const salesMap: Record<string, number> = {};
  for (const s of sales) {
    if (new Date(s.created_at) < thirtyAgo) continue;
    salesMap[s.product_id] = (salesMap[s.product_id] ?? 0) + s.qty_kirim;
  }

  const items: ProfitItem[] = [];
  for (const p of products) {
    const qty = salesMap[p.id] ?? 0;
    if (qty === 0) continue;
    const modal = getHargaModal(p);
    const jual = getHargaNormal(p);
    if (jual === 0 || modal === 0) continue;
    const margin = jual - modal;
    if (margin <= 0) continue;

    const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
    items.push({
      kode: p.kode,
      productId: p.id,
      totalQty: qty,
      modal,
      jual,
      margin,
      marginPersen: (margin / modal) * 100,
      totalProfit: qty * margin,
      velocity: vel,
      isBestSeller: vel >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.totalProfit - a.totalProfit);
  return items;
}

// ─── TOKO / CUSTOMER ──────────────────────────────────────

export function calcTokoAnalysis(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): TokoItem[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const thirtyAgo = new Date(t.getTime() - 30 * 86400000);

  const productMap = new Map(products.map((p) => [p.id, p]));

  const tokoData: Record<string, {
    totalQty: number;
    totalNilai: number;
    transaksiCount: number;
    dates: Set<string>;
    produkMap: Record<string, number>;
  }> = {};

  for (const s of sales) {
    if (new Date(s.created_at) < thirtyAgo) continue;
    const toko = (s.toko ?? "").trim().toUpperCase();
    if (!toko) continue;

    if (!tokoData[toko]) {
      tokoData[toko] = { totalQty: 0, totalNilai: 0, transaksiCount: 0, dates: new Set(), produkMap: {} };
    }

    const td = tokoData[toko];
    td.totalQty += s.qty_kirim;
    td.transaksiCount++;
    const wibDate = new Date(new Date(s.created_at).getTime() + 7 * 3600000);
    td.dates.add(wibDate.toISOString().slice(0, 10));

    const p = productMap.get(s.product_id);
    const hargaJual = p?.prices?.harga_normal ?? 0;
    td.totalNilai += s.qty_kirim * hargaJual;

    const kode = p?.kode ?? s.product_id;
    td.produkMap[kode] = (td.produkMap[kode] ?? 0) + s.qty_kirim;
  }

  const items: TokoItem[] = [];
  for (const nama in tokoData) {
    const td = tokoData[nama];
    const produkArr = Object.entries(td.produkMap)
      .map(([k, q]) => ({ kode: k, qty: q }))
      .sort((a, b) => b.qty - a.qty);
    const favorit = produkArr.slice(0, 3).map((p) => p.kode);

    items.push({
      nama,
      totalQty: td.totalQty,
      totalNilai: td.totalNilai,
      transaksiCount: td.transaksiCount,
      hariAktif: td.dates.size,
      favorit,
    });
  }

  items.sort((a, b) => b.totalQty - a.totalQty);
  return items;
}

// ─── BUDGET ESTIMATE ──────────────────────────────────────

export function calcBudgetEstimates(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): BudgetEstimate[] {
  const wmaData = calculateWMAVelocity(sales, products);
  const targets = [4, 7, 14, 21, 30];

  return targets.map((targetDays) => {
    let totalCost = 0;
    let totalItems = 0;
    let totalQty = 0;

    for (const p of products) {
      const stok = p.stock?.jumlah ?? 0;
      const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
      if (vel <= 0) continue;

      const targetStock = Math.ceil(vel * targetDays);
      const butuh = targetStock - stok;
      if (butuh <= 0) continue;

      const batchSize = RULES.BATCH;
      const qtyToBuy = Math.ceil(butuh / batchSize) * batchSize;
      const price = getHargaModal(p);

      totalCost += qtyToBuy * price;
      totalItems++;
      totalQty += qtyToBuy;
    }

    return { days: targetDays, cost: totalCost, items: totalItems, qty: totalQty };
  });
}

// ─── STATS ────────────────────────────────────────────────

export function calcStats(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): StatsData {
  const wmaData = calculateWMAVelocity(sales, products);

  let totalStock = 0;
  let totalValue = 0;
  let outOfStock = 0;
  let bestSellerCount = 0;
  let criticalCount = 0;

  for (const p of products) {
    const stok = p.stock?.jumlah ?? 0;
    const vel = wmaData[p.id]?.adjustedVelocity ?? 0;
    const daysLeft = vel > 0 ? stok / vel : 999;
    const harga = getHargaModal(p);

    totalStock += stok;
    totalValue += stok * harga;
    if (stok === 0) outOfStock++;
    if (vel >= RULES.BESTSELLER_VELOCITY) bestSellerCount++;
    if (daysLeft <= RULES.CRITICAL_DAYS) criticalCount++;
  }

  return {
    totalSKU: products.length,
    totalStock,
    totalValue,
    outOfStock,
    bestSellerCount,
    criticalCount,
  };
}
