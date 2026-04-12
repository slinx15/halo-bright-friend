import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, startOfDay, differenceInDays } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

type PeriodKey = "7d" | "14d" | "30d";

const periods: { key: PeriodKey; label: string; days: number }[] = [
  { key: "7d", label: "7 Hari", days: 7 },
  { key: "14d", label: "14 Hari", days: 14 },
  { key: "30d", label: "30 Hari", days: 30 },
];

export default function DashboardKeuangan() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const days = periods.find((p) => p.key === period)!.days;

  const startDate = useMemo(() => subDays(new Date(), days), [days]);
  const startISO = useMemo(
    () => new Date(startDate.getTime() - WIB_OFFSET_MS).toISOString(),
    [startDate]
  );

  // Fetch stock_out with prices
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["keuangan-sales", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_out")
        .select("created_at, qty_kirim, harga_satuan, total_harga, product_id")
        .gte("created_at", startISO)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pricesMap } = useQuery({
    queryKey: ["keuangan-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prices")
        .select("product_id, harga_modal");
      if (error) throw error;
      const map: Record<string, number> = {};
      data?.forEach((p) => {
        map[p.product_id] = p.harga_modal;
      });
      return map;
    },
  });

  // Previous period for comparison
  const prevStartISO = useMemo(
    () =>
      new Date(
        subDays(startDate, days).getTime() - WIB_OFFSET_MS
      ).toISOString(),
    [startDate, days]
  );

  const { data: prevSalesData } = useQuery({
    queryKey: ["keuangan-prev-sales", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_out")
        .select("created_at, qty_kirim, total_harga, product_id")
        .gte("created_at", prevStartISO)
        .lt("created_at", startISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Calculate daily data
  const dailyData = useMemo(() => {
    if (!salesData || !pricesMap) return [];
    const map = new Map<
      string,
      { omzet: number; modal: number; profit: number; qty: number }
    >();

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const d = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
      map.set(d, { omzet: 0, modal: 0, profit: 0, qty: 0 });
    }

    salesData.forEach((s) => {
      const wib = new Date(new Date(s.created_at).getTime() + WIB_OFFSET_MS);
      const key = format(wib, "yyyy-MM-dd");
      const entry = map.get(key);
      if (!entry) return;
      const omzet = s.total_harga;
      const modal = (pricesMap[s.product_id] ?? 0) * s.qty_kirim;
      entry.omzet += omzet;
      entry.modal += modal;
      entry.profit += omzet - modal;
      entry.qty += s.qty_kirim;
    });

    return Array.from(map.entries()).map(([date, v]) => ({
      date,
      label: format(new Date(date), "dd MMM", { locale: localeId }),
      ...v,
    }));
  }, [salesData, pricesMap, days]);

  // Totals
  const totals = useMemo(() => {
    const t = { omzet: 0, modal: 0, profit: 0, qty: 0 };
    dailyData.forEach((d) => {
      t.omzet += d.omzet;
      t.modal += d.modal;
      t.profit += d.profit;
      t.qty += d.qty;
    });
    return t;
  }, [dailyData]);

  // Previous period totals
  const prevTotals = useMemo(() => {
    const t = { omzet: 0, modal: 0, profit: 0 };
    if (!prevSalesData || !pricesMap) return t;
    prevSalesData.forEach((s) => {
      t.omzet += s.total_harga;
      t.modal += (pricesMap[s.product_id] ?? 0) * s.qty_kirim;
    });
    t.profit = t.omzet - t.modal;
    return t;
  }, [prevSalesData, pricesMap]);

  const margin = totals.omzet > 0 ? (totals.profit / totals.omzet) * 100 : 0;

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  const omzetChange = pctChange(totals.omzet, prevTotals.omzet);
  const profitChange = pctChange(totals.profit, prevTotals.profit);

  // Best day
  const bestDay = useMemo(() => {
    if (dailyData.length === 0) return null;
    return dailyData.reduce((best, d) => (d.profit > best.profit ? d : best), dailyData[0]);
  }, [dailyData]);

  // Average daily
  const avgDaily = totals.omzet / Math.max(days, 1);

  const formatCompact = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
    return String(v);
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-lg text-xs space-y-1">
        <p className="font-bold text-foreground">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground capitalize">{p.dataKey}:</span>
            <span className="font-bold text-foreground">{formatRupiah(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 shadow-sm">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">
              Dashboard Keuangan
            </h1>
            <p className="text-muted-foreground text-xs font-medium">
              Ringkasan omzet, modal & profit
            </p>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200",
              period === p.key
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Omzet */}
        <div className="card-premium bg-primary/5 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Omzet
            </span>
          </div>
          <p className="text-lg font-extrabold tabular-nums text-foreground truncate">
            {formatRupiah(totals.omzet)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {omzetChange >= 0 ? (
              <ArrowUpRight className="h-3 w-3 text-success" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-destructive" />
            )}
            <span
              className={cn(
                "text-[10px] font-bold",
                omzetChange >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {omzetChange >= 0 ? "+" : ""}
              {omzetChange.toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground">vs sebelumnya</span>
          </div>
        </div>

        {/* Modal */}
        <div className="card-premium bg-warning/5 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <PiggyBank className="h-4 w-4 text-warning" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Modal Keluar
            </span>
          </div>
          <p className="text-lg font-extrabold tabular-nums text-foreground truncate">
            {formatRupiah(totals.modal)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatNumber(totals.qty)} pcs terjual
          </p>
        </div>

        {/* Profit */}
        <div className="card-premium bg-success/5 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Profit
            </span>
          </div>
          <p
            className={cn(
              "text-lg font-extrabold tabular-nums truncate",
              totals.profit >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {formatRupiah(totals.profit)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {profitChange >= 0 ? (
              <ArrowUpRight className="h-3 w-3 text-success" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-destructive" />
            )}
            <span
              className={cn(
                "text-[10px] font-bold",
                profitChange >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {profitChange >= 0 ? "+" : ""}
              {profitChange.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Margin */}
        <div className="card-premium bg-accent/30 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Margin
            </span>
          </div>
          <p className="text-lg font-extrabold tabular-nums text-foreground">
            {margin.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Rata-rata {formatRupiah(avgDaily)}/hari
          </p>
        </div>
      </div>

      {/* Main Chart - Area */}
      <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Tren Keuangan
            <Badge variant="secondary" className="text-[10px] rounded-full px-2.5">
              {periods.find((p) => p.key === period)?.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[280px] md:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOmzet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={isMobile ? Math.floor(days / 5) : Math.floor(days / 10)}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                <Tooltip content={customTooltip} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  type="monotone"
                  dataKey="omzet"
                  name="Omzet"
                  stroke="hsl(var(--primary))"
                  fill="url(#gradOmzet)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="hsl(var(--success))"
                  fill="url(#gradProfit)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Bar Chart - Modal vs Profit */}
      <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-warning/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-warning" />
            Modal vs Profit Harian
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[240px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={isMobile ? Math.floor(days / 5) : Math.floor(days / 10)}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                <Tooltip content={customTooltip} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="modal"
                  name="Modal"
                  fill="hsl(var(--warning))"
                  radius={[4, 4, 0, 0]}
                  opacity={0.7}
                />
                <Bar
                  dataKey="profit"
                  name="Profit"
                  fill="hsl(var(--success))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Best Day */}
      {bestDay && bestDay.profit > 0 && (
        <Card className="rounded-2xl shadow-md border-0 bg-gradient-to-r from-success/10 to-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-success/20">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Hari Terbaik ({periods.find((p) => p.key === period)?.label} terakhir)
              </p>
              <p className="font-extrabold text-foreground">
                {format(new Date(bestDay.date), "EEEE, dd MMMM yyyy", {
                  locale: localeId,
                })}
              </p>
              <p className="text-sm font-bold text-success">
                Profit {formatRupiah(bestDay.profit)} dari omzet{" "}
                {formatRupiah(bestDay.omzet)}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
