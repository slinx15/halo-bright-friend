import { describe, expect, it } from "vitest";
import {
  RULES,
  calculateRestockRecommendation,
  getDefaultTargetDays,
  getPlanningTargetDays,
} from "../../shared/restockCore";

describe("restockCore", () => {
  it("uses analisa default target days for regular products", () => {
    expect(getDefaultTargetDays("8842")).toBe(
      RULES.CYCLE_DAYS + RULES.SAFETY_STOCK + RULES.LEAD_TIME_DAYS,
    );
  });

  it("uses larger safety days for black white codes", () => {
    expect(getDefaultTargetDays("BLK-8842")).toBe(
      RULES.CYCLE_DAYS + RULES.SAFETY_BW + RULES.LEAD_TIME_DAYS,
    );
  });

  it("adds safety and lead time to planning periods", () => {
    expect(getPlanningTargetDays("8842", 2)).toBe(2 + RULES.SAFETY_STOCK + RULES.LEAD_TIME_DAYS);
  });

  it("rounds review recommendations with the same batch logic", () => {
    const result = calculateRestockRecommendation({
      kode: "8842",
      currentStock: 10,
      velocity: 5,
      targetDays: getDefaultTargetDays("8842"),
    });

    expect(result.targetStock).toBe(35);
    expect(result.recommendedQty).toBe(25);
  });

  it("clamps runaway overstock after rounding", () => {
    const result = calculateRestockRecommendation({
      kode: "BLK-8842",
      currentStock: 80,
      velocity: 5,
      targetDays: getDefaultTargetDays("BLK-8842"),
    });

    expect(result.maxReasonableStock).toBe(55);
    expect(result.recommendedQty).toBe(0);
  });
});
