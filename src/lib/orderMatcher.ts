import type { ProductWithDetails } from "@/hooks/useProducts";
import { findProductMatch } from "@/lib/productMatcher";

export interface OrderLine {
  raw: string;
  kode: string;
  qty: number;
  productId?: string;
  productKode?: string;
  productKategori?: string | null;
  productName?: string;
  unmatched?: boolean;
  categoryHeader?: boolean;
}

export interface CompareItem {
  key: string;
  kode: string;
  productName?: string;
  productKategori?: string | null;
  qtyPesan: number;
  qtyDatang: number;
}

export interface OrderCompareResult {
  lengkap: CompareItem[];
  kurang: CompareItem[];
  kosong: CompareItem[];
  ekstra: CompareItem[];
}

const CATEGORY_TOKENS = [
  "18 GRAM",
  "8 ONS",
  "5 ONS",
  "3 ONS",
  "2 ONS",
];

const CATEGORY_HEADER_RE = /(?:BENANG\s+)?OBRAS\s+(\d+\s*(?:ONS|GRAM))|\b(\d+\s*(?:ONS|GRAM))\b/i;
const UNIT_WORDS_RE = /\s+(?:PACK|BAL|PCS|PCS?|BH|BUAH|ITEM|UNIT)$/i;

function normalizeCategory(value: string): string | undefined {
  const upper = value.toUpperCase().replace(/\s+/g, " ");
  const match = upper.match(/(\d+)\s*(ONS|GRAM)/);
  if (!match) return undefined;
  const n = match[1];
  const u = match[2];
  return `${n} ${u === "ONS" ? "Ons" : "Gram"}`;
}

function isCategoryHeader(raw: string): string | null {
  const match = raw.match(CATEGORY_HEADER_RE);
  if (!match) return null;
  return normalizeCategory(match[1] || match[2] || "");
}

/**
 * Parse a single item line like:
 *   "BLCK 2 Ons 10"
 *   "WHT 5 Ons - 5"
 *   "350 x3"
 *   "350:3"
 *   "BLCK - 50"
 *   "R143 - 5 pack"
 *   "WHT - 2 bal"
 * Returns { kode, qty } or null when unparseable.
 */
function parseLine(raw: string): { kode: string; qty: number } | null {
  // Remove unit words (pack, bal, pcs, etc.) from the end first
  let cleaned = raw.replace(UNIT_WORDS_RE, "").trim();
  cleaned = cleaned.replace(/[×xX]/g, " ").replace(/[:=,-]+/g, " ").trim();
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();
  // Extract trailing qty (last integer in the line)
  const matches = upper.match(/(\d+)(?!.*\d)/);
  if (!matches) return null;
  const qty = parseInt(matches[1], 10);
  if (!qty || qty <= 0) return null;

  let kodePart = upper.slice(0, matches.index).trim();
  if (!kodePart) {
    kodePart = upper.trim();
  }
  kodePart = kodePart.replace(/\s+/g, " ").trim();
  return { kode: kodePart, qty };
}

export function parseOrderText(
  text: string,
  products: ProductWithDetails[] | undefined,
): OrderLine[] {
  let currentCategory: string | undefined;

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map<OrderLine>((raw) => {
      // Category header lines like "Benang Obras 3 Ons" or "3 Ons"
      const headerCategory = isCategoryHeader(raw);
      if (headerCategory) {
        currentCategory = headerCategory;
        return { raw, kode: raw, qty: 0, unmatched: false, categoryHeader: true };
      }

      const parsed = parseLine(raw);
      if (!parsed) {
        return { raw, kode: raw, qty: 0, unmatched: true };
      }

      // Try extract kategori hint from kode itself (e.g. "BLCK 2 Ons")
      let kategoriHint = currentCategory;
      let kodeOnly = parsed.kode;
      for (const cat of CATEGORY_TOKENS) {
        if (kodeOnly.endsWith(" " + cat) || kodeOnly === cat) {
          kategoriHint = normalizeCategory(cat);
          kodeOnly = kodeOnly.replace(new RegExp(`\\s*${cat}$`), "").trim();
          break;
        }
      }

      const found = findProductMatch(products, {
        kode: kodeOnly || parsed.kode,
        kategori: kategoriHint,
      });

      // eslint-disable-next-line no-console
      console.log("[orderMatcher]", raw, "kode:", kodeOnly || parsed.kode, "cat:", kategoriHint, "found:", found?.id, found?.kode, found?.kategori);

      return {
        raw,
        kode: (found?.kode || kodeOnly || parsed.kode).toUpperCase(),
        qty: parsed.qty,
        productId: found?.id,
        productKode: found?.kode,
        productKategori: found?.kategori,
        productName: found?.nama,
        unmatched: !found,
      };
    });
}

interface ArrivedItem {
  productId?: string;
  kode: string;
  qty: number;
  productName?: string;
  productKategori?: string | null;
  productKode?: string;
}

export function compareOrderVsArrived(
  pesanan: OrderLine[],
  datang: ArrivedItem[],
): OrderCompareResult {
  const keyOf = (item: {
    productId?: string;
    kode?: string;
    productKode?: string;
  }) => (item.productId || item.productKode || item.kode || "").toUpperCase();

  // Aggregate qty by key for pesanan (skip unmatched-empty)
  const pesananMap = new Map<string, CompareItem>();
  for (const p of pesanan) {
    if (!p.qty) continue;
    const key = keyOf(p);
    if (!key) continue;
    const existing = pesananMap.get(key);
    if (existing) {
      existing.qtyPesan += p.qty;
    } else {
      pesananMap.set(key, {
        key,
        kode: p.productKode || p.kode,
        productName: p.productName,
        productKategori: p.productKategori,
        qtyPesan: p.qty,
        qtyDatang: 0,
      });
    }
  }

  // Aggregate qty for datang
  const datangMap = new Map<string, CompareItem>();
  for (const d of datang) {
    if (!d.qty || d.qty <= 0) continue;
    const key = keyOf(d);
    if (!key) continue;
    const existing = datangMap.get(key);
    if (existing) {
      existing.qtyDatang += d.qty;
    } else {
      datangMap.set(key, {
        key,
        kode: d.productKode || d.kode,
        productName: d.productName,
        productKategori: d.productKategori,
        qtyPesan: 0,
        qtyDatang: d.qty,
      });
    }
  }

  const lengkap: CompareItem[] = [];
  const kurang: CompareItem[] = [];
  const kosong: CompareItem[] = [];
  const ekstra: CompareItem[] = [];

  for (const [key, item] of pesananMap) {
    const arrived = datangMap.get(key);
    if (!arrived) {
      kosong.push({ ...item, qtyDatang: 0 });
    } else {
      const combined: CompareItem = {
        ...item,
        productName: item.productName || arrived.productName,
        qtyDatang: arrived.qtyDatang,
      };
      if (arrived.qtyDatang >= item.qtyPesan) {
        lengkap.push(combined);
      } else {
        kurang.push(combined);
      }
    }
  }

  // Ekstra = di datang tapi tidak ada di pesanan
  for (const [key, item] of datangMap) {
    if (!pesananMap.has(key)) {
      ekstra.push({ ...item, qtyPesan: 0 });
    }
  }

  return { lengkap, kurang, kosong, ekstra };
}

/** Build a shareable text summary of missing/short items. */
export function buildMissingSummary(result: OrderCompareResult): string {
  const lines: string[] = [];
  if (result.kosong.length > 0) {
    lines.push("Belum dikirim:");
    result.kosong.forEach((it) =>
      lines.push(`- ${it.kode}: ${it.qtyPesan} pcs`),
    );
  }
  if (result.kurang.length > 0) {
    if (lines.length) lines.push("");
    lines.push("Kurang:");
    result.kurang.forEach((it) =>
      lines.push(
        `- ${it.kode}: pesan ${it.qtyPesan}, datang ${it.qtyDatang}, kurang ${it.qtyPesan - it.qtyDatang} pcs`,
      ),
    );
  }
  return lines.join("\n");
}
