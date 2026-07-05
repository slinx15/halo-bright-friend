import { useQuery } from "@tanstack/react-query";

import type { Database } from "@/integrations/supabase/types";
import type { PriceRow, ProductRow } from "@/lib/supabaseRows";
import { getAuthHeaders } from "@/lib/authHeaders";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

type StockInRow = Database["public"]["Tables"]["stock_in"]["Row"];
type StockInPriceSummary = Pick<PriceRow, "harga_modal">;
type StockInProductSummary = Pick<ProductRow, "kode" | "nama"> & {
  prices?: StockInPriceSummary[] | StockInPriceSummary | null;
};

export interface StockInHistoryEntry extends StockInRow {
  products?: StockInProductSummary | null;
}

export interface GroupedStockInHistory {
  dateKey: string;
  qty: number;
  cost: number;
  count: number;
  items: StockInHistoryEntry[];
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function getLocalDateKey(dateInput: Date | string): string {
  return formatDateKey(new Date(dateInput));
}

function getWibDateKey(dateInput: string): string {
  const utcDate = new Date(dateInput);
  const wibDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
  return formatDateKey(wibDate);
}

export function getStockInModalPrice(entry: StockInHistoryEntry): number {
  const prices = entry.products?.prices;

  if (Array.isArray(prices)) {
    return prices[0]?.harga_modal ?? 0;
  }

  return prices?.harga_modal ?? 0;
}

export function filterStockInHistory(
  history: StockInHistoryEntry[],
  search: string,
  dateFilter?: Date,
): StockInHistoryEntry[] {
  const normalizedSearch = search.trim().toLowerCase();
  const selectedDateKey = dateFilter ? getLocalDateKey(dateFilter) : null;

  return history.filter((entry) => {
    const matchSearch =
      normalizedSearch.length === 0 ||
      entry.products?.kode?.toLowerCase().includes(normalizedSearch) ||
      entry.products?.nama?.toLowerCase().includes(normalizedSearch);

    const matchDate = !selectedDateKey || getWibDateKey(entry.created_at) === selectedDateKey;

    return matchSearch && matchDate;
  });
}

export function groupStockInHistoryByDate(history: StockInHistoryEntry[]): GroupedStockInHistory[] {
  const grouped = new Map<string, GroupedStockInHistory>();

  history.forEach((entry) => {
    const dateKey = getWibDateKey(entry.created_at);
    const current =
      grouped.get(dateKey) ??
      {
        dateKey,
        qty: 0,
        cost: 0,
        count: 0,
        items: [],
      };

    current.qty += entry.qty || 0;
    current.cost += getStockInModalPrice(entry) * (entry.qty || 0);
    current.count += 1;
    current.items.push(entry);

    grouped.set(dateKey, current);
  });

  return Array.from(grouped.values()).sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

export function useStockInHistory() {
  return useQuery<StockInHistoryEntry[]>({
    queryKey: ["stock_in_history"],
    queryFn: async () => {
      const headers = await getAuthHeaders("return=representation");
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_in?select=*,products(kode,nama,prices(harga_modal))&order=created_at.desc,id.desc&limit=500`,
        { headers },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json() as Promise<StockInHistoryEntry[]>;
    },
  });
}
