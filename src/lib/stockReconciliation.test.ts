import { describe, expect, it } from "vitest";
import {
  buildStockReconciliationRows,
  summarizeStockReconciliation,
  type ReconciliationOpnameRow,
  type ReconciliationProductRow,
  type ReconciliationStockInRow,
  type ReconciliationStockOutRow,
  type ReconciliationStockRow,
} from "./stockReconciliation";

const products: ReconciliationProductRow[] = [
  { id: "p1", kode: "A01", nama: "Produk A", kategori: "2 Ons", is_active: true },
  { id: "p2", kode: "B02", nama: "Produk B", kategori: "2 Ons", is_active: true },
  { id: "p3", kode: "C03", nama: "Produk C", kategori: "2 Ons", is_active: true },
];

describe("buildStockReconciliationRows", () => {
  it("matches current stock against full history when no opname exists", () => {
    const stocks: ReconciliationStockRow[] = [{ product_id: "p1", jumlah: 6, updated_at: "2026-06-14T10:00:00.000Z" }];
    const stockIns: ReconciliationStockInRow[] = [
      { product_id: "p1", qty: 10, created_at: "2026-06-01T10:00:00.000Z" },
    ];
    const stockOuts: ReconciliationStockOutRow[] = [
      { product_id: "p1", qty_kirim: 4, created_at: "2026-06-02T10:00:00.000Z" },
    ];
    const rows = buildStockReconciliationRows({
      products: [products[0]],
      stocks,
      stockIns,
      stockOuts,
      opnames: [],
    });

    expect(rows[0]).toMatchObject({
      currentStock: 6,
      expectedStock: 6,
      difference: 0,
      status: "sinkron",
      baselineSource: "history_start",
    });
  });

  it("uses the latest opname as reconciliation baseline", () => {
    const stocks: ReconciliationStockRow[] = [{ product_id: "p2", jumlah: 2, updated_at: "2026-06-14T10:00:00.000Z" }];
    const stockIns: ReconciliationStockInRow[] = [
      { product_id: "p2", qty: 10, created_at: "2026-06-01T10:00:00.000Z" },
      { product_id: "p2", qty: 3, created_at: "2026-06-11T10:00:00.000Z" },
    ];
    const stockOuts: ReconciliationStockOutRow[] = [
      { product_id: "p2", qty_kirim: 2, created_at: "2026-06-03T10:00:00.000Z" },
      { product_id: "p2", qty_kirim: 1, created_at: "2026-06-12T10:00:00.000Z" },
    ];
    const opnames: ReconciliationOpnameRow[] = [
      {
        product_id: "p2",
        stok_fisik: 0,
        stok_sistem: 0,
        selisih: 0,
        created_at: "2026-06-05T10:00:00.000Z",
        status: "sesuai",
      },
      {
        product_id: "p2",
        stok_fisik: 0,
        stok_sistem: 0,
        selisih: 0,
        created_at: "2026-06-10T10:00:00.000Z",
        status: "sesuai",
      },
    ];

    const rows = buildStockReconciliationRows({
      products: [products[1]],
      stocks,
      stockIns,
      stockOuts,
      opnames,
    });

    expect(rows[0]).toMatchObject({
      baselineAt: "2026-06-10T10:00:00.000Z",
      totalInSinceBaseline: 3,
      totalOutSinceBaseline: 1,
      expectedStock: 2,
      currentStock: 2,
      difference: 0,
    });
  });

  it("flags products whose current stock no longer matches history", () => {
    const stocks: ReconciliationStockRow[] = [{ product_id: "p3", jumlah: 9, updated_at: "2026-06-14T10:00:00.000Z" }];
    const stockIns: ReconciliationStockInRow[] = [
      { product_id: "p3", qty: 10, created_at: "2026-06-01T10:00:00.000Z" },
    ];
    const stockOuts: ReconciliationStockOutRow[] = [
      { product_id: "p3", qty_kirim: 2, created_at: "2026-06-02T10:00:00.000Z" },
    ];

    const rows = buildStockReconciliationRows({
      products: [products[2]],
      stocks,
      stockIns,
      stockOuts,
      opnames: [],
    });

    expect(rows[0].status).toBe("selisih");
    expect(rows[0].difference).toBe(1);
    expect(rows[0].flags).toContain("Perlu dicek");
  });
});

describe("summarizeStockReconciliation", () => {
  it("computes mismatch counters from reconciliation rows", () => {
    const rows = buildStockReconciliationRows({
      products,
      stocks: [
        { product_id: "p1", jumlah: 6, updated_at: "2026-06-14T10:00:00.000Z" },
        { product_id: "p2", jumlah: 2, updated_at: "2026-06-14T10:00:00.000Z" },
        { product_id: "p3", jumlah: 9, updated_at: "2026-06-14T10:00:00.000Z" },
      ],
      stockIns: [
        { product_id: "p1", qty: 10, created_at: "2026-06-01T10:00:00.000Z" },
        { product_id: "p2", qty: 3, created_at: "2026-06-11T10:00:00.000Z" },
        { product_id: "p3", qty: 10, created_at: "2026-06-01T10:00:00.000Z" },
      ],
      stockOuts: [
        { product_id: "p1", qty_kirim: 4, created_at: "2026-06-02T10:00:00.000Z" },
        { product_id: "p2", qty_kirim: 1, created_at: "2026-06-12T10:00:00.000Z" },
        { product_id: "p3", qty_kirim: 2, created_at: "2026-06-02T10:00:00.000Z" },
      ],
      opnames: [
        {
          product_id: "p2",
          stok_fisik: 0,
          stok_sistem: 0,
          selisih: 0,
          created_at: "2026-06-10T10:00:00.000Z",
          status: "sesuai",
        },
      ],
    });

    expect(summarizeStockReconciliation(rows)).toMatchObject({
      totalProducts: 3,
      mismatchCount: 1,
      syncedCount: 2,
      totalAbsoluteDifference: 1,
      withoutOpnameCount: 2,
    });
  });
});
