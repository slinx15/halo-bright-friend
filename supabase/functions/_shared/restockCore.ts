export const RULES = {
  CYCLE_DAYS: 3,
  SAFETY_STOCK: 1,
  SAFETY_BW: 2,
  BATCH: 25,
  BATCH_BW: 50,
  MIN_ORDER_PER_CODE: 25,
  WEIGHT_VELOCITY: 0.4,
  WEIGHT_URGENCY: 0.3,
  WEIGHT_TREND: 0.2,
  WEIGHT_STOCK: 0.1,
  DISPLAY_CYCLE_DAYS: 4,
  DISPLAY_TOP_ITEMS: 20,
  CRITICAL_DAYS: 2,
  WARNING_DAYS: 4,
  ATTENTION_DAYS: 7,
  BESTSELLER_VELOCITY: 5,
  SLOWMOVER_VELOCITY: 2,
  SLOWMOVER_MIN_QTY: 25,
  WMA_PERIOD1_DAYS: 14,
  WMA_PERIOD1_WEIGHT: 0.7,
  WMA_PERIOD2_WEIGHT: 0.3,
  ANOMALY_MULTIPLIER: 3,
  DEAD_STOCK_DAYS: 60,
  LEAD_TIME_DAYS: 3,
  NEW_PRODUCT_WAIT_DAYS: 7,
  NEW_PRODUCT_DEFAULT_VEL: 1,
  BUDGET_MAX_WARNA: 25,
  BUDGET_MAX_BW: 250,
  WARNA_SUPER_VELOCITY: 5,
} as const;

const COLOR_BLACK = ["BLK", "BLCK", "HITAM", "BLACK"];
const COLOR_WHITE = ["WHT", "PUTIH", "WHITE"];

export interface RestockCalculationInput {
  kode: string;
  currentStock: number;
  velocity: number;
  targetDays: number;
}

export interface RestockCalculationResult {
  targetDays: number;
  targetStock: number;
  recommendedQty: number;
  deficit: number;
  rawNeed: number;
  batchSize: number;
  minOrder: number;
  maxReasonableStock: number;
  projectedStock: number;
}

export function identifyColorGroup(kode: string): "black" | "white" | null {
  const upper = kode.toUpperCase();
  for (const kw of COLOR_BLACK) {
    if (upper.includes(kw)) return "black";
  }
  for (const kw of COLOR_WHITE) {
    if (upper.includes(kw)) return "white";
  }
  return null;
}

export function isBlackWhiteCode(kode: string): boolean {
  return identifyColorGroup(kode) !== null;
}

export function getBatchSize(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.BATCH_BW : RULES.BATCH;
}

export function getSafetyDays(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
}

export function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

export function getDefaultTargetDays(kode: string): number {
  return RULES.CYCLE_DAYS + getSafetyDays(kode) + RULES.LEAD_TIME_DAYS;
}

export function getPlanningTargetDays(kode: string, planningDays: number): number {
  return planningDays + getSafetyDays(kode) + RULES.LEAD_TIME_DAYS;
}

export function calculateDaysOfStock(currentStock: number, velocity: number): number {
  if (velocity > 0) {
    return currentStock / velocity;
  }
  return currentStock > 0 ? 999 : 0;
}

export function calculateRestockRecommendation(
  input: RestockCalculationInput,
): RestockCalculationResult {
  const { kode, currentStock, velocity, targetDays } = input;
  const isBlackWhite = isBlackWhiteCode(kode);
  const batchSize = getBatchSize(kode);
  const minOrder = isBlackWhite ? batchSize : RULES.MIN_ORDER_PER_CODE;
  const targetStock = Math.ceil(velocity * targetDays);
  const deficit = targetStock - currentStock;
  const isStockOut = currentStock === 0;

  let rawNeed = deficit;
  if (isStockOut && velocity > 0 && rawNeed <= 0) {
    rawNeed = batchSize;
  }

  let recommendedQty = 0;
  if (rawNeed > 0) {
    if (isBlackWhite) {
      recommendedQty = Math.max(batchSize, roundUpToBatch(rawNeed, batchSize));
    } else {
      recommendedQty = Math.max(minOrder, roundUpToBatch(rawNeed, minOrder));
    }
  }

  const maxReasonableStock = Math.ceil(velocity * (targetDays + 3));
  let projectedStock = currentStock + recommendedQty;
  if (projectedStock > maxReasonableStock && recommendedQty > 0) {
    const allowedNeed = maxReasonableStock - currentStock;
    recommendedQty = Math.max(0, roundUpToBatch(allowedNeed, batchSize));
    projectedStock = currentStock + recommendedQty;
  }

  return {
    targetDays,
    targetStock,
    recommendedQty,
    deficit,
    rawNeed,
    batchSize,
    minOrder,
    maxReasonableStock,
    projectedStock,
  };
}
