import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getAuthToken(): string {
  const storageKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
  if (!storageKey) return "";
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "");
    return parsed.access_token || parsed?.currentSession?.access_token || "";
  } catch {
    return "";
  }
}

export interface StockOutRecord {
  product_id: string;
  qty_kirim: number;
  qty_pesan: number;
  created_at: string;
  toko: string | null;
  total_harga: number;
  harga_satuan: number;
}

function useStockOutData() {
  return useQuery({
    queryKey: ["stock_out_all"],
    queryFn: async () => {
      const token = getAuthToken();
      const PAGE_SIZE = 1000;
      let allData: StockOutRecord[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,qty_pesan,created_at,toko,total_harga,harga_satuan&order=created_at.desc&offset=${offset}&limit=${PAGE_SIZE}`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${token || SUPABASE_KEY}`,
              Accept: "application/json",
            },
          }
        );
        if (!res.ok) throw new Error("Failed to fetch stock_out");
        const data = await res.json();
        allData = allData.concat(data || []);
        hasMore = (data?.length ?? 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }
      return allData;
    },
  });
}

export interface DailySales {
  date: string;       // YYYY-MM-DD
  label: string;      // "21 Feb"
  totalQty: number;
  totalRevenue: number;
  totalProfit: number;
  txCount: number;
}

export interface TopProduct {
  kode: string;
  nama: string;
  totalQty: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface SalesSummary {
  totalRevenue: number;
  totalProfit: number;
  totalQty: number;
  txCount: number;
  avgDailyRevenue: number;
  avgDailyQty: number;
}

export function useSalesAnalysis(days: number = 7) {
  const { data: products } = useProducts();
  const { data: stockOutData, isLoading } = useStockOutData();

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const filteredSales = useMemo(() => {
    if (!stockOutData) return [];
    return stockOutData.filter(s => new Date(s.created_at) >= cutoffDate);
  }, [stockOutData, cutoffDate]);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductWithDetails>();
    if (products) {
      for (const p of products) map.set(p.id, p);
    }
    return map;
  }, [products]);

  // Daily breakdown
  const dailySales = useMemo<DailySales[]>(() => {
    if (!filteredSales.length) return [];

    const byDate = new Map<string, DailySales>();

    // Pre-fill all dates in range
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
      byDate.set(key, { date: key, label, totalQty: 0, totalRevenue: 0, totalProfit: 0, txCount: 0 });
    }

    for (const sale of filteredSales) {
      const dateKey = sale.created_at.slice(0, 10);
      const entry = byDate.get(dateKey);
      if (!entry) continue;

      const product = productMap.get(sale.product_id);
      const hargaModal = product?.prices?.harga_modal ?? 0;
      const profit = (sale.harga_satuan - hargaModal) * sale.qty_kirim;

      entry.totalQty += sale.qty_kirim;
      entry.totalRevenue += sale.total_harga;
      entry.totalProfit += profit;
      entry.txCount += 1;
    }

    return Array.from(byDate.values());
  }, [filteredSales, productMap, days]);

  // Top products
  const topProducts = useMemo<TopProduct[]>(() => {
    if (!filteredSales.length) return [];

    const byProduct = new Map<string, TopProduct>();

    for (const sale of filteredSales) {
      const product = productMap.get(sale.product_id);
      if (!product) continue;

      const existing = byProduct.get(product.kode) ?? {
        kode: product.kode,
        nama: product.nama,
        totalQty: 0,
        totalRevenue: 0,
        totalProfit: 0,
      };

      const hargaModal = product.prices?.harga_modal ?? 0;
      existing.totalQty += sale.qty_kirim;
      existing.totalRevenue += sale.total_harga;
      existing.totalProfit += (sale.harga_satuan - hargaModal) * sale.qty_kirim;
      byProduct.set(product.kode, existing);
    }

    return Array.from(byProduct.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);
  }, [filteredSales, productMap]);

  // Summary
  const summary = useMemo<SalesSummary>(() => {
    const totalRevenue = filteredSales.reduce((s, r) => s + r.total_harga, 0);
    const totalQty = filteredSales.reduce((s, r) => s + r.qty_kirim, 0);
    const txCount = filteredSales.length;

    let totalProfit = 0;
    for (const sale of filteredSales) {
      const product = productMap.get(sale.product_id);
      const hargaModal = product?.prices?.harga_modal ?? 0;
      totalProfit += (sale.harga_satuan - hargaModal) * sale.qty_kirim;
    }

    const activeDays = Math.max(1, days);

    return {
      totalRevenue,
      totalProfit,
      totalQty,
      txCount,
      avgDailyRevenue: Math.round(totalRevenue / activeDays),
      avgDailyQty: Math.round(totalQty / activeDays),
    };
  }, [filteredSales, productMap, days]);

  return { dailySales, topProducts, summary, isLoading, products, stockOutData };
}
