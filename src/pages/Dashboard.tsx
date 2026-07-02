import { useEffect } from "react";
import {
  ArrowUpRight,
  BarChart3,
  ClipboardCheck,
  DollarSign,
  Package,
  PackageMinus,
  PackagePlus,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { AiInsightsCard } from "@/components/AiInsightsCard";
import { CriticalStockAlert } from "@/components/CriticalStockAlert";
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

function getGreetingEmoji() {
  const hour = new Date().getHours();
  if (hour < 11) return "??";
  if (hour < 15) return "???";
  if (hour < 18) return "??";
  return "??";
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
      lightBg: "bg-destructive/8",
      lightText: "text-destructive",
      emoji: "??",
    },
    {
      label: "Kritis",
      count: summary.kritis,
      lightBg: "bg-orange-500/8",
      lightText: "text-orange-600",
      emoji: "??",
    },
    {
      label: "Warning",
      count: summary.warning,
      lightBg: "bg-warning/8",
      lightText: "text-amber-600",
      emoji: "??",
    },
    {
      label: "Aman",
      count: summary.aman,
      lightBg: "bg-success/8",
      lightText: "text-success",
      emoji: "?",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">{formatNumber(summary.totalItems)} item</span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-success" />
          <span className="text-xs font-medium text-muted-foreground">{formatNumber(summary.totalStok)} stok</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate("/stok?kategori=2 Ons")}
            className={`card-premium flex flex-col items-center gap-1 p-3 transition-all duration-200 ${card.lightBg}`}
          >
            <span className="text-lg leading-none">{card.emoji}</span>
            <span className={`text-2xl font-black leading-none tabular-nums ${card.lightText}`}>{card.count}</span>
            <span className="text-[10px] font-semibold leading-tight text-muted-foreground">{card.label}</span>
          </button>
        ))}
      </div>
    </div>
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
  return (
    <div className="grid grid-cols-3 gap-2">
      <div
        className="relative col-span-2 overflow-hidden rounded-2xl p-4 text-primary-foreground shadow-premium-lg"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(217 91% 40%))" }}
      >
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-white/5" />
        <div className="relative">
          <div className="mb-1 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 opacity-80" />
            <span className="text-xs font-medium opacity-80">Omzet Hari Ini</span>
          </div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatRupiah(omzet)}</p>
          {margin > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              <span className="text-[11px] font-semibold opacity-90">margin {margin}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="card-premium flex flex-col justify-between p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(pcs)}</p>
          <span className="text-[10px] font-medium text-muted-foreground">pcs terjual</span>
        </div>
      </div>

      <div className="card-premium col-span-3 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-success/10 p-1.5">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Profit Hari Ini</p>
              <p className="text-lg font-extrabold tracking-tight tabular-nums">{formatRupiah(profit)}</p>
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

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-24 md:p-6 md:pb-6">
      <div className="animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {getGreeting()}, Boss {getGreetingEmoji()}
            </p>
            <h1 className="text-xl font-extrabold tracking-tight">Dashboard</h1>
          </div>
          <div className="glass hidden rounded-full border border-border/20 px-3 py-1.5 text-xs text-muted-foreground md:flex md:items-center md:gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            Live
          </div>
        </div>
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
        <CommandCenter products={products} isLoading={isLoading} />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
        <HeroKpi omzet={omzetHariIni} profit={profitHariIni} pcs={pcsHariIni} margin={marginPct} hpp={modalHariIni} />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "175ms", animationFillMode: "both" }}>
        <Card className="card-premium">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2">
                  <PackagePlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Barang Masuk Hari Ini</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-extrabold tracking-tight tabular-nums">{formatNumber(stockInPcsHariIni)} pcs</p>
                    <span className="text-[11px] text-muted-foreground">({stockInEntries} entri)</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-muted-foreground">Total Modal</p>
                <p className="text-sm font-bold tabular-nums text-primary">{formatRupiah(stockInCostHariIni)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="card-premium md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <div className="rounded-md bg-primary/10 p-1">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
              </div>
              Penjualan 7 Hari
            </CardTitle>
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
                      border: "1px solid hsl(213 25% 90%)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                      background: "hsl(210 40% 99%)",
                      color: "hsl(222 47% 11%)",
                    }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <CriticalStockAlert />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
        <AiInsightsCard />
      </div>

      <div className="hidden animate-fade-in md:block" style={{ animationDelay: "350ms", animationFillMode: "both" }}>
        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
