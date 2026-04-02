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
} from "lucide-react";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function toWIB(dateStr: string) {
  return new Date(new Date(dateStr).getTime() + WIB_OFFSET_MS);
}

export default function Laporan() {
  const isMobile = useIsMobile();
  const [monthOffset, setMonthOffset] = useState(0);

  const currentMonth = useMemo(() => {
    return subMonths(new Date(), monthOffset);
  }, [monthOffset]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const startISO = new Date(monthStart.getTime() - WIB_OFFSET_MS).toISOString();
  const endISO = new Date(monthEnd.getTime() - WIB_OFFSET_MS + 86400000 - 1).toISOString();

  // Fetch stock_out for the month
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

  // Fetch stock_in for the month
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

  // Sales summary
  const salesSummary = useMemo(() => {
    if (!salesData) return { totalTx: 0, totalQty: 0, totalRevenue: 0, byProduct: [], byToko: [], byDate: [] };

    const totalTx = salesData.length;
    const totalQty = salesData.reduce((s, r) => s + (r.qty_kirim || 0), 0);
    const totalRevenue = salesData.reduce((s, r) => s + (r.total_harga || 0), 0);

    // Group by product
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

    // Group by toko
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

    // Group by date
    const dateMap = new Map<string, { date: string; qty: number; revenue: number }>();
    salesData.forEach((r: any) => {
      const d = format(toWIB(r.created_at), "yyyy-MM-dd");
      const existing = dateMap.get(d) || { date: d, qty: 0, revenue: 0 };
      existing.qty += r.qty_kirim || 0;
      existing.revenue += r.total_harga || 0;
      dateMap.set(d, existing);
    });
    const byDate = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    return { totalTx, totalQty, totalRevenue, byProduct, byToko, byDate };
  }, [salesData]);

  // Stock in summary
  const stockInSummary = useMemo(() => {
    if (!stockInData) return { totalTx: 0, totalQty: 0, byProduct: [] };

    const totalTx = stockInData.length;
    const totalQty = stockInData.reduce((s, r) => s + (r.qty || 0), 0);

    const productMap = new Map<string, { kode: string; nama: string; qty: number }>();
    stockInData.forEach((r: any) => {
      const kode = r.products?.kode || "?";
      const nama = r.products?.nama || "";
      const existing = productMap.get(kode) || { kode, nama, qty: 0 };
      existing.qty += r.qty || 0;
      productMap.set(kode, existing);
    });
    const byProduct = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty);

    return { totalTx, totalQty, byProduct };
  }, [stockInData]);

  const isLoading = salesLoading || stockInLoading;
  const isCurrentMonth = monthOffset === 0;
  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: localeId });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BarChart3}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Laporan Bulanan"
        subtitle="Ringkasan penjualan dan barang masuk per bulan"
      />

      {/* Month Picker */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl h-10 w-10"
          onClick={() => setMonthOffset((v) => v + 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-[180px] justify-center">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-base font-bold capitalize">{monthLabel}</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl h-10 w-10"
          onClick={() => setMonthOffset((v) => Math.max(0, v - 1))}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <Tabs defaultValue="penjualan" className="space-y-4">
          <TabsList className="w-full grid grid-cols-2 rounded-xl">
            <TabsTrigger value="penjualan" className="rounded-lg gap-1.5">
              <PackageMinus className="h-4 w-4" />
              Penjualan
            </TabsTrigger>
            <TabsTrigger value="masuk" className="rounded-lg gap-1.5">
              <PackagePlus className="h-4 w-4" />
              Barang Masuk
            </TabsTrigger>
          </TabsList>

          {/* ═══ TAB PENJUALAN ═══ */}
          <TabsContent value="penjualan" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="rounded-xl border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <ShoppingCart className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-extrabold text-primary">{formatNumber(salesSummary.totalTx)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Transaksi</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <Package className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-extrabold text-primary">{formatNumber(salesSummary.totalQty)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Qty Kirim</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className={cn("font-extrabold text-primary", isMobile ? "text-sm" : "text-lg")}>{formatRupiah(salesSummary.totalRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Omzet</p>
                </CardContent>
              </Card>
            </div>

            {/* Top Products */}
            <Card className="rounded-xl border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Produk Terlaris
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {salesSummary.byProduct.slice(0, 15).map((p, i) => (
                    <div key={p.kode} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn(
                          "text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                          i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-mono truncate">{p.kode}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.nama}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <p className="text-sm font-bold tabular-nums">{formatNumber(p.qty)} pcs</p>
                        <p className="text-[10px] text-muted-foreground">{formatRupiah(p.revenue)}</p>
                      </div>
                    </div>
                  ))}
                  {salesSummary.byProduct.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">Belum ada data penjualan</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By Toko */}
            {salesSummary.byToko.length > 0 && (
              <Card className="rounded-xl border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Per Toko / Pelanggan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {salesSummary.byToko.map((t) => (
                      <div key={t.toko} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{t.toko}</p>
                          <p className="text-[10px] text-muted-foreground">{t.tx} transaksi · {formatNumber(t.qty)} pcs</p>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0 pl-2">{formatRupiah(t.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* By Date */}
            {salesSummary.byDate.length > 0 && (
              <Card className="rounded-xl border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Per Hari
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                  <div className="divide-y divide-border/50">
                    {salesSummary.byDate.map((d) => (
                      <div key={d.date} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="text-sm font-medium">
                            {format(new Date(d.date), "EEEE, dd MMM", { locale: localeId })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{formatNumber(d.qty)} pcs</p>
                        </div>
                        <span className="text-sm font-bold text-primary">{formatRupiah(d.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ TAB BARANG MASUK ═══ */}
          <TabsContent value="masuk" className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-2">
              <Card className="rounded-xl border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <ShoppingCart className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-extrabold text-primary">{formatNumber(stockInSummary.totalTx)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Transaksi</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <Package className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-extrabold text-primary">{formatNumber(stockInSummary.totalQty)}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase">Total Qty Masuk</p>
                </CardContent>
              </Card>
            </div>

            {/* By Product */}
            <Card className="rounded-xl border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-primary" />
                  Produk Paling Banyak Masuk
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {stockInSummary.byProduct.slice(0, 15).map((p, i) => (
                    <div key={p.kode} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn(
                          "text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                          i < 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-mono truncate">{p.kode}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.nama}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0 pl-2">{formatNumber(p.qty)} pcs</span>
                    </div>
                  ))}
                  {stockInSummary.byProduct.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">Belum ada data barang masuk</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
