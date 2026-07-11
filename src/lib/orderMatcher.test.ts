import { describe, expect, it } from "vitest";
import { parseOrderText, compareOrderVsArrived, buildMissingSummary } from "./orderMatcher";
import type { ProductWithDetails } from "@/hooks/useProducts";

const products: ProductWithDetails[] = [
  { id: "blck-2", kode: "BLCK", nama: "BLCK 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "blck-3", kode: "BLCK", nama: "BLCK 3 Ons", kategori: "3 Ons", is_active: false },
  { id: "wht-2", kode: "WHT", nama: "WHT 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "wht-8", kode: "WHT 8 Ons", nama: "WHT 8 Ons", kategori: "8 Ons", is_active: true },
  { id: "r143-2", kode: "R143", nama: "R143 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "r143-3", kode: "R143", nama: "R143 3 Ons", kategori: "3 Ons", is_active: false },
  { id: "055-2", kode: "055", nama: "055 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "7807-2", kode: "7807", nama: "7807 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "r484-2", kode: "R484", nama: "R484 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "7955-2", kode: "7955", nama: "7955 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "r174-2", kode: "R174", nama: "R174 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "593-2", kode: "593", nama: "593 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "r178-2", kode: "R178", nama: "R178 2 Ons", kategori: "2 Ons", is_active: true },
  { id: "510b-2", kode: "510B", nama: "510B 2 Ons", kategori: "2 Ons", is_active: true },
];

const fullOrderText = `Benang Obras 3 Ons

BLCK - 50

Benang Obras 18 gram

R143 - 5 pack

7955 - 5 pack

R174 - 10 pack

593 - 10 pack

R178 - 10 pack

510B - 10 pack
Benang Obras 8 Ons

WHT - 2 bal

Benang Obras 2 Ons

WHT - 100

055 - 50

7807 - 25

R484 - 25`;

describe("parseOrderText", () => {
  it("parses category headers and dashed lines with unit words", () => {
    const lines = parseOrderText(fullOrderText, products);

    const byKode = (kode: string) => lines.find((l) => l.kode === kode);

    expect(lines.filter((l) => l.categoryHeader).length).toBe(4);
    expect(byKode("BLCK")?.qty).toBe(50);
    expect(byKode("BLCK")?.productKategori).toBe("3 Ons");
    expect(byKode("WHT")?.qty).toBe(2);
    expect(byKode("WHT")?.productKategori).toBe("8 Ons");
    expect(byKode("055")?.qty).toBe(50);
    expect(byKode("055")?.productKategori).toBe("2 Ons");
  });

  it("marks 18 Gram items as unmatched when the product is not available", () => {
    const lines = parseOrderText(fullOrderText, products);
    const r143 = lines.find((l) => l.raw.includes("R143 - 5 pack"));
    expect(r143?.unmatched).toBe(true);
    expect(r143?.productId).toBeUndefined();
  });

  it("does not treat item lines with category suffix as headers", () => {
    const lines = parseOrderText("WHT 2 Ons 10\n055 50", products);
    const wht = lines.find((l) => l.kode === "WHT");
    expect(wht?.qty).toBe(10);
    expect(wht?.productKategori).toBe("2 Ons");
    expect(wht?.categoryHeader).not.toBe(true);
  });

  it("matches WHT 8 Ons correctly even when WHT 2 Ons has bare kode", () => {
    const lines = parseOrderText(fullOrderText, products);
    const wht8 = lines.find((l) => l.raw.includes("WHT - 2 bal"));
    expect(wht8?.productId).toBe("wht-8");
    expect(wht8?.productKategori).toBe("8 Ons");
  });
});

describe("compareOrderVsArrived", () => {
  it("classifies items as kosong, kurang, lengkap, and ekstra", () => {
    const pesanan = parseOrderText("WHT 2 Ons 10\n055 50", products);
    const datang = [
      { kode: "WHT", qty: 8, productId: "wht-2", productKode: "WHT", productKategori: "2 Ons" },
      { kode: "7807", qty: 25, productId: "7807-2", productKode: "7807", productKategori: "2 Ons" },
    ];
    const result = compareOrderVsArrived(pesanan, datang);

    expect(result.kurang.length).toBe(1);
    expect(result.kurang[0].kode).toBe("WHT");
    expect(result.kosong.length).toBe(1);
    expect(result.kosong[0].kode).toBe("055");
    expect(result.ekstra.length).toBe(1);
    expect(result.ekstra[0].kode).toBe("7807");
  });
});

describe("buildMissingSummary", () => {
  it("builds a WhatsApp-friendly summary", () => {
    const result = {
      kosong: [{ key: "055", kode: "055", qtyPesan: 50, qtyDatang: 0 }],
      kurang: [{ key: "WHT", kode: "WHT", qtyPesan: 10, qtyDatang: 8 }],
      lengkap: [],
      ekstra: [],
    };
    const summary = buildMissingSummary(result);
    expect(summary).toContain("Belum dikirim:");
    expect(summary).toContain("- 055: 50 pcs");
    expect(summary).toContain("Kurang:");
    expect(summary).toContain("kurang 2 pcs");
  });
});
