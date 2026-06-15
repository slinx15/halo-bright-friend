import type { ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { RULES, calculateRestockRecommendation } from "../../shared/restockCore";

export const DAYS_PRESETS = [4, 7, 14, 21, 30];

export interface BudgetEstimateDetail {
  kode: string;
  productId: string;
  qty: number;
  unitPrice: number;
  cost: number;
  stok: number;
  velocity: number;
  daysLeft: number;
  isBestSeller: boolean;
  reason: string;
}

export interface BudgetEstimateSummary {
  days: number;
  cost: number;
  items: number;
  qty: number;
  details: BudgetEstimateDetail[];
  remaining: number;
}

interface BudgetCandidate {
  item: ProductAnalysis;
  idealQty: number;
  idealCost: number;
  reason: string;
  batch: number;
  minOrder: number;
}

interface BudgetPick {
  item: ProductAnalysis;
  qty: number;
  cost: number;
  effectiveStock: number;
  effectiveDaysLeft: number;
  reason: string;
}

export function buildBudgetEstimateFromAnalyses(
  analyses: ProductAnalysis[],
  targetDays: number,
  budgetCap: number = Number.POSITIVE_INFINITY,
  pendingMap: ReadonlyMap<string, number> = new Map(),
): BudgetEstimateSummary {
  const sorted = [...analyses]
    .filter((analysis) => analysis.velocity > 0)
    .sort((left, right) => right.combinedScore - left.combinedScore);

  const candidates: BudgetCandidate[] = [];

  for (const item of sorted) {
    const pendingQty = pendingMap.get(item.kode.toUpperCase()) ?? 0;
    const effectiveStock = item.currentStock + pendingQty;
    const recommendation = calculateRestockRecommendation({
      kode: item.kode,
      currentStock: effectiveStock,
      velocity: item.velocity,
      targetDays,
    });
    if (recommendation.deficit <= 0 || recommendation.recommendedQty <= 0) {
      continue;
    }
    const qty = recommendation.recommendedQty;
    const cost = qty * item.unitPrice;
    const effectiveDaysLeft = item.velocity > 0 ? effectiveStock / item.velocity : 999;
    const reason = effectiveStock === 0
      ? "Stok kosong"
      : effectiveDaysLeft <= RULES.CRITICAL_DAYS
        ? "Kritis"
        : effectiveDaysLeft <= RULES.WARNING_DAYS
          ? "Segera habis"
          : "Perlu restock";

    candidates.push({
      item,
      idealQty: qty,
      idealCost: cost,
      reason,
      batch: recommendation.batchSize,
      minOrder: recommendation.minOrder,
    });
  }

  const picks: BudgetPick[] = [];
  let remaining = budgetCap;
  const totalIdealCost = candidates.reduce((sum, candidate) => sum + candidate.idealCost, 0);

  if (!Number.isFinite(budgetCap) || totalIdealCost <= budgetCap) {
    for (const candidate of candidates) {
      const pendingQty = pendingMap.get(candidate.item.kode.toUpperCase()) ?? 0;
      const effectiveStock = candidate.item.currentStock + pendingQty;
      const effectiveDaysLeft = candidate.item.velocity > 0 ? effectiveStock / candidate.item.velocity : 999;
      picks.push({
        item: candidate.item,
        qty: candidate.idealQty,
        cost: candidate.idealCost,
        effectiveStock,
        effectiveDaysLeft,
        reason: candidate.reason,
      });
      if (Number.isFinite(budgetCap)) {
        remaining -= candidate.idealCost;
      }
    }
  } else {
    const tier1 = candidates.filter((candidate) => {
      const pendingQty = pendingMap.get(candidate.item.kode.toUpperCase()) ?? 0;
      const effectiveStock = candidate.item.currentStock + pendingQty;
      const effectiveDaysLeft = candidate.item.velocity > 0 ? effectiveStock / candidate.item.velocity : 999;
      return effectiveStock === 0 || effectiveDaysLeft <= RULES.CRITICAL_DAYS;
    });
    const tier2 = candidates.filter((candidate) => !tier1.includes(candidate) && candidate.item.isBestSeller);
    const tier3 = candidates.filter((candidate) => !tier1.includes(candidate) && !tier2.includes(candidate));

    for (const tier of [tier1, tier2, tier3]) {
      for (const candidate of tier) {
        if (remaining <= 0) {
          break;
        }

        let qty = candidate.idealQty;
        let cost = candidate.idealCost;

        if (cost > remaining) {
          qty = Math.floor(Math.floor(remaining / candidate.item.unitPrice) / candidate.batch) * candidate.batch;
          if (qty < candidate.minOrder) {
            continue;
          }
          cost = qty * candidate.item.unitPrice;
        }

        const pendingQty = pendingMap.get(candidate.item.kode.toUpperCase()) ?? 0;
        const effectiveStock = candidate.item.currentStock + pendingQty;
        const effectiveDaysLeft = candidate.item.velocity > 0 ? effectiveStock / candidate.item.velocity : 999;
        picks.push({
          item: candidate.item,
          qty,
          cost,
          effectiveStock,
          effectiveDaysLeft,
          reason: candidate.reason,
        });
        remaining -= cost;
      }
    }
  }

  const details = picks
    .map((pick) => ({
      kode: pick.item.kode,
      productId: pick.item.productId,
      qty: pick.qty,
      unitPrice: pick.item.unitPrice,
      cost: pick.cost,
      stok: pick.effectiveStock,
      velocity: pick.item.velocity,
      daysLeft: pick.effectiveDaysLeft,
      isBestSeller: pick.item.isBestSeller,
      reason: pick.reason,
    }))
    .sort((left, right) => left.daysLeft - right.daysLeft);

  const totalCost = picks.reduce((sum, pick) => sum + pick.cost, 0);
  const totalQty = picks.reduce((sum, pick) => sum + pick.qty, 0);

  return {
    days: targetDays,
    cost: totalCost,
    items: picks.length,
    qty: totalQty,
    details,
    remaining: Number.isFinite(budgetCap) ? Math.max(remaining, 0) : 0,
  };
}
