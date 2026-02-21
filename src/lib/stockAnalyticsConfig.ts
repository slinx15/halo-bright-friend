/**
 * Stock Analytics Configuration
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

// ─── Days of Stock Thresholds ─────────────────────────────
export const DOS_THRESHOLDS = {
  critical: 2,
  warning: 4,
  attention: 7,
} as const;

export type DosStatus = "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

// ─── Safety Stock ─────────────────────────────────────────
export const SAFETY_STOCK_CONFIG = {
  /** Safety days for normal colors */
  normalDays: 1,
  /** Safety days for BLCK/WHT */
  specialDays: 2,
};

// ─── Priority Score Weights ───────────────────────────────
export const PRIORITY_WEIGHTS = {
  velocity: 0.40,
  urgency: 0.30,
  trend: 0.20,
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
