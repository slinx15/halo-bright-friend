import type { Tables } from "@/integrations/supabase/types";

export type ReconciliationProductRow = Pick<
  Tables<"products">,
  "id" | "kode" | "nama" | "kategori" | "is_active"
>;

export type ReconciliationStockRow = Pick<
  Tables<"stock">,
  "product_id" | "jumlah" | "updated_at"
>;

export type ReconciliationStockInRow = Pick<
  Tables<"stock_in">,
  "product_id" | "qty" | "created_at"
>;

export type ReconciliationStockOutRow = Pick<
  Tables<"stock_out">,
  "product_id" | "qty_kirim" | "created_at"
>;

export type ReconciliationOpnameRow = Pick<
  Tables<"stock_opname_log">,
  "product_id" | "stok_fisik" | "stok_sistem" | "selisih" | "created_at" | "status"
>;

export type StockReconciliationStatus = "sinkron" | "selisih";

export interface StockReconciliationRow {
  productId: string;
  kode: string;
  nama: string;
  kategori: string | null;
  currentStock: number;
  expectedStock: number;
  difference: number;
  absDifference: number;
  baselineStock: number;
  baselineAt: string | null;
  baselineSource: "opname" | "history_start";
  latestOpnameAt: string | null;
  latestMutationAt: string | null;
  stockUpdatedAt: string | null;
  totalInSinceBaseline: number;
  totalOutSinceBaseline: number;
  historyInCount: number;
  historyOutCount: number;
  opnameCount: number;
  hasHistory: boolean;
  status: StockReconciliationStatus;
  reason: string;
  flags: string[];
}

export interface StockReconciliationSummary {
  totalProducts: number;
  mismatchCount: number;
  syncedCount: number;
  totalAbsoluteDifference: number;
  withoutOpnameCount: number;
  historylessStockCount: number;
}

function groupByProductId<T extends { product_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const existing = grouped.get(row.product_id);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.product_id, [row]);
    }
  }

  return grouped;
}

function latestByCreatedAt<T extends { created_at: string }>(rows: T[]) {
  let latest: T | null = null;

  for (const row of rows) {
    if (!latest || row.created_at > latest.created_at) {
      latest = row;
    }
  }

  return latest;
}

function sumStockIn(rows: ReconciliationStockInRow[], baselineAt: string | null) {
  return rows.reduce((total, row) => {
    if (baselineAt && row.created_at <= baselineAt) {
      return total;
    }

    return total + (row.qty ?? 0);
  }, 0);
}

function sumStockOut(rows: ReconciliationStockOutRow[], baselineAt: string | null) {
  return rows.reduce((total, row) => {
    if (baselineAt && row.created_at <= baselineAt) {
      return total;
    }

    return total + (row.qty_kirim ?? 0);
  }, 0);
}

function getLatestMutationAt(
  stockIns: ReconciliationStockInRow[],
  stockOuts: ReconciliationStockOutRow[],
  opnames: ReconciliationOpnameRow[],
) {
  const latestIn = latestByCreatedAt(stockIns);
  const latestOut = latestByCreatedAt(stockOuts);
  const latestOpname = latestByCreatedAt(opnames);

  return [latestIn?.created_at, latestOut?.created_at, latestOpname?.created_at]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function buildReason(args: {
  difference: number;
  currentStock: number;
  expectedStock: number;
  latestOpname: ReconciliationOpnameRow | null;
  hasHistory: boolean;
}) {
  const { difference, currentStock, expectedStock, latestOpname, hasHistory } = args;

  if (difference === 0) {
    if (!hasHistory && currentStock === 0) {
      return "Belum ada histori mutasi untuk produk ini.";
    }

    if (!latestOpname) {
      return "Sinkron dengan total histori masuk dan keluar.";
    }

    if (latestOpname.selisih !== 0) {
      return "Sinkron setelah penyesuaian opname terakhir.";
    }

    return "Sinkron dengan histori setelah opname terakhir.";
  }

  if (!hasHistory) {
    return "Ada stok current tanpa histori masuk, keluar, atau opname.";
  }

  if (latestOpname) {
    return `Stok current berbeda ${difference > 0 ? "+" : ""}${difference} dari histori setelah opname terakhir.`;
  }

  if (expectedStock === 0 && currentStock !== 0) {
    return "Stok current tidak nol, tetapi histori bersihnya nol.";
  }

  return `Stok current berbeda ${difference > 0 ? "+" : ""}${difference} dari total histori masuk dan keluar.`;
}

export function buildStockReconciliationRows(args: {
  products: ReconciliationProductRow[];
  stocks: ReconciliationStockRow[];
  stockIns: ReconciliationStockInRow[];
  stockOuts: ReconciliationStockOutRow[];
  opnames: ReconciliationOpnameRow[];
}) {
  const { products, stocks, stockIns, stockOuts, opnames } = args;

  const stockByProduct = new Map(stocks.map((stock) => [stock.product_id, stock]));
  const insByProduct = groupByProductId(stockIns);
  const outsByProduct = groupByProductId(stockOuts);
  const opnamesByProduct = groupByProductId(opnames);

  return products
    .map<StockReconciliationRow>((product) => {
      const currentStockRow = stockByProduct.get(product.id);
      const productIns = insByProduct.get(product.id) ?? [];
      const productOuts = outsByProduct.get(product.id) ?? [];
      const productOpnames = opnamesByProduct.get(product.id) ?? [];
      const latestOpname = latestByCreatedAt(productOpnames);
      const baselineAt = latestOpname?.created_at ?? null;
      const baselineStock = latestOpname?.stok_fisik ?? 0;
      const totalInSinceBaseline = sumStockIn(productIns, baselineAt);
      const totalOutSinceBaseline = sumStockOut(productOuts, baselineAt);
      const expectedStock = baselineStock + totalInSinceBaseline - totalOutSinceBaseline;
      const currentStock = currentStockRow?.jumlah ?? 0;
      const difference = currentStock - expectedStock;
      const hasHistory = productIns.length > 0 || productOuts.length > 0 || productOpnames.length > 0;
      const flags: string[] = [];

      if (!latestOpname) {
        flags.push("Belum opname");
      }
      if (!hasHistory && currentStock !== 0) {
        flags.push("Tanpa histori");
      }
      if (difference !== 0) {
        flags.push("Perlu dicek");
      }

      return {
        productId: product.id,
        kode: product.kode,
        nama: product.nama,
        kategori: product.kategori,
        currentStock,
        expectedStock,
        difference,
        absDifference: Math.abs(difference),
        baselineStock,
        baselineAt,
        baselineSource: latestOpname ? "opname" : "history_start",
        latestOpnameAt: latestOpname?.created_at ?? null,
        latestMutationAt: getLatestMutationAt(productIns, productOuts, productOpnames),
        stockUpdatedAt: currentStockRow?.updated_at ?? null,
        totalInSinceBaseline,
        totalOutSinceBaseline,
        historyInCount: productIns.length,
        historyOutCount: productOuts.length,
        opnameCount: productOpnames.length,
        hasHistory,
        status: difference === 0 ? "sinkron" : "selisih",
        reason: buildReason({
          difference,
          currentStock,
          expectedStock,
          latestOpname,
          hasHistory,
        }),
        flags,
      };
    })
    .sort((left, right) => {
      if (right.absDifference !== left.absDifference) {
        return right.absDifference - left.absDifference;
      }

      return left.kode.localeCompare(right.kode);
    });
}

export function summarizeStockReconciliation(rows: StockReconciliationRow[]): StockReconciliationSummary {
  return rows.reduce<StockReconciliationSummary>(
    (summary, row) => {
      summary.totalProducts += 1;
      summary.totalAbsoluteDifference += row.absDifference;

      if (row.status === "selisih") {
        summary.mismatchCount += 1;
      } else {
        summary.syncedCount += 1;
      }

      if (!row.latestOpnameAt) {
        summary.withoutOpnameCount += 1;
      }

      if (!row.hasHistory && row.currentStock !== 0) {
        summary.historylessStockCount += 1;
      }

      return summary;
    },
    {
      totalProducts: 0,
      mismatchCount: 0,
      syncedCount: 0,
      totalAbsoluteDifference: 0,
      withoutOpnameCount: 0,
      historylessStockCount: 0,
    },
  );
}
