import { useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  DollarSign,
  ListChecks,
  Package,
  PackageMinus,
  PackagePlus,
  PackageX,
  TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { AiInsightsCard } from "@/components/AiInsightsCard";
import { CriticalStockAlert } from "@/components/CriticalStockAlert";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";
import { requestNotificationPermission, useStockNotifications } from "@/hooks/useStockNotifications";
import { getAuthHeaders } from "@/lib/authHeaders";
import { formatNumber, formatRupiah, getStockStatus } from "@/lib/formatters";
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
  stockInPcs: number;
  stockInEntries: number;
  stockInCost: number;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function getCompactProductLabel(kode: string, nama?: string | null) {
  if (!nama) return "";
  const normalizedKode = kode.trim().toUpperCase();
  const normalizedNama = nama.trim();
  if (normalizedNama.toUpperCase() === normalizedKode) return "";
  if (normalizedNama.toUpperCase().startsWith(`${normalizedKode} `)) {
    return normalizedNama.slice(kode.length).trim();
  }
  return normalizedNama;
}

function getInventorySummary(products: ProductWithDetails[] | undefined): InventorySummary {
  const list = products ?? [];
  const totalItems = list.length;
  const totalStok = list.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0);
  const kosong = list.filter((p) => (p.stock?.jumlah ?? 0) === 0).length;
  const kritis = list.filter((p) => {
    const jumlah = p.stock?.jumlah ?? 0;
    return jumlah > 0 && jumlah <= 5;
  }).length;
  const warning = list.filter((p) => {
    const jumlah = p.stock?.jumlah ?? 0;
    return jumlah > 5 && jumlah <= 15;
  }).length;
  const aman = totalItems - kosong - kritis - warning;

  return { totalItems, totalStok, kosong, kritis, warning, aman };
}

function DashboardHeader({ summary }: { summary: InventorySummary }) {
  const focusCount = summary.kosong + summary.kritis;

  return (
    <header className="overflow-hidden rounded-xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.13),transparent_36%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--background)))]">
      <div className="p-4 md:p-5">
        <p className="text-sm font-semibold text-primary">{getGreeting()}, Boss</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground md:text-3xl">Hari ini mulai dari sini</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ada {formatNumber(focusCount)} kode yang perlu dibereskan dulu. Sisanya bisa menyusul setelah stok merah aman.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-primary/10 bg-card/60 p-3 text-xs text-muted-foreground">
        <div className="rounded-lg bg-destructive/8 px-3 py-2">
          <span className="block text-base font-black text-destructive">{formatNumber(focusCount)} kode</span>
          bereskan dulu
        </div>
        <div className="rounded-lg bg-warning/10 px-3 py-2">
          <span className="block text-base font-black text-warning">{formatNumber(summary.warning)} kode</span>
          cek setelahnya
        </div>
        <div className="rounded-lg bg-success/10 px-3 py-2">
          <span className="block text-base font-black text-success">{formatNumber(summary.aman)} kode</span>
          masih aman
        </div>
      </div>
    </header>
  );
}

function StatusStrip({ summary }: { summary: InventorySummary }) {
  const navigate = useNavigate();
  const items = [
    {
      label: "Kosong",
      value: summary.kosong,
      helper: "isi ulang dulu",
      icon: PackageX,
      className: "border-destructive/30 bg-destructive/[0.06] text-destructive",
    },
    {
      label: "Kritis",
      value: summary.kritis,
      helper: "stok 1-5 pcs",
      icon: AlertTriangle,
      className: "border-orange-500/30 bg-orange-500/[0.07] text-orange-600",
    },
    {
      label: "Perlu cek",
      value: summary.warning,
      helper: "stok 6-15 pcs",
      icon: Activity,
      className: "border-warning/30 bg-warning/[0.08] text-warning",
    },
    {
      label: "Aman",
      value: summary.aman,
      helper: "stok cukup",
      icon: CheckCircle2,
      className: "border-success/30 bg-success/[0.07] text-success",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate("/stok?kategori=2 Ons")}
          className={`flex min-h-[82px] items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${item.className}`}
        >
          <div>
            <p className="text-2xl font-black leading-none tabular-nums">{item.value}</p>
            <p className="mt-1 text-sm font-bold text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.helper}</p>
          </div>
          <item.icon className="h-5 w-5" />
        </button>
      ))}
    </section>
  );
}

function WorkQueue({ summary, metrics }: { summary: InventorySummary; metrics: TodayMetrics }) {
  const navigate = useNavigate();
  const urgentCount = summary.kosong + summary.kritis;
  const rows = [
    {
      title: "Restock darurat",
      value: `${urgentCount} kode`,
      detail: `${summary.kosong} kosong, ${summary.kritis} kritis`,
      action: "Buka Analisa",
      icon: AlertTriangle,
      tone: "text-destructive",
      onClick: () => navigate("/analisa"),
    },
    {
      title: "Cek stok menipis",
      value: `${summary.warning} kode`,
      detail: "Pastikan fisik sama dengan sistem sebelum belanja",
      action: "Buka Stok",
      icon: ListChecks,
      tone: "text-warning",
      onClick: () => navigate("/stok?kategori=2 Ons"),
    },
    {
      title: "Barang masuk hari ini",
      value: `${formatNumber(metrics.stockInPcs)} pcs`,
      detail: `${metrics.stockInEntries} entri, modal ${formatRupiah(metrics.stockInCost)}`,
      action: "Input Masuk",
      icon: PackagePlus,
      tone: "text-primary",
      onClick: () => navigate("/masuk"),
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h2 className="text-base font-black">Kerjakan berurutan</h2>
          <p className="text-xs text-muted-foreground">Biar tidak loncat-loncat saat toko mulai ramai.</p>
        </div>
        <Badge className="rounded-full border-primary/20 bg-primary/8 text-primary">
          {urgentCount > 0 ? "Ada prioritas" : "Terkendali"}
        </Badge>
      </div>
      <div className="grid gap-2 p-2">
        {rows.map((row) => (
          <button
            key={row.title}
            onClick={row.onClick}
            className="grid w-full grid-cols-[auto_1fr] gap-3 rounded-xl border border-border/70 bg-background/60 p-3 text-left transition-colors hover:border-primary/25 hover:bg-muted/35 sm:grid-cols-[auto_1fr_auto] sm:items-center"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <row.icon className={`h-4 w-4 ${row.tone}`} />
            </span>
            <div className="min-w-0">
              <p className="font-bold leading-tight">{row.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg bg-card px-3 py-2 sm:col-span-1 sm:block sm:bg-transparent sm:px-0 sm:py-0 sm:text-right">
              <p className="font-black tabular-nums">{row.value}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {row.action}
                <ChevronRight className="h-3.5 w-3.5" />
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TodayLedger({ metrics }: { metrics: TodayMetrics }) {
  const rows = [
    { label: "Omzet", value: formatRupiah(metrics.omzet), icon: DollarSign, tone: "text-foreground" },
    { label: "Profit", value: formatRupiah(metrics.profit), icon: TrendingUp, tone: "text-success" },
    { label: "Pcs terjual", value: formatNumber(metrics.pcs), icon: PackageMinus, tone: "text-foreground" },
    { label: "Margin", value: `${metrics.margin}%`, icon: BarChart3, tone: "text-primary" },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-black">Transaksi hari ini</h2>
        <p className="text-xs text-muted-foreground">Angka operasional, bukan pajangan.</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
        {rows.map((row) => (
          <div key={row.label} className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <row.icon className="h-4 w-4" />
              {row.label}
            </div>
            <p className={`text-xl font-black tabular-nums ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LowStockQueue({ products, isLoading }: { products: ProductWithDetails[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  const items = products
    ?.filter((p) => p.stock && p.stock.jumlah > 0 && p.stock.jumlah <= 15)
    .sort((a, b) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 7) ?? [];

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-black">Antrian cek stok</h2>
          <p className="text-xs text-muted-foreground">Kode yang stok fisiknya rendah.</p>
        </div>
        {items.length > 0 && (
          <Badge variant="destructive" className="rounded-md">
            {items.length}
          </Badge>
        )}
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Memuat stok...</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Tidak ada stok rendah.</p>
        ) : (
          items.map((product) => {
            const jumlah = product.stock?.jumlah ?? 0;
            const status = getStockStatus(jumlah);
            const secondaryLabel = getCompactProductLabel(product.kode, product.nama);
            const pct = Math.max((jumlah / 15) * 100, 5);
            return (
              <div key={product.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black">{product.kode}</span>
                      {secondaryLabel && <span className="truncate text-xs text-muted-foreground">{secondaryLabel}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        className={
                          status === "kritis"
                            ? "rounded-md border-destructive/20 bg-destructive/10 text-destructive"
                            : "rounded-md border-warning/20 bg-warning/10 text-warning"
                        }
                      >
                        {status === "kritis" ? "Kritis" : "Perlu cek"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">batas aman 15 pcs</span>
                    </div>
                  </div>
                  <p className={`text-lg font-black tabular-nums ${status === "kritis" ? "text-destructive" : "text-warning"}`}>
                    {jumlah}
                  </p>
                </div>
                <Progress
                  value={pct}
                  className={`mt-2 h-1 ${status === "kritis" ? "[&>div]:bg-destructive" : "[&>div]:bg-warning"}`}
                />
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border px-4 py-3">
        <Button
          variant="outline"
          className="h-9 w-full rounded-md text-xs font-bold"
          onClick={() => navigate("/stok?kategori=2 Ons")}
        >
          Lihat semua stok
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}

function SalesChartPanel({ chartData }: { chartData: { label: string; omzet: number; pcs: number }[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black">
            <BarChart3 className="h-4 w-4 text-primary" />
            Ritme penjualan
          </h2>
          <p className="text-xs text-muted-foreground">7 hari terakhir untuk baca arah omzet.</p>
        </div>
        <Badge className="rounded-md border-primary/20 bg-primary/8 text-primary">7 hari</Badge>
      </div>
      <div className="h-56 px-2 pb-3 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                name === "omzet" ? formatRupiah(value) : formatNumber(value),
                name === "omzet" ? "Omzet" : "Pcs",
              ]}
              contentStyle={{
                borderRadius: 8,
                fontSize: 11,
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 6px 12px rgba(15, 23, 42, 0.08)",
                background: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
              }}
            />
            <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", tone: "text-success" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", tone: "text-destructive" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", tone: "text-warning" },
    { icon: Package, label: "Cek Stok", path: "/stok?kategori=2 Ons", tone: "text-primary" },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-black">Aksi cepat</h2>
        <p className="hidden text-xs text-muted-foreground sm:block">Jalur masuk ke kerja harian.</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="flex min-h-[76px] items-center justify-center gap-2 bg-card px-3 py-3 text-sm font-bold transition-colors hover:bg-muted/35"
          >
            <action.icon className={`h-5 w-5 ${action.tone}`} strokeWidth={2.3} />
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

const Dashboard = () => {
  const { data: allProducts, isLoading } = useProducts();
  useStockNotifications();
  const products = allProducts?.filter((p) => p.kategori === "2 Ons");
  const summary = getInventorySummary(products);

  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowWib = new Date(nowUtc.getTime() + WIB_OFFSET_MS);
  const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-${String(nowWib.getUTCDate()).padStart(2, "0")}`;
  const todayStartUtc = new Date(todayWibStr + "T00:00:00+07:00");
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 86400000);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const { data: todaySales } = useQuery({
    queryKey: ["dashboard_today_sales", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,total_harga,created_at&created_at=gte.${todayStartUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ product_id: string; qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 30000,
  });

  const { data: todayStockIn } = useQuery({
    queryKey: ["dashboard_today_stock_in", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_in?select=product_id,qty,created_at&created_at=gte.${todayStartUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ product_id: string; qty: number; created_at: string }[]>;
    },
    refetchInterval: 30000,
  });

  const sevenDaysAgoUtc = new Date(todayStartUtc.getTime() - 6 * 86400000);

  const { data: weekSales } = useQuery({
    queryKey: ["dashboard_week_sales", todayWibStr],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=qty_kirim,total_harga,created_at&created_at=gte.${sevenDaysAgoUtc.toISOString()}&created_at=lt.${tomorrowStartUtc.toISOString()}&order=created_at.asc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 60000,
  });

  const omzetHariIni = todaySales?.reduce((sum, row) => sum + row.total_harga, 0) ?? 0;
  const pcsHariIni = todaySales?.reduce((sum, row) => sum + row.qty_kirim, 0) ?? 0;
  const modalHariIni = todaySales?.reduce((sum, row) => {
    const product = allProducts?.find((p) => p.id === row.product_id);
    const modal = product?.prices?.harga_modal ?? 0;
    return sum + row.qty_kirim * modal;
  }, 0) ?? 0;
  const profitHariIni = omzetHariIni - modalHariIni;
  const marginPct = omzetHariIni > 0 ? Math.round((profitHariIni / omzetHariIni) * 100) : 0;

  const stockInPcsHariIni = todayStockIn?.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const stockInEntries = todayStockIn?.length ?? 0;
  const stockInCostHariIni = todayStockIn?.reduce((sum, row) => {
    const product = allProducts?.find((p) => p.id === row.product_id);
    const modal = product?.prices?.harga_modal ?? 0;
    return sum + row.qty * modal;
  }, 0) ?? 0;

  const todayMetrics: TodayMetrics = {
    omzet: omzetHariIni,
    profit: profitHariIni,
    pcs: pcsHariIni,
    margin: marginPct,
    stockInPcs: stockInPcsHariIni,
    stockInEntries,
    stockInCost: stockInCostHariIni,
  };

  const chartData = (() => {
    const toWibDateStr = (isoStr: string) => {
      const utc = new Date(isoStr).getTime();
      const wib = new Date(utc + WIB_OFFSET_MS);
      return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    };
    const toWibLabel = (date: Date) => {
      const wib = new Date(date.getTime() + WIB_OFFSET_MS);
      const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      return `${dayNames[wib.getUTCDay()]} ${wib.getUTCDate()}`;
    };

    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 86400000);
      days.push({ label: toWibLabel(day), date: toWibDateStr(day.toISOString()), omzet: 0, pcs: 0 });
    }

    weekSales?.forEach((sale) => {
      const saleDate = toWibDateStr(sale.created_at);
      const day = days.find((d) => d.date === saleDate);
      if (day) {
        day.omzet += sale.total_harga;
        day.pcs += sale.qty_kirim;
      }
    });

    return days;
  })();

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-4 p-4 pb-24 md:p-6 md:pb-6">
      <DashboardHeader summary={summary} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <WorkQueue summary={summary} metrics={todayMetrics} />
        <CriticalStockAlert />
      </div>

      <TodayLedger metrics={todayMetrics} />
    </div>
  );
};

export default Dashboard;
