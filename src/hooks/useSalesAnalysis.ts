import { useQuery } from "@tanstack/react-query";
import { useProducts } from "@/hooks/useProducts";
import type { StockOutRecord } from "@/lib/stockAnalyticsEngine";

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

function useStockOutData() {
  return useQuery({
    queryKey: ["stock-out-all"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 56); // 8 weeks for more stable averages
      const cutoffStr = cutoff.toISOString();

      const token = getAuthToken();
      let allData: StockOutRecord[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const url = `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,qty_pesan,created_at,toko,harga_satuan,harga_type&created_at=gte.${cutoffStr}&order=created_at.desc&limit=${limit}&offset=${offset}`;
        const res = await fetch(url, {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${token || SUPABASE_KEY}`,
            "Accept": "application/json",
          },
        });
        if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
        const data: StockOutRecord[] = await res.json();
        allData = allData.concat(data);
        if (data.length < limit) break;
        offset += limit;
      }

      return allData;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export { type StockOutRecord };

export function useSalesAnalysis() {
  const { data: products } = useProducts();
  const { data: stockOutData, isLoading } = useStockOutData();

  // Filter hanya produk 2 Ons untuk analisa
  const products2Ons = (products ?? []).filter(p => p.kategori === "2 Ons");
  const productIds2Ons = new Set(products2Ons.map(p => p.id));
  const stockOut2Ons = (stockOutData ?? []).filter(r => productIds2Ons.has(r.product_id));

  return {
    products: products2Ons,
    stockOutData: stockOut2Ons,
    isLoading,
  };
}
