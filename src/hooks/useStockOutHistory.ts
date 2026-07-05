import { useQuery } from "@tanstack/react-query";

import type { Database } from "@/integrations/supabase/types";
import type { ProductRow } from "@/lib/supabaseRows";
import { getAuthHeaders } from "@/lib/authHeaders";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

type StockOutRow = Database["public"]["Tables"]["stock_out"]["Row"];
type StockOutProductSummary = Pick<ProductRow, "kode" | "nama">;

export interface StockOutHistoryEntry extends StockOutRow {
  products?: StockOutProductSummary | null;
}

export interface GroupedStockOutHistory {
  dateKey: string;
  qty: number;
  revenue: number;
  count: number;
  items: StockOutHistoryEntry[];
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function getLocalDateKey(dateInput: Date | string): string {
  return formatDateKey(new Date(dateInput));
}

export function getWibDateKey(dateInput: string): string {
  const utcDate = new Date(dateInput);
  const wibDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
  return formatDateKey(wibDate);
}

export function filterStockOutHistory(
  history: StockOutHistoryEntry[],
  search: string,
  dateFilter?: Date,
): StockOutHistoryEntry[] {
  const normalizedSearch = search.trim().toLowerCase();
  const selectedDateKey = dateFilter ? getLocalDateKey(dateFilter) : null;

  return history.filter((entry) => {
    const matchSearch =
      normalizedSearch.length === 0 ||
      entry.products?.kode?.toLowerCase().includes(normalizedSearch) ||
      entry.products?.nama?.toLowerCase().includes(normalizedSearch) ||
      entry.toko?.toLowerCase().includes(normalizedSearch);

    const matchDate = !selectedDateKey || getLocalDateKey(entry.created_at) === selectedDateKey;

    return matchSearch && matchDate;
  });
}

export function groupStockOutHistoryByDate(history: StockOutHistoryEntry[]): GroupedStockOutHistory[] {
  const grouped = new Map<string, GroupedStockOutHistory>();

  history.forEach((entry) => {
    const dateKey = getWibDateKey(entry.created_at);
    const current =
      grouped.get(dateKey) ??
      {
        dateKey,
        qty: 0,
        revenue: 0,
        count: 0,
        items: [],
      };

    current.qty += entry.qty_kirim || 0;
    current.revenue += entry.total_harga || 0;
    current.count += 1;
    current.items.push(entry);

    grouped.set(dateKey, current);
  });

  return Array.from(grouped.values()).sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

export function getTodayStockOutSummary(history: StockOutHistoryEntry[]) {
  const todayKey = getLocalDateKey(new Date());

  return history.reduce(
    (summary, entry) => {
      if (getLocalDateKey(entry.created_at) !== todayKey) {
        return summary;
      }

      summary.count += 1;
      summary.qty += entry.qty_kirim || 0;
      summary.revenue += entry.total_harga || 0;
      return summary;
    },
    { count: 0, qty: 0, revenue: 0 },
  );
}

export function useStockOutHistory() {
  return useQuery<StockOutHistoryEntry[]>({
    queryKey: ["stock_out_history"],
    queryFn: async () => {
      const headers = await getAuthHeaders("return=representation");
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=*,products(kode,nama)&order=created_at.desc,id.desc&limit=500`,
        { headers },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json() as Promise<StockOutHistoryEntry[]>;
    },
  });
}
