import type { ProductWithDetails } from "@/hooks/useProducts";

const CATEGORY_SUFFIX_RE = /\s+(2 ONS|3 ONS|5 ONS|8 ONS|18 GRAM)$/i;
const DEFAULT_CATEGORY = "2 Ons";
const CATEGORY_LABELS: Record<string, string> = {
  "2 ONS": "2 Ons",
  "3 ONS": "3 Ons",
  "5 ONS": "5 Ons",
  "8 ONS": "8 Ons",
  "18 GRAM": "18 Gram",
};

export interface ProductMatchInput {
  kode?: string | null;
  kategori?: string | null;
  productId?: string | null;
  preferCategory?: string | null;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeKode(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function stripLeadingZeros(value: string) {
  return value.replace(/^0+/, "") || "0";
}

function stripCategorySuffix(value: string) {
  return normalizeKode(value).replace(CATEGORY_SUFFIX_RE, "");
}

function getCategorySuffix(value: string) {
  const match = normalizeKode(value).match(CATEGORY_SUFFIX_RE);
  return match ? CATEGORY_LABELS[match[1].toUpperCase()] : null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function categoryEquals(left: string | null | undefined, right: string | null | undefined) {
  return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
}

function pickByCategory(products: ProductWithDetails[], kategori?: string | null) {
  if (!products.length) return null;
  if (kategori) {
    const categoryMatch = products.find((p) => categoryEquals(p.kategori, kategori));
    if (categoryMatch) return categoryMatch;
  }
  const defaultMatch = products.find((p) => categoryEquals(p.kategori, DEFAULT_CATEGORY));
  if (defaultMatch) return defaultMatch;
  const activeMatch = products.find((p) => p.is_active);
  return activeMatch || products[0];
}

export function findProductMatch(
  products: ProductWithDetails[] | undefined,
  input: ProductMatchInput,
) {
  const all = products || [];
  if (!all.length) return null;

  if (input.productId) {
    const byId = all.find((p) => p.id === input.productId);
    if (byId) return byId;
  }

  const rawKode = normalizeKode(input.kode);
  if (!rawKode) return null;

  const suffixCategory = getCategorySuffix(rawKode);
  const strippedKode = stripLeadingZeros(rawKode);
  const baseKode = stripCategorySuffix(rawKode);
  const strippedBaseKode = stripLeadingZeros(baseKode);
  const candidates = unique([rawKode, strippedKode, baseKode, strippedBaseKode]);
  const wantedCategory = input.kategori || suffixCategory || input.preferCategory || DEFAULT_CATEGORY;

  const fullMatches = all.filter((p) => {
    const productKode = normalizeKode(p.kode);
    const productName = normalizeKode(p.nama);
    return candidates.includes(productKode) || candidates.includes(stripLeadingZeros(productKode)) || candidates.includes(productName);
  });
  const fullMatch = pickByCategory(fullMatches, input.kategori || wantedCategory);
  if (fullMatch) return fullMatch;

  const baseMatches = all.filter((p) => {
    const productBase = stripCategorySuffix(p.kode);
    return candidates.includes(productBase) || candidates.includes(stripLeadingZeros(productBase));
  });
  return pickByCategory(baseMatches, input.kategori || wantedCategory);
}

export function isAmbiguousProductCode(products: ProductWithDetails[] | undefined, kode: string) {
  const rawKode = normalizeKode(kode);
  if (!rawKode) return false;
  const strippedKode = stripLeadingZeros(rawKode);
  const matches = (products || []).filter((p) => {
    const productBase = stripCategorySuffix(p.kode);
    return productBase === rawKode || stripLeadingZeros(productBase) === strippedKode || normalizeKode(p.kode) === rawKode;
  });
  return new Set(matches.map((p) => normalizeText(p.kategori) || "-")).size > 1;
}
