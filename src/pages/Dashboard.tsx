import { useEffect } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CloudSun,
  ClipboardCheck,
  DollarSign,
  MoonStar,
  Package,
  PackageMinus,
  PackagePlus,
  ShieldAlert,
  ShoppingCart,
  Sun,
  Sunset,
  TrendingUp,
} from "lucide-react";
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { AiInsightsCard } from "@/components/AiInsightsCard";

import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";
import { requestNotificationPermission, useStockNotifications } from "@/hooks/useStockNotifications";
import { getAuthHeaders } from "@/lib/authHeaders";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

type InventorySummary = {
  totalItems: number;
  totalStok: number;
  kosong: number;
  kritis: number;
  warning: number;
  aman: number;
};

type TodayMetrics = {
  omzet: number;
  profit: number;
  pcs: number;
  margin: number;
  hpp: number;
  stockInPcs: number;
  stockInEntries: number;
  stockInCost: number;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function getGreetingIcon() {
  const hour = new Date().getHours();
  if (hour < 11) return Sun;
  if (hour < 15) return CloudSun;
  if (hour < 18) return Sunset;
  return MoonStar;
}

function getInventorySummary(products: ProductWithDetails[] | undefined): InventorySummary {
  const list = products ?? [];
  const totalItems = list.length;
  const totalStok = list.reduce((sum, product) => sum + (product.stock?.jumlah ?? 0), 0);
  const kosong = list.filter((product) => (product.stock?.jumlah ?? 0) === 0).length;
  const kritis = list.filter((product) => {
    const jumlah = product.stock?.jumlah ?? 0;
    return jumlah > 0 && jumlah <= 5;
  }).length;
  const warning = list.filter((product) => {
    const jumlah = product.stock?.jumlah ?? 0;
    return jumlah > 5 && jumlah <= 15;
  }).length;
  const aman = totalItems - kosong - kritis - warning;

  return { totalItems, totalStok, kosong, kritis, warning, aman };
}

function CommandCenter({
  products,
  isLoading,
}: {
  products: ProductWithDetails[] | undefined;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  if (isLoading || !products) return null;

  const summary = getInventorySummary(products);

  const cards = [
    {
      label: "Kosong",
      count: summary.kosong,
      lightBg: "bg-destructive/10",
      lightText: "text-destructive",
      icon: AlertTriangle,
      status: "kosong",
    },
    {
      label: "Kritis",
      count: summary.kritis,
      lightBg: "bg-critical/10",
      lightText: "text-critical",
      icon: ShieldAlert,
      status: "kritis",
    },
    {
      label: "Warning",
      count: summary.warning,
      lightBg: "bg-warning/10",
      lightText: "text-warning",
      icon: TrendingUp,
      status: "warning",
    },
    {
      label: "Aman",
      count: summary.aman,
      lightBg: "bg-success/10",
      lightText: "text-success",
      icon: CheckCircle2,
      status: "aman",
    },
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between px-4 py-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold">Status Stok</CardTitle>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatNumber(summary.totalItems)} item</span>
          <span className="text-border">·</span>
          <span>{formatNumber(summary.totalStok)} stok</span>
        </div>
      </CardHeader>
      <CardContent className="p-1.5 pt-0">
        <div className="grid grid-cols-4 divide-x divide-border overflow-hidden rounded-xl border bg-card">
          {cards.map((card) => (
            <button
              key={card.label}
              onClick={() => navigate(`/stok?kategori=2 Ons&status=${card.status}`)}
              className="group flex flex-col items-center justify-center gap-2 py-3.5 px-1 text-center transition-colors hover:bg-muted/60 active:bg-muted"
            >
              <div className={`rounded-full p-1.5 ${card.lightBg}`}>
                <card.icon className={`h-4 w-4 ${card.lightText}`} strokeWidth={2.2} />
              </div>
              <span className={`text-xl font-black tabular-nums ${card.lightText}`}>{card.count}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


function HeroKpi({
  omzet,
  profit,
  pcs,
  margin,
  hpp,
}: {
  omzet: number;
  profit: number;
  pcs: number;
  margin: number;
  hpp: number;
}) {
  const navigate = useNavigate();
  const marginPositive = margin >= 0;
  const isEmpty = omzet === 0 && pcs === 0;

  if (isEmpty) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-primary-foreground shadow-premium-lg"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.75))" }}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -right-4 bottom-0 h-20 w-20 rounded-full bg-white/5" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 opacity-80" />
              <span className="text-xs font-medium opacity-80">Belum ada penjualan</span>
            </div>
            <p className="text-lg font-extrabold tracking-tight">Ayo mulai hari ini</p>
            <p className="mt-0.5 text-[11px] opacity-80">Catat penjualan pertama untuk lihat omzet & profit</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 shadow-md"
            onClick={() => navigate("/keluar")}
          >
            <PackageMinus className="h-4 w-4" />
            Catat Sekarang
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2.5">
      <div
        className="relative col-span-2 overflow-hidden rounded-2xl p-4 text-primary-foreground shadow-premium-lg transition-transform duration-200 hover:-translate-y-0.5"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))" }}
      >
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-white/5" />
        <div className="relative">
          <div className="mb-1 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 opacity-80" />
            <span className="text-xs font-medium opacity-80">Omzet Hari Ini</span>
          </div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatRupiah(omzet)}</p>
          <div className="mt-1.5 flex items-center gap-1">
            <ArrowUpRight className={`h-3 w-3 ${marginPositive ? "" : "rotate-180"}`} />
            <span className="text-[11px] font-semibold opacity-90">margin {margin}%</span>
          </div>
        </div>
      </div>

      <div className="card-premium flex flex-col justify-between p-4 transition-transform duration-200 hover:-translate-y-0.5">
        <div className="mb-1 flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Terjual</span>
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(pcs)}</p>
          <span className="text-[10px] font-medium text-muted-foreground">pcs hari ini</span>
        </div>
      </div>

      <div className="card-premium col-span-3 p-4 transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`rounded-xl p-2 ${profit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
              <TrendingUp className={`h-5 w-5 ${profit >= 0 ? "text-success" : "text-destructive rotate-180"}`} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Profit Hari Ini</p>
              <p className={`text-xl font-extrabold tracking-tight tabular-nums ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                {formatRupiah(profit)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-muted-foreground">Modal HPP</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{formatRupiah(hpp)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}



function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", color: "text-success", bg: "bg-success/10" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", color: "text-destructive", bg: "bg-destructive/10" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", color: "text-warning", bg: "bg-warning/10" },
    { icon: Package, label: "Cek Stok", path: "/stok?kategori=2 Ons", color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold">Aksi Cepat</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-4 gap-3">
          {actions.map((action) => (
            <Button
              key={action.path}
              variant="outline"
              className="h-auto flex-col gap-2 rounded-xl border-border/50 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => navigate(action.path)}
            >
              <div className={`rounded-lg p-2 ${action.bg}`}>
                <action.icon className={`h-5 w-5 ${action.color}`} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-semibold">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const Dashboard = () => {
  const { data: allProducts, isLoading } = useProducts();
  useStockNotifications();
  const GreetingIcon = getGreetingIcon();
  const products = allProducts?.filter((product) => product.kategori === "2 Ons");

  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowWib = new Date(nowUtc.getTime() + WIB_OFFSET_MS);
  const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-${String(nowWib.getUTCDate()).padStart(2, "0")}`;
  const todayStartUtc = new Date(`${todayWibStr}T00:00:00+07:00`);
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 86400000);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const { data: todaySales } = useQuery({
    queryKey: ["dashboard_today_sales", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,total_harga,created_at&created_at=gte.${todayStartUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.desc`,
        { headers },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<
        { product_id: string; qty_kirim: number; total_harga: number; created_at: string }[]
      >;
    },
    refetchInterval: 30000,
  });

  const { data: todayStockIn } = useQuery({
    queryKey: ["dashboard_today_stock_in", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_in?select=product_id,qty,created_at&created_at=gte.${todayStartUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.desc`,
        { headers },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ product_id: string; qty: number; created_at: string }[]>;
    },
    refetchInterval: 30000,
  });

  const sevenDaysAgoUtc = new Date(todayStartUtc.getTime() - 6 * 86400000);

  const { data: weekSales } = useQuery({
    queryKey: ["dashboard_week_sales", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=qty_kirim,total_harga,created_at&created_at=gte.${sevenDaysAgoUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.asc`,
        { headers },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 60000,
  });

  const omzetHariIni = todaySales?.reduce((sum, row) => sum + row.total_harga, 0) ?? 0;
  const pcsHariIni = todaySales?.reduce((sum, row) => sum + row.qty_kirim, 0) ?? 0;
  const modalHariIni =
    todaySales?.reduce((sum, row) => {
      const product = allProducts?.find((item) => item.id === row.product_id);
      const modal = product?.prices?.harga_modal ?? 0;
      return sum + row.qty_kirim * modal;
    }, 0) ?? 0;
  const profitHariIni = omzetHariIni - modalHariIni;
  const marginPct = omzetHariIni > 0 ? Math.round((profitHariIni / omzetHariIni) * 100) : 0;

  const stockInPcsHariIni = todayStockIn?.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const stockInEntries = todayStockIn?.length ?? 0;
  const stockInCostHariIni =
    todayStockIn?.reduce((sum, row) => {
      const product = allProducts?.find((item) => item.id === row.product_id);
      const modal = product?.prices?.harga_modal ?? 0;
      return sum + row.qty * modal;
    }, 0) ?? 0;

  const chartData = (() => {
    const toWibDateStr = (isoStr: string) => {
      const utc = new Date(isoStr).getTime();
      const wib = new Date(utc + WIB_OFFSET_MS);
      return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    };

    const toWibLabel = (date: Date) => {
      const utc = date.getTime();
      const wib = new Date(utc + WIB_OFFSET_MS);
      const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      return `${dayNames[wib.getUTCDay()]} ${wib.getUTCDate()}`;
    };

    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    const now = new Date();
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(now.getTime() - index * 86400000);
      const dateStr = toWibDateStr(date.toISOString());
      const label = toWibLabel(date);
      days.push({ label, date: dateStr, omzet: 0, pcs: 0 });
    }

    weekSales?.forEach((sale) => {
      const saleDate = toWibDateStr(sale.created_at);
      const day = days.find((entry) => entry.date === saleDate);
      if (day) {
        day.omzet += sale.total_harga;
        day.pcs += sale.qty_kirim;
      }
    });

    return days;
  })();

  if (isLoading) return <DashboardSkeleton />;

  const summary = getInventorySummary(products);
  const kritisCount = summary.kosong + summary.kritis;
  const todayDateStr = nowWib.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const weekTotal = chartData.reduce((sum, day) => sum + day.omzet, 0);
  const weekAvg = weekTotal / 7;
  const bestOmzet = chartData.reduce((max, day) => Math.max(max, day.omzet), 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 pb-24 md:space-y-6 md:p-6 md:pb-6">
      <div className="animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">{getGreeting()}, Boss</p>
              <div className="rounded-full bg-primary/10 p-1">
                <GreetingIcon className="h-3.5 w-3.5 text-primary" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">Dashboard</h1>
            <p className="text-[11px] font-medium text-muted-foreground">{todayDateStr} · WIB</p>
            <p className="text-xs font-semibold text-foreground/80">
              Omzet {formatRupiah(omzetHariIni)}
              {kritisCount > 0 && (
                <>
                  {" · "}
                  <span className="text-destructive">{kritisCount} stok perlu perhatian</span>
                </>
              )}
            </p>
          </div>
          <div className="glass flex shrink-0 items-center gap-1.5 rounded-full border border-border/20 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground md:px-3 md:py-1.5 md:text-xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Live
          </div>
        </div>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
        <HeroKpi omzet={omzetHariIni} profit={profitHariIni} pcs={pcsHariIni} margin={marginPct} hpp={modalHariIni} />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
        <CriticalStockAlert />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
        <AiInsightsCard />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        <CommandCenter products={products} isLoading={isLoading} />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "225ms", animationFillMode: "both" }}>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="card-premium col-span-2 p-4 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="mb-1 flex items-center gap-1.5">
              <PackagePlus className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Barang Masuk</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(stockInPcsHariIni)}</p>
              <span className="text-[11px] font-medium text-muted-foreground">pcs · {stockInEntries} entri</span>
            </div>
          </div>
          <div className="card-premium flex flex-col justify-between p-4 transition-transform duration-200 hover:-translate-y-0.5">
            <div className="mb-1 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Modal</span>
            </div>
            <p className="text-lg font-extrabold tracking-tight tabular-nums text-primary">{formatRupiah(stockInCostHariIni)}</p>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="card-premium md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <div className="rounded-md bg-primary/10 p-1">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                </div>
                Penjualan 7 Hari
              </CardTitle>
              <div className="text-right">
                <p className="text-[10px] font-medium text-muted-foreground">Total</p>
                <p className="text-xs font-bold tabular-nums text-foreground">{formatRupiah(weekTotal)}</p>
              </div>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground">
              Rata-rata {formatRupiah(Math.round(weekAvg))}/hari
            </p>
          </CardHeader>
          <CardContent className="pb-3 pt-1">
            <div className="h-48 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      value >= 1000000
                        ? `${(value / 1000000).toFixed(1)}jt`
                        : value >= 1000
                          ? `${(value / 1000).toFixed(0)}k`
                          : value
                    }
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "omzet" ? formatRupiah(value) : formatNumber(value),
                      name === "omzet" ? "Omzet" : "Pcs",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      fontSize: 11,
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "0 8px 32px hsl(var(--foreground) / 0.08)",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  {weekAvg > 0 && (
                    <ReferenceLine
                      y={weekAvg}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                      label={{
                        value: "rata-rata",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                    />
                  )}
                  <Bar dataKey="omzet" radius={[6, 6, 0, 0]}>
                    {chartData.map((day, index) => (
                      <Cell
                        key={index}
                        fill={
                          day.omzet > 0 && day.omzet === bestOmzet
                            ? "hsl(var(--success))"
                            : "hsl(var(--primary))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <div className="md:col-span-1">
          <QuickActions />
        </div>
      </div>

    </div>
  );
};


export default Dashboard;

