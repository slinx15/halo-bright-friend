/**
 * Stock Analytics Configuration — PRO Edition
 * All business rules are configurable here.
 * This is a RULE-BASED deterministic system — no ML, no randomness.
 */

// ─── Velocity (WMA) ───────────────────────────────────────
export const VELOCITY_CONFIG = {
  /** Recent period in days */
  recentPeriodDays: 14,
  /** Older period: day 15–30 */
  olderPeriodDays: 16, // days 15-30
  /** Weight for recent period */
  recentWeight: 0.70,
  /** Weight for older period */
  olderWeight: 0.30,
};

// ─── Anomaly Filter ───────────────────────────────────────
export const ANOMALY_CONFIG = {
  /** Sales > multiplier × average are excluded */
  multiplier: 3,
};

// ─── Exponential Smoothing ────────────────────────────────
export const SMOOTHING_CONFIG = {
  /** Alpha for exponential smoothing (0-1). Higher = more reactive */
  alpha: 0.3,
};

// ─── Forecast ─────────────────────────────────────────────
export const FORECAST_CONFIG = {
  /** Short-term forecast periods */
  shortTermDays: 7,
  longTermDays: 14,
  /** Blend: WMA weight vs exponential smoothing weight */
  wmaWeight: 0.6,
  esWeight: 0.4,
};

// ─── Demand Volatility ────────────────────────────────────
export const VOLATILITY_CONFIG = {
  /** Period for calculating std deviation */
  periodDays: 30,
  /** CV thresholds */
  stableThreshold: 0.5,
  mediumThreshold: 1.0,
};

export type VolatilityLevel = "STABLE" | "MEDIUM" | "VOLATILE";

// ─── Dynamic Safety Stock ─────────────────────────────────
export const DYNAMIC_SAFETY_CONFIG = {
  /** Z-score for service level (95% = 1.65) */
  zScore: 1.65,
  /** Minimum floor: normal colors */
  minNormalDays: 1,
  /** Minimum floor: BLCK/WHT */
  minSpecialDays: 2,
};

// ─── Reorder Point ────────────────────────────────────────
// reorder_point = (forecast_daily × lead_time) + safety_stock
// (no extra config needed, uses forecast + safety stock + lead time)

// ─── Days of Stock Thresholds ─────────────────────────────
export const DOS_THRESHOLDS = {
  critical: 2,
  warning: 4,
  attention: 7,
} as const;

export type DosStatus = "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

// ─── Safety Stock (legacy static — kept as floor) ─────────
export const SAFETY_STOCK_CONFIG = {
  /** Safety days for normal colors */
  normalDays: 1,
  /** Safety days for BLCK/WHT */
  specialDays: 2,
};

// ─── Priority Score Weights (ADVANCED) ────────────────────
export const PRIORITY_WEIGHTS = {
  urgency: 0.35,
  velocity: 0.25,
  volatility: 0.15,
  trend: 0.15,
  stockLevel: 0.10,
};

// ─── Trend Analysis ───────────────────────────────────────
export const TREND_CONFIG = {
  /** Compare last N days vs previous N days */
  periodDays: 7,
  /** % change threshold to be considered UP/DOWN */
  changeThreshold: 0.10, // 10%
};

export type TrendStatus = "UP" | "DOWN" | "STABLE";

// ─── Minimum Display (Mode B) ─────────────────────────────
export const MINIMUM_DISPLAY_CONFIG = {
  /** Max forecast to be considered "low demand" */
  maxForecast: 0.3,
  /** Minimum priority score floor for display items */
  priorityFloor: 40,
};

// ─── Dead Stock ───────────────────────────────────────────
export const DEAD_STOCK_CONFIG = {
  /** Days without any sale to be considered dead */
  thresholdDays: 60,
};

// ─── New Product ──────────────────────────────────────────
export const NEW_PRODUCT_CONFIG = {
  /** Wait this many days before full analysis */
  minAgeDays: 7,
  /** Default velocity for new products */
  defaultVelocity: 1,
};

// ─── Batch Size (Purchasing Rules) ────────────────────────
export const BATCH_CONFIG = {
  /** Normal color batch size */
  normalBatch: 25,
  /** BLCK batch size */
  blackBatch: 50,
  /** WHT batch size */
  whiteBatch: 50,
};

// ─── Special Color Identification ─────────────────────────
export const COLOR_GROUPS = {
  black: ["BLK", "BLCK", "HITAM", "BLACK"],
  white: ["WHT", "PUTIH", "WHITE"],
};

// ─── Restock Schedule ─────────────────────────────────────
export const RESTOCK_SCHEDULE = {
  /** Days of week for ordering (0=Sun, 1=Mon, 2=Tue, ...) */
  orderDays: [2, 4] as number[], // Tuesday, Thursday
  /** Lead time in days */
  leadTimeDays: 3,
};
