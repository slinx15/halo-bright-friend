import type { ProductAnalysis } from "@/lib/stockAnalyticsEngine";

export type RestockFilter = "ALL" | "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE" | "OUT_OF_STOCK";
export type RestockSort = "priority" | "stock" | "velocity" | "cost";

const STATUS_PRIORITY: Record<ProductAnalysis["dosStatus"], number> = {
  CRITICAL: 0,
  WARNING: 1,
  ATTENTION: 2,
  SAFE: 3,
};

export function filterAndSortAnalyses(
  analyses: ProductAnalysis[],
  filter: RestockFilter,
  searchQuery: string,
  sort: RestockSort,
): ProductAnalysis[] {
  const query = searchQuery.trim().toLocaleLowerCase("id-ID");

  return analyses
    .filter((item) => {
      if (filter === "OUT_OF_STOCK") return item.isStockOut;
      if (filter !== "ALL" && item.dosStatus !== filter) return false;
      if (!query) return true;
      return item.kode.toLocaleLowerCase("id-ID").includes(query)
        || item.nama.toLocaleLowerCase("id-ID").includes(query);
    })
    .sort((a, b) => {
      if (sort === "stock") return a.currentStock - b.currentStock || a.daysOfStock - b.daysOfStock;
      if (sort === "velocity") return b.velocity - a.velocity || a.daysOfStock - b.daysOfStock;
      if (sort === "cost") return b.cost - a.cost || a.daysOfStock - b.daysOfStock;
      return STATUS_PRIORITY[a.dosStatus] - STATUS_PRIORITY[b.dosStatus]
        || a.daysOfStock - b.daysOfStock
        || b.velocity - a.velocity;
    });
}
