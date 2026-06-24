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
  const navigate = useNavigate();
  const focusCount = summary.kosong + summary.kritis;
  const hasUrgentStock = focusCount > 0;
  const statusLabel = hasUrgentStock ? "Perlu tindakan hari ini" : "Stok utama terkendali";
  const statusTone = hasUrgentStock
    ? "border-red-400/25 bg-red-400/10 text-red-100"
    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";

  return (
    <header className="overflow-hidden rounded-xl border border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.16),transparent_28%),linear-gradient(135deg,#020617,#0f172a)] text-white">
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-blue-300">{getGreeting()}, Boss</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone}`}>
              {statusLabel}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
            {hasUrgentStock ? `${formatNumber(focusCount)} kode rawan` : "Mulai dari kontrol stok"}
          </h1>
        </div>
        <Button
          className="h-11 rounded-lg bg-white text-slate-950 hover:bg-blue-50"
          onClick={() => navigate("/analisa")}
        >
          Mulai Analisa Restock
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-white/10 bg-white/[0.05] p-3 text-xs text-slate-400">
        <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2">
          <span className="block text-base font-black text-red-200">{formatNumber(focusCount)} kode</span>
          bereskan dulu
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2">
          <span className="block text-base font-black text-amber-200">{formatNumber(summary.warning)} kode</span>
          cek setelahnya
        </div>
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
          <span className="block text-base font-black text-emerald-200">{formatNumber(summary.aman)} kode</span>
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
      className: "border-destructive/30 bg-gradient-to-br from-destructive/10 to-background text-destructive",
      iconClass: "bg-destructive/10 text-destructive",
    },
    {
      label: "Kritis",
      value: summary.kritis,
      helper: "stok 1-5 pcs",
      icon: AlertTriangle,
      className: "border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-background text-orange-600",
      iconClass: "bg-orange-500/10 text-orange-600",
    },
    {
      label: "Perlu cek",
      value: summary.warning,
      helper: "stok 6-15 pcs",
      icon: Activity,
      className: "border-warning/30 bg-gradient-to-br from-warning/10 to-background text-warning",
      iconClass: "bg-warning/10 text-warning",
    },
    {
      label: "Aman",
      value: summary.aman,
      helper: "stok cukup",
      icon: CheckCircle2,
      className: "border-success/30 bg-gradient-to-br from-success/10 to-background text-success",
      iconClass: "bg-success/10 text-success",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate("/stok?kategori=2 Ons")}
          className={`flex min-h-[82px] items-center justify-between rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${item.className}`}
        >
          <div>
            <p className="text-2xl font-black leading-none tabular-nums">{item.value}</p>
            <p className="mt-1 text-sm font-bold text-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.helper}</p>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.iconClass}`}>
            <item.icon className="h-5 w-5" />
          </span>
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
      action: "Analisa 4 hari",
      icon: AlertTriangle,
      tone: "text-destructive",
      wrap: "border-destructive/20 bg-gradient-to-br from-destructive/10 via-destructive/5 to-background",
      iconWrap: "bg-destructive/10 text-destructive",
      actionTone: "text-destructive",
      onClick: () => navigate("/analisa"),
    },
    {
      title: "Cek stok menipis",
      value: `${summary.warning} kode`,
      detail: "Pastikan fisik sama dengan sistem sebelum belanja",
      action: "Cek Stok",
      icon: ListChecks,
      tone: "text-warning",
      wrap: "border-warning/20 bg-gradient-to-br from-warning/10 via-warning/5 to-background",
      iconWrap: "bg-warning/10 text-warning",
      actionTone: "text-warning",
      onClick: () => navigate("/stok?kategori=2 Ons"),
    },
    {
      title: "Barang masuk hari ini",
      value: `${formatNumber(metrics.stockInPcs)} pcs`,
      detail: `${metrics.stockInEntries} entri, modal ${formatRupiah(metrics.stockInCost)}`,
      action: "Input Masuk",
      icon: PackagePlus,
      tone: "text-primary",
      wrap: "border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background",
      iconWrap: "bg-primary/10 text-primary",
      actionTone: "text-primary",
      onClick: () => navigate("/masuk"),
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-black">Kerjakan berurutan</h2>
          <p className="text-xs text-muted-foreground">Biar tidak loncat-loncat saat toko mulai ramai.</p>
        </div>
        <Badge className="rounded-full border-primary/20 bg-primary/8 text-primary">
          {urgentCount > 0 ? "Ada prioritas" : "Terkendali"}
        </Badge>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <button
            key={row.title}
            onClick={row.onClick}
            className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-all hover:brightness-[1.01] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${row.wrap}`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${row.iconWrap}`}>
              <row.icon className={`h-4 w-4 ${row.tone}`} />
            </span>
            <div className="min-w-0">
              <p className="font-bold leading-tight">{row.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <div className="text-right">
              <p className="font-black tabular-nums">{row.value}</p>
              <p className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold ${row.actionTone}`}>
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

function DailyPulse({ summary, metrics }: { summary: InventorySummary; metrics: TodayMetrics }) {
  const urgentCount = summary.kosong + summary.kritis;
  const items = [
    {
      label: "Kode rawan",
      value: `${formatNumber(urgentCount)} kode`,
      helper: "kosong + kritis",
      tone: urgentCount > 0 ? "text-destructive" : "text-success",
    },
    {
      label: "Keluar hari ini",
      value: `${formatNumber(metrics.pcs)} pcs`,
      helper: "barang terkirim",
      tone: "text-foreground",
    },
    {
      label: "Masuk hari ini",
      value: `${formatNumber(metrics.stockInPcs)} pcs`,
      helper: `${metrics.stockInEntries} entri`,
      tone: "text-primary",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-r from-background via-primary/5 to-success/5 px-4 py-3">
        <h2 className="text-base font-black">Ringkasan operasional</h2>
        <p className="text-xs text-muted-foreground">Angka kecil untuk cek ritme hari ini.</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border">
        {items.map((item) => (
          <div
            key={item.label}
            className={`px-3 py-4 ${item.label === "Kode rawan" ? "bg-destructive/5" : item.label === "Keluar hari ini" ? "bg-background" : "bg-primary/5"}`}
          >
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-lg font-black tabular-nums ${item.tone}`}>{item.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{item.helper}</p>
          </div>
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
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-r from-background via-primary/5 to-warning/5 px-4 py-3">
        <h2 className="text-base font-black">Transaksi hari ini</h2>
        <p className="text-xs text-muted-foreground">Angka operasional, bukan pajangan.</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`p-4 ${row.label === "Omzet" ? "bg-primary/5" : row.label === "Profit" ? "bg-success/5" : row.label === "Pcs terjual" ? "bg-background" : "bg-warning/5"}`}
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${row.label === "Profit" ? "bg-success/10 text-success" : row.label === "Margin" ? "bg-warning/10 text-warning" : row.label === "Omzet" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
                <row.icon className="h-4 w-4" />
              </span>
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
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", tone: "text-success", wrap: "from-success/10 to-background border-success/15", chip: "bg-success/10 text-success" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", tone: "text-destructive", wrap: "from-destructive/10 to-background border-destructive/15", chip: "bg-destructive/10 text-destructive" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", tone: "text-warning", wrap: "from-warning/10 to-background border-warning/15", chip: "bg-warning/10 text-warning" },
    { icon: Package, label: "Cek Stok", path: "/stok?kategori=2 Ons", tone: "text-primary", wrap: "from-primary/10 to-background border-primary/15", chip: "bg-primary/10 text-primary" },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-background via-primary/5 to-warning/5 px-4 py-3">
        <h2 className="text-base font-black">Aksi cepat</h2>
        <p className="hidden text-xs text-muted-foreground sm:block">Jalur masuk ke kerja harian.</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`flex min-h-[78px] items-center justify-center gap-2 bg-gradient-to-br px-3 py-3 text-sm font-bold transition-all hover:brightness-[1.02] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${action.wrap}`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.chip}`}>
              <action.icon className={`h-5 w-5 ${action.tone}`} strokeWidth={2.3} />
            </span>
            <span className={action.tone}>{action.label}</span>
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

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-4 p-4 pb-24 md:p-6 md:pb-6">
      <DashboardHeader summary={summary} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <CriticalStockAlert />
        <WorkQueue summary={summary} metrics={todayMetrics} />
      </div>

      <DailyPulse summary={summary} metrics={todayMetrics} />
    </div>
  );
};

export default Dashboard;
