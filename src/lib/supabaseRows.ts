import type { Database, Json } from "@/integrations/supabase/types";

type PublicTables = Database["public"]["Tables"];

export type ProductRow = PublicTables["products"]["Row"];
export type PriceRow = PublicTables["prices"]["Row"];
export type ActivityLogInsert = PublicTables["activity_log"]["Insert"];

type StockRowBase = PublicTables["stock"]["Row"];

export interface StockRow extends Omit<StockRowBase, "tumpukan_detail"> {
  tumpukan_detail: number[] | null;
}

export interface ProductRowWithRelations extends ProductRow {
  prices?: PriceRow[] | PriceRow | null;
  stock?: StockRow[] | StockRow | null;
}

export type JsonObject = Record<string, Json | undefined>;

export function normalizeRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
}
