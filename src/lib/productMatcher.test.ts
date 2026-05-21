import { describe, expect, it } from "vitest";
import { findProductMatch } from "./productMatcher";
import type { ProductWithDetails } from "@/hooks/useProducts";

const products: ProductWithDetails[] = [
  { id: "r400-2", kode: "R400", nama: "R400", kategori: "2 Ons", is_active: true },
  { id: "r400-5", kode: "R400", nama: "R400", kategori: "5 Ons", is_active: true },
  { id: "r400-18", kode: "R400", nama: "R400", kategori: "18 Gram", is_active: true },
];

describe("findProductMatch", () => {
  it("prefers 2 Ons for a bare duplicate code", () => {
    expect(findProductMatch(products, { kode: "R400" })?.id).toBe("r400-2");
  });

  it("uses an explicit category from input", () => {
    expect(findProductMatch(products, { kode: "R400", kategori: "5 Ons" })?.id).toBe("r400-5");
  });

  it("uses a category suffix typed with the code", () => {
    expect(findProductMatch(products, { kode: "R400 18 Gram" })?.id).toBe("r400-18");
  });
});
