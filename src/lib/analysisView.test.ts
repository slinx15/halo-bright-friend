import { describe, expect, it } from "vitest";
import type { ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { filterAndSortAnalyses } from "@/lib/analysisView";

function product(overrides: Partial<ProductAnalysis>): ProductAnalysis {
  return {
    kode: "A1",
    nama: "Benang A1",
    productId: "a1",
    currentStock: 10,
    velocity: 2,
    daysOfStock: 5,
    dosStatus: "ATTENTION",
    recommendedQty: 25,
    batchSize: 25,
    isSpecialColor: null,
    targetDays: 8,
    targetStock: 20,
    isBestSeller: false,
    isStockOut: false,
    combinedScore: 0,
    trendChange: 0,
    cost: 203_500,
    unitPrice: 8_140,
    wmaInfo: null,
    ...overrides,
  };
}

const analyses = [
  product({ kode: "AMAN", nama: "Benang Aman", productId: "safe", dosStatus: "SAFE", daysOfStock: 20, currentStock: 50, velocity: 1, cost: 100_000 }),
  product({ kode: "KRITIS", nama: "Benang Merah", productId: "critical", dosStatus: "CRITICAL", daysOfStock: 1, currentStock: 5, velocity: 8, cost: 400_000 }),
  product({ kode: "KOSONG", nama: "Benang Biru", productId: "empty", dosStatus: "CRITICAL", daysOfStock: 0, currentStock: 0, velocity: 4, cost: 200_000, isStockOut: true }),
];

describe("filterAndSortAnalyses", () => {
  it("filters each status and out-of-stock independently", () => {
    expect(filterAndSortAnalyses(analyses, "SAFE", "", "priority").map((item) => item.kode)).toEqual(["AMAN"]);
    expect(filterAndSortAnalyses(analyses, "CRITICAL", "", "priority").map((item) => item.kode)).toEqual(["KOSONG", "KRITIS"]);
    expect(filterAndSortAnalyses(analyses, "OUT_OF_STOCK", "", "priority").map((item) => item.kode)).toEqual(["KOSONG"]);
  });

  it("searches code and product name without case sensitivity", () => {
    expect(filterAndSortAnalyses(analyses, "ALL", "kritis", "priority")[0].kode).toBe("KRITIS");
    expect(filterAndSortAnalyses(analyses, "ALL", "biru", "priority")[0].kode).toBe("KOSONG");
  });

  it("combines status and search filters", () => {
    expect(filterAndSortAnalyses(analyses, "SAFE", "merah", "priority")).toEqual([]);
  });

  it("sorts by stock, velocity, and cost", () => {
    expect(filterAndSortAnalyses(analyses, "ALL", "", "stock").map((item) => item.kode)).toEqual(["KOSONG", "KRITIS", "AMAN"]);
    expect(filterAndSortAnalyses(analyses, "ALL", "", "velocity").map((item) => item.kode)).toEqual(["KRITIS", "KOSONG", "AMAN"]);
    expect(filterAndSortAnalyses(analyses, "ALL", "", "cost").map((item) => item.kode)).toEqual(["KRITIS", "KOSONG", "AMAN"]);
  });
});
