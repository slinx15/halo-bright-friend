import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// WMA weights: 70% recent, 30% older (from Telegram bot script)
const WMA_RECENT = 0.7;
const WMA_OLDER = 0.3;
const DEAD_STOCK_DAYS = 60;
const CYCLE_DAYS = 3;

export interface AnalysisResult {
  kode: string;
  nama: string;
  stok: number;
  velocity: number;
  daysToDeplete: number | null;
  trend: "naik" | "turun" | "stabil";
  isDead: boolean;
  hargaModal: number;
  restockQty: number;
  restockCost: number;
  priorityScore: number;
  totalPesan: number;
  totalKirim: number;
  fulfillmentRate: number;
  demandVelocity: number;
}

export function useStockAnalysis(recentDays = 7, olderDays = 14) {
  const { data: products } = useProducts();

  const { data: stockOutData } = useQuery({
    queryKey: ["stock_out_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_out")
        .select("product_id, qty_kirim, qty_pesan, created_at, toko, total_harga, harga_satuan")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const analysis = useMemo<AnalysisResult[]>(() => {
    if (!products || !stockOutData) return [];

    const now = new Date();

    return products.map((p) => {
      const sales = stockOutData
        .filter((s) => s.product_id === p.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const recentCutoff = new Date(now.getTime() - recentDays * 86400000);
      const olderCutoff = new Date(now.getTime() - olderDays * 86400000);

      const recentSales = sales
        .filter((s) => new Date(s.created_at) >= recentCutoff)
        .reduce((sum, s) => sum + s.qty_kirim, 0);
      const recentDemand = sales
        .filter((s) => new Date(s.created_at) >= recentCutoff)
        .reduce((sum, s) => sum + s.qty_pesan, 0);
      const olderSales = sales
        .filter((s) => new Date(s.created_at) >= olderCutoff && new Date(s.created_at) < recentCutoff)
        .reduce((sum, s) => sum + s.qty_kirim, 0);

      const recentVelocity = recentSales / recentDays;
      const olderVelocity = olderSales / (olderDays - recentDays);
      const velocity = recentVelocity * WMA_RECENT + olderVelocity * WMA_OLDER;

      const stok = p.stock?.jumlah ?? 0;
      const daysToDeplete = velocity > 0 ? stok / velocity : null;

      const trend: "naik" | "turun" | "stabil" =
        recentVelocity > olderVelocity * 1.2 ? "naik" :
        recentVelocity < olderVelocity * 0.8 ? "turun" : "stabil";

      const lastSale = sales[0];
      const daysSinceLastSale = lastSale
        ? (now.getTime() - new Date(lastSale.created_at).getTime()) / 86400000
        : 999;
      const isDead = daysSinceLastSale >= DEAD_STOCK_DAYS;

      const safetyStock = Math.ceil(velocity * CYCLE_DAYS * 1.5);
      const restockQty = Math.max(0, safetyStock + Math.ceil(velocity * CYCLE_DAYS) - stok);
      const hargaModal = p.prices?.harga_modal ?? 0;
      const restockCost = restockQty * hargaModal;

      const urgency = daysToDeplete !== null ? Math.max(0, 1 - daysToDeplete / 30) : 0;
      const trendScore = trend === "naik" ? 1 : trend === "stabil" ? 0.5 : 0.2;
      const stockScore = stok <= 5 ? 1 : stok <= 15 ? 0.6 : 0.2;
      const priorityScore =
        velocity * 0.4 + urgency * 30 * 0.3 + trendScore * 10 * 0.2 + stockScore * 10 * 0.1;

      const totalPesan = sales.reduce((sum, s) => sum + s.qty_pesan, 0);
      const totalKirim = sales.reduce((sum, s) => sum + s.qty_kirim, 0);
      const fulfillmentRate = totalPesan > 0 ? (totalKirim / totalPesan) * 100 : 100;
      const demandVelocity = Math.round((recentDemand / recentDays) * 100) / 100;

      return {
        kode: p.kode,
        nama: p.nama,
        stok,
        velocity: Math.round(velocity * 100) / 100,
        daysToDeplete: daysToDeplete !== null ? Math.round(daysToDeplete) : null,
        trend,
        isDead,
        hargaModal,
        restockQty,
        restockCost,
        priorityScore: Math.round(priorityScore * 100) / 100,
        totalPesan,
        totalKirim,
        fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
        demandVelocity,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [products, stockOutData, recentDays, olderDays]);

  return { analysis, products, stockOutData };
}
