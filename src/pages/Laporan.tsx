import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  PackagePlus,
  PackageMinus,
  Calendar,
  ShoppingCart,
  DollarSign,
  Package,
  BarChart3,
  Store,
  Crown,
  Flame,
} from "lucide-react";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function toWIB(dateStr: string) {
  return new Date(new Date(dateStr).getTime() + WIB_OFFSET_MS);
}

export default function Laporan() {
  const isMobile = useIsMobile();
  const [monthOffset, setMonthOffset] = useState(0);

  const currentMonth = useMemo(() => subMonths(new Date(), monthOffset), [monthOffset]);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startISO = new Date(monthStart.getTime() - WIB_OFFSET_MS).toISOString();
  const endISO = new Date(monthEnd.getTime() - WIB_OFFSET_MS + 86400000 - 1).toISOString();

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["laporan-sales", monthOffset],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_out")
        .select("*, products(kode, nama, kategori)")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stockInData, isLoading: stockInLoading } = useQuery({
    queryKey: ["laporan-stockin", monthOffset],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_in")
        .select("*, products(kode, nama, kategori, prices(harga_modal))")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const salesSummary = useMemo(() => {
    if (!salesData) return { totalTx: 0, totalQty: 0, totalRevenue: 0, avgPerDay: 0, byProduct: [], byToko: [], byDate: [] };

    const totalTx = salesData.length;
    const totalQty = salesData.reduce((s, r) => s + (r.qty_kirim || 0), 0);
    const totalRevenue = salesData.reduce((s, r) => s + (r.total_harga || 0), 0);

    const productMap = new Map<string, { kode: string; nama: string; qty: number; revenue: number }>();
    salesData.forEach((r: any) => {
      const kode = r.products?.kode || "?";
      const nama = r.products?.nama || "";
      const existing = productMap.get(kode) || { kode, nama, qty: 0, revenue: 0 };
      existing.qty += r.qty_kirim || 0;
      existing.revenue += r.total_harga || 0;
      productMap.set(kode, existing);
    });
    const byProduct = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty);

    const tokoMap = new Map<string, { toko: string; qty: number; revenue: number; tx: number }>();
    salesData.forEach((r: any) => {
      const toko = r.toko || "(Tanpa toko)";
      const existing = tokoMap.get(toko) || { toko, qty: 0, revenue: 0, tx: 0 };
      existing.qty += r.qty_kirim || 0;
      existing.revenue += r.total_harga || 0;
      existing.tx += 1;
      tokoMap.set(toko, existing);
    });
    const byToko = Array.from(tokoMap.values()).sort((a, b) => b.revenue - a.revenue);

    const dateMap = new Map<string, { date: string; qty: number; revenue: number }>();
    salesData.forEach((r: any) => {
      const d = format(toWIB(r.created_at), "yyyy-MM-dd");
      const existing = dateMap.get(d) || { date: d, qty: 0, revenue: 0 };
      existing.qty += r.qty_kirim || 0;
      existing.revenue += r.total_harga || 0;
      dateMap.set(d, existing);
    });
    const byDate = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    const avgPerDay = byDate.length > 0 ? totalRevenue / byDate.length : 0;

    return { totalTx, totalQty, totalRevenue, avgPerDay, byProduct, byToko, byDate };
  }, [salesData]);

  const stockInSummary = useMemo(() => {
    if (!stockInData) return { totalTx: 0, totalQty: 0, totalModal: 0, byProduct: [] };
    const totalTx = stockInData.length;
    const totalQty = stockInData.reduce((s, r) => s + (r.qty || 0), 0);
    const productMap = new Map<string, { kode: string; nama: string; qty: number; modal: number; hargaModal: number }>();
    stockInData.forEach((r: any) => {
      const kode = r.products?.kode || "?";
      const nama = r.products?.nama || "";
      const hargaModal = r.products?.prices?.[0]?.harga_modal || r.products?.prices?.harga_modal || 0;
      const existing = productMap.get(kode) || { kode, nama, qty: 0, modal: 0, hargaModal };
      existing.qty += r.qty || 0;
      existing.modal += (r.qty || 0) * hargaModal;
      productMap.set(kode, existing);
    });
    const byProduct = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty);
    const totalModal = byProduct.reduce((s, p) => s + p.modal, 0);
    return { totalTx, totalQty, totalModal, byProduct };
  }, [stockInData]);

  const isLoading = salesLoading || stockInLoading;
  const isCurrentMonth = monthOffset === 0;
  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: localeId });
  const maxProductQty = salesSummary.byProduct.length > 0 ? salesSummary.byProduct[0].qty : 1;
  const maxStockInQty = stockInSummary.byProduct.length > 0 ? stockInSummary.byProduct[0].qty : 1;

  const medalIcons = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        icon={BarChart3}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Laporan Bulanan"
        subtitle="Ringkasan penjualan dan barang masuk"
      />

      {/* ── Month Navigator ── */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 bg-card rounded-2xl border border-border/50 shadow-sm px-1.5 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => setMonthOffset((v) => v + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold capitalize">{monthLabel}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => setMonthOffset((v) => Math.max(0, v - 1))}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground">Memuat laporan...</p>
        </div>
      ) : (
        <Tabs defaultValue="penjualan" className="space-y-4">
          <TabsList className="w-full grid grid-cols-2 rounded-2xl h-12 p-1 bg-muted/60">
            <TabsTrigger value="penjualan" className="rounded-xl gap-2 text-sm font-bold data-[state=active]:shadow-md transition-all">
              <PackageMinus className="h-4 w-4" />
              Penjualan
            </TabsTrigger>
            <TabsTrigger value="masuk" className="rounded-xl gap-2 text-sm font-bold data-[state=active]:shadow-md transition-all">
              <PackagePlus className="h-4 w-4" />
              Barang Masuk
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ TAB PENJUALAN ═══════════ */}
          <TabsContent value="penjualan" className="space-y-4 mt-0">
            {/* Hero Revenue Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground shadow-lg">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Total Omzet</p>
                <p className="text-3xl font-extrabold mt-1 tracking-tight">{formatRupiah(salesSummary.totalRevenue)}</p>
                <div className="flex items-center gap-4 mt-3 text-xs opacity-90">
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {formatNumber(salesSummary.totalTx)} transaksi
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {formatNumber(salesSummary.totalQty)} pcs
                  </span>
                </div>
                {salesSummary.avgPerDay > 0 && (
                  <p className="mt-2 text-[11px] opacity-70">
                    Rata-rata {formatRupiah(salesSummary.avgPerDay)}/hari
                  </p>
                )}
              </div>
            </div>

            {/* ── Produk Terlaris ── */}
            <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Flame className="h-4 w-4 text-warning" />
                  Produk Terlaris
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-2">
                {salesSummary.byProduct.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">Belum ada data penjualan</p>
                ) : (
                  <div className="space-y-1">
                    {salesSummary.byProduct.slice(0, 10).map((p, i) => {
                      const pct = (p.qty / maxProductQty) * 100;
                      return (
                        <div key={p.kode} className="group relative rounded-xl px-3 py-2 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base leading-none w-6 text-center shrink-0">
                                {i < 3 ? medalIcons[i] : <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
                              </span>
                              <div className="min-w-0">
                                <p className={cn("text-sm font-mono truncate", i < 3 ? "font-bold" : "font-semibold")}>{p.kode}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{p.nama}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 pl-3">
                              <p className="text-sm font-extrabold tabular-nums">{formatNumber(p.qty)}</p>
                              <p className="text-[10px] text-muted-foreground font-medium">{formatRupiah(p.revenue)}</p>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-1.5 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                i === 0 ? "bg-warning" : i === 1 ? "bg-primary/70" : i === 2 ? "bg-primary/50" : "bg-primary/30"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Per Toko ── */}
            {salesSummary.byToko.length > 0 && (
              <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    Per Toko / Pelanggan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-2">
                  <div className="space-y-0.5">
                    {salesSummary.byToko.map((t, i) => {
                      const maxToko = salesSummary.byToko[0]?.revenue || 1;
                      const pct = (t.revenue / maxToko) * 100;
                      return (
                        <div key={t.toko} className="rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{t.toko}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {t.tx} transaksi · {formatNumber(t.qty)} pcs
                              </p>
                            </div>
                            <span className="text-sm font-extrabold text-primary shrink-0 pl-2 tabular-nums">
                              {formatRupiah(t.revenue)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-muted/60 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/40 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Per Hari ── */}
            {salesSummary.byDate.length > 0 && (
              <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Per Hari
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 max-h-[420px] overflow-y-auto">
                  <div className="divide-y divide-border/30">
                    {salesSummary.byDate.map((d) => {
                      const maxDay = salesSummary.byDate.reduce((m, x) => Math.max(m, x.revenue), 1);
                      const pct = (d.revenue / maxDay) * 100;
                      return (
                        <div key={d.date} className="px-4 py-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold">
                                {format(new Date(d.date), "EEE, dd MMM", { locale: localeId })}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{formatNumber(d.qty)} pcs</p>
                            </div>
                            <span className="text-sm font-extrabold text-primary tabular-nums">{formatRupiah(d.revenue)}</span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/30" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══════════ TAB BARANG MASUK ═══════════ */}
          <TabsContent value="masuk" className="space-y-4 mt-0">
            {/* Hero Modal Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-destructive/90 via-destructive to-destructive/70 p-5 text-destructive-foreground shadow-lg">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Total Pengeluaran Modal</p>
                <p className="text-3xl font-extrabold mt-1 tracking-tight">{formatRupiah(stockInSummary.totalModal)}</p>
                <div className="flex items-center gap-4 mt-3 text-xs opacity-90">
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {formatNumber(stockInSummary.totalTx)} transaksi
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {formatNumber(stockInSummary.totalQty)} pcs masuk
                  </span>
                </div>
              </div>
            </div>

            {/* ── Produk Masuk ── */}
            <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PackagePlus className="h-4 w-4 text-primary" />
                  Produk Paling Banyak Masuk
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-2">
                {stockInSummary.byProduct.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">Belum ada data barang masuk</p>
                ) : (
                  <div className="space-y-1">
                    {stockInSummary.byProduct.slice(0, 10).map((p, i) => {
                      const pct = (p.qty / maxStockInQty) * 100;
                      return (
                        <div key={p.kode} className="rounded-xl px-3 py-2 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base leading-none w-6 text-center shrink-0">
                                {i < 3 ? medalIcons[i] : <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
                              </span>
                              <div className="min-w-0">
                                <p className={cn("text-sm font-mono truncate", i < 3 ? "font-bold" : "font-semibold")}>{p.kode}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{p.nama}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 pl-3">
                              <p className="text-sm font-extrabold tabular-nums">{formatNumber(p.qty)} pcs</p>
                              <p className="text-[10px] text-destructive font-medium">{formatRupiah(p.modal)}</p>
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                i === 0 ? "bg-destructive/70" : i === 1 ? "bg-destructive/50" : "bg-destructive/30"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
