import type { ProductWithDetails } from "@/hooks/useProducts";
import {
  type StockOutRecord,
  RULES,
  calculateWMAVelocity,
  calculateTrendData,
} from "./stockAnalyticsEngine";
import { calculateRestockRecommendation, getPlanningTargetDays } from "../../shared/restockCore";

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

export interface BudgetEstimateItem {
  kode: string;
  productId: string;
  qty: number;
  unitPrice: number;
  cost: number;
  stok: number;
  velocity: number;
  daysLeft: number;
  isBestSeller: boolean;
}

export interface BudgetEstimate {
  days: number;
  cost: number;
  items: number;
  qty: number;
  details: BudgetEstimateItem[];
}

export interface StatsData {
  totalSKU: number;
  totalStock: number;
  totalValue: number;
  outOfStock: number;
  bestSellerCount: number;
  criticalCount: number;
}

const WIB_OFFSET = 7 * 3600000;

function getHargaModal(p: ProductWithDetails): number {
  return p.prices?.harga_modal ?? 0;
}

function toWibDate(value: string | Date): Date {
  return new Date(new Date(value).getTime() + WIB_OFFSET);
}

function startOfTodayWib(): Date {
  const nowWib = toWibDate(new Date());
  return new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate()));
}

function getUrgencyLevel(days: number): PredictionItem["urgency"] {
  if (days <= RULES.CRITICAL_DAYS) return "critical";
  if (days <= RULES.WARNING_DAYS) return "warning";
  if (days <= RULES.ATTENTION_DAYS) return "attention";
  return "safe";
}

export function calcTopSellers(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): TopSellerItem[] {
  const todayWib = startOfTodayWib();
  const thirtyAgo = new Date(todayWib.getTime() - 30 * 86400000);
  const wmaData = calculateWMAVelocity(sales, products);
  const salesMap: Record<string, { qty: number; days: Set<string> }> = {};

  for (const sale of sales) {
    if (toWibDate(sale.created_at) < thirtyAgo) continue;
    if (!salesMap[sale.product_id]) salesMap[sale.product_id] = { qty: 0, days: new Set() };
    salesMap[sale.product_id].qty += sale.qty_kirim;
    salesMap[sale.product_id].days.add(toWibDate(sale.created_at).toISOString().slice(0, 10));
  }

  const items: TopSellerItem[] = [];
  for (const product of products) {
    const saleData = salesMap[product.id];
    if (!saleData || saleData.qty === 0) continue;
    const velocity = wmaData[product.id]?.adjustedVelocity ?? saleData.qty / 30;
    const stok = product.stock?.jumlah ?? 0;
    items.push({
      kode: product.kode,
      productId: product.id,
      totalQty: saleData.qty,
      days: saleData.days.size,
      velocity,
      stok,
      daysLeft: velocity > 0 ? stok / velocity : 999,
      isBestSeller: velocity >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.velocity - a.velocity);
  return items.slice(0, RULES.DISPLAY_TOP_ITEMS);
}

export function calcTrend(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): TrendItem[] {
  const trendData = calculateTrendData(sales, products);
  const wmaData = calculateWMAVelocity(sales, products);
  const items: TrendItem[] = [];

  for (const product of products) {
    const trend = trendData[product.id];
    if (!trend || (trend.thisWeek === 0 && trend.lastWeek === 0)) continue;
    const velocity = wmaData[product.id]?.adjustedVelocity ?? 0;
    items.push({
      kode: product.kode,
      productId: product.id,
      thisWeek: trend.thisWeek,
      lastWeek: trend.lastWeek,
      changePct: trend.change * 100,
      velocity,
      isBestSeller: velocity >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.thisWeek - a.thisWeek);
  return items;
}

export function calcDeadStock(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): DeadStockItem[] {
  const todayWib = startOfTodayWib();
  const deadThreshold = new Date(todayWib.getTime() - RULES.DEAD_STOCK_DAYS * 86400000);
  const lastSale: Record<string, Date> = {};

  for (const sale of sales) {
    if (sale.qty_pesan <= 0) continue;
    const saleDate = toWibDate(sale.created_at);
    if (!lastSale[sale.product_id] || saleDate > lastSale[sale.product_id]) {
      lastSale[sale.product_id] = saleDate;
    }
  }

  const items: DeadStockItem[] = [];
  for (const product of products) {
    const stok = product.stock?.jumlah ?? 0;
    if (stok <= 0) continue;
    const lastSaleDate = lastSale[product.id];
    if (!lastSaleDate || lastSaleDate < deadThreshold) {
      items.push({
        kode: product.kode,
        productId: product.id,
        stok,
        daysSinceLastSale: lastSaleDate ? Math.floor((todayWib.getTime() - lastSaleDate.getTime()) / 86400000) : 999,
        lastSaleDate: lastSaleDate ?? null,
        nilai: stok * getHargaModal(product),
      });
    }
  }

  items.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
  return items;
}

export function calcLowStock(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): LowStockItem[] {
  const wmaData = calculateWMAVelocity(sales, products);
  const items = products.map((product) => ({
    kode: product.kode,
    productId: product.id,
    stok: product.stock?.jumlah ?? 0,
    velocity: wmaData[product.id]?.adjustedVelocity ?? 0,
    isBestSeller: (wmaData[product.id]?.adjustedVelocity ?? 0) >= RULES.BESTSELLER_VELOCITY,
  }));

  items.sort((a, b) => a.stok - b.stok);
  return items.slice(0, 10);
}

export function calcPredictions(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): PredictionItem[] {
  const todayWib = startOfTodayWib();
  const wmaData = calculateWMAVelocity(sales, products);
  const items: PredictionItem[] = [];

  for (const product of products) {
    const stok = product.stock?.jumlah ?? 0;
    const velocity = wmaData[product.id]?.adjustedVelocity ?? 0;
    if (velocity <= 0) continue;

    const daysLeft = stok / velocity;
    items.push({
      kode: product.kode,
      productId: product.id,
      stok,
      velocity,
      daysLeft,
      predictedDate: new Date(todayWib.getTime() + daysLeft * 86400000),
      urgency: getUrgencyLevel(daysLeft),
      isBestSeller: velocity >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return items;
}

export function calcProfit(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): ProfitItem[] {
  const todayWib = startOfTodayWib();
  const thirtyAgo = new Date(todayWib.getTime() - 30 * 86400000);
  const wmaData = calculateWMAVelocity(sales, products);
  const salesByProduct: Record<string, StockOutRecord[]> = {};

  for (const sale of sales) {
    if (toWibDate(sale.created_at) < thirtyAgo) continue;
    if (!salesByProduct[sale.product_id]) salesByProduct[sale.product_id] = [];
    salesByProduct[sale.product_id].push(sale);
  }

  const items: ProfitItem[] = [];
  for (const product of products) {
    const productSales = salesByProduct[product.id] || [];
    if (productSales.length === 0) continue;

    const totalQty = productSales.reduce((sum, sale) => sum + (sale.qty_kirim || 0), 0);
    const totalRevenue = productSales.reduce(
      (sum, sale) => sum + (sale.total_harga || sale.qty_kirim * (sale.harga_satuan || 0)),
      0,
    );
    const modal = getHargaModal(product);
    if (totalQty <= 0 || totalRevenue <= 0 || modal <= 0) continue;

    const jual = totalRevenue / totalQty;
    const margin = jual - modal;
    if (margin <= 0) continue;

    items.push({
      kode: product.kode,
      productId: product.id,
      totalQty,
      modal,
      jual,
      margin,
      marginPersen: (margin / modal) * 100,
      totalProfit: totalRevenue - totalQty * modal,
      velocity: wmaData[product.id]?.adjustedVelocity ?? 0,
      isBestSeller: (wmaData[product.id]?.adjustedVelocity ?? 0) >= RULES.BESTSELLER_VELOCITY,
    });
  }

  items.sort((a, b) => b.totalProfit - a.totalProfit);
  return items;
}

export function calcTokoAnalysis(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): TokoItem[] {
  const todayWib = startOfTodayWib();
  const thirtyAgo = new Date(todayWib.getTime() - 30 * 86400000);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const tokoData: Record<string, {
    totalQty: number;
    totalNilai: number;
    transaksiCount: number;
    dates: Set<string>;
    produkMap: Record<string, number>;
  }> = {};

  for (const sale of sales) {
    if (toWibDate(sale.created_at) < thirtyAgo) continue;
    const toko = (sale.toko ?? "").trim().toUpperCase();
    if (!toko) continue;

    if (!tokoData[toko]) {
      tokoData[toko] = { totalQty: 0, totalNilai: 0, transaksiCount: 0, dates: new Set(), produkMap: {} };
    }

    const tokoRow = tokoData[toko];
    tokoRow.totalQty += sale.qty_kirim;
    tokoRow.totalNilai += sale.total_harga || sale.qty_kirim * (sale.harga_satuan || 0);
    tokoRow.transaksiCount += 1;
    tokoRow.dates.add(toWibDate(sale.created_at).toISOString().slice(0, 10));

    const product = productMap.get(sale.product_id);
    const kode = product?.kode ?? sale.product_id;
    tokoRow.produkMap[kode] = (tokoRow.produkMap[kode] ?? 0) + sale.qty_kirim;
  }

  const items: TokoItem[] = [];
  for (const nama of Object.keys(tokoData)) {
    const data = tokoData[nama];
    const favorit = Object.entries(data.produkMap)
      .map(([kode, qty]) => ({ kode, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 3)
      .map((item) => item.kode);

    items.push({
      nama,
      totalQty: data.totalQty,
      totalNilai: data.totalNilai,
      transaksiCount: data.transaksiCount,
      hariAktif: data.dates.size,
      favorit,
    });
  }

  items.sort((a, b) => b.totalQty - a.totalQty);
  return items;
}

export function calcBudgetEstimates(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): BudgetEstimate[] {
  const wmaData = calculateWMAVelocity(sales, products);
  const targets = [4, 7, 14, 21, 30];

  return targets.map((targetDays) => {
    let totalCost = 0;
    let totalItems = 0;
    let totalQty = 0;
    const details: BudgetEstimateItem[] = [];

    for (const product of products) {
      const stok = product.stock?.jumlah ?? 0;
      const velocity = wmaData[product.id]?.adjustedVelocity ?? 0;
      if (velocity <= 0) continue;

      const recommendation = calculateRestockRecommendation({
        kode: product.kode,
        currentStock: stok,
        velocity,
        targetDays: getPlanningTargetDays(product.kode, targetDays),
      });
      if (recommendation.recommendedQty <= 0) continue;

      const unitPrice = getHargaModal(product);
      const cost = recommendation.recommendedQty * unitPrice;
      totalCost += cost;
      totalItems += 1;
      totalQty += recommendation.recommendedQty;
      details.push({
        kode: product.kode,
        productId: product.id,
        qty: recommendation.recommendedQty,
        unitPrice,
        cost,
        stok,
        velocity,
        daysLeft: velocity > 0 ? stok / velocity : 999,
        isBestSeller: velocity >= RULES.BESTSELLER_VELOCITY,
      });
    }

    details.sort((a, b) => a.daysLeft - b.daysLeft);
    return { days: targetDays, cost: totalCost, items: totalItems, qty: totalQty, details };
  });
}

export function calcStats(
  products: ProductWithDetails[],
  sales: StockOutRecord[],
): StatsData {
  const wmaData = calculateWMAVelocity(sales, products);
  let totalStock = 0;
  let totalValue = 0;
  let outOfStock = 0;
  let bestSellerCount = 0;
  let criticalCount = 0;

  for (const product of products) {
    const stok = product.stock?.jumlah ?? 0;
    const velocity = wmaData[product.id]?.adjustedVelocity ?? 0;
    const daysLeft = velocity > 0 ? stok / velocity : 999;
    const harga = getHargaModal(product);

    totalStock += stok;
    totalValue += stok * harga;
    if (stok === 0) outOfStock += 1;
    if (velocity >= RULES.BESTSELLER_VELOCITY) bestSellerCount += 1;
    if (daysLeft <= RULES.CRITICAL_DAYS) criticalCount += 1;
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
