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
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { CriticalStockAlert } from "@/components/CriticalStockAlert";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
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

// Midnight Indigo palette (locked tokens for this page)
const ink = {
  bg: "#0a0a1a",
  surface: "#141432",
  surfaceHi: "#1e1b4b",
  border: "#2a2a5a",
  borderHi: "#3730a3",
  indigo: "#4f46e5",
  indigoSoft: "#818cf8",
  text: "#f8fafc",
  textMute: "#a5b4fc",
  textDim: "#7c83b4",
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

function HeroPanel({ summary, metrics }: { summary: InventorySummary; metrics: TodayMetrics }) {
  const navigate = useNavigate();
  const focusCount = summary.kosong + summary.kritis;
  const allClear = focusCount === 0;

  return (
    <header
      className="relative overflow-hidden rounded-[28px] border p-6 md:p-8"
      style={{
        background: `linear-gradient(135deg, ${ink.surface} 0%, ${ink.bg} 100%)`,
        borderColor: ink.borderHi + "80",
        color: ink.text,
      }}
    >
      {/* subtle aurora */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ background: `radial-gradient(circle, ${ink.indigo}, transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${ink.indigoSoft}, transparent 70%)` }}
      />

      <div className="relative flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ borderColor: ink.borderHi, color: ink.textMute }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: allClear ? "#34d399" : "#f87171" }} />
          {allClear ? "Stok terkendali" : "Perlu tindakan"}
        </span>
        <span className="text-sm font-medium" style={{ color: ink.textMute }}>
          {getGreeting()}, Boss
        </span>
      </div>

      <h1 className="font-display relative mt-4 text-4xl font-extrabold tracking-tight md:text-5xl">
        {allClear ? "Mulai dari kontrol stok" : `${formatNumber(focusCount)} kode rawan`}
      </h1>
      <p className="relative mt-2 max-w-xl text-base" style={{ color: ink.textMute }}>
        {allClear
          ? "Semua stok utama dalam kondisi aman hari ini. Pantau ritme dan jaga momentumnya."
          : "Selesaikan kode rawan dulu sebelum hari makin sibuk."}
      </p>

      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => navigate("/analisa")}
          className="h-12 rounded-2xl px-6 text-base font-bold shadow-lg shadow-indigo-900/30 transition-transform active:scale-95"
          style={{ background: ink.indigo, color: ink.text }}
        >
          Mulai Analisa Restock
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => navigate("/masuk")}
          className="h-12 rounded-2xl border px-5 text-base font-semibold transition-colors"
          style={{ borderColor: ink.borderHi, color: ink.text, background: "transparent" }}
        >
          <PackagePlus className="mr-2 h-5 w-5" />
          Input Masuk
        </Button>
      </div>

      {/* Inline metrics row */}
      <div className="relative mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeroMetric label="Omzet hari ini" value={formatRupiah(metrics.omzet)} accent={ink.indigoSoft} />
        <HeroMetric label="Profit" value={formatRupiah(metrics.profit)} accent="#34d399" />
        <HeroMetric label="Pcs keluar" value={formatNumber(metrics.pcs)} accent={ink.text} />
        <HeroMetric label="Margin" value={`${metrics.margin}%`} accent="#fbbf24" />
      </div>
    </header>
  );
}

function HeroMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 backdrop-blur-sm"
      style={{ borderColor: ink.border + "cc", background: "rgba(255,255,255,0.03)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: ink.textDim }}>
        {label}
      </p>
      <p className="font-display mt-1 text-xl font-extrabold tabular-nums md:text-2xl" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function StatusGrid({ summary }: { summary: InventorySummary }) {
  const navigate = useNavigate();
  const items = [
    { label: "Kosong", value: summary.kosong, helper: "isi ulang", icon: PackageX, color: "#f87171", soft: "rgba(248,113,113,0.10)" },
    { label: "Kritis", value: summary.kritis, helper: "1–5 pcs", icon: AlertTriangle, color: "#fb923c", soft: "rgba(251,146,60,0.10)" },
    { label: "Perlu cek", value: summary.warning, helper: "6–15 pcs", icon: Activity, color: "#fbbf24", soft: "rgba(251,191,36,0.10)" },
    { label: "Aman", value: summary.aman, helper: "stok cukup", icon: CheckCircle2, color: "#34d399", soft: "rgba(52,211,153,0.10)" },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate("/stok?kategori=2 Ons")}
          className="group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5"
          style={{ borderColor: ink.border, background: ink.surface, color: ink.text }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-3xl font-extrabold tabular-nums" style={{ color: item.color }}>
                {formatNumber(item.value)}
              </p>
              <p className="mt-1 text-sm font-semibold">{item.label}</p>
              <p className="text-xs" style={{ color: ink.textDim }}>{item.helper}</p>
            </div>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: item.soft, color: item.color }}
            >
              <item.icon className="h-5 w-5" />
            </span>
          </div>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 transition-transform group-hover:scale-x-100"
            style={{ background: item.color }}
          />
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
      color: "#f87171",
      onClick: () => navigate("/analisa"),
    },
    {
      title: "Cek stok menipis",
      value: `${summary.warning} kode`,
      detail: "Pastikan fisik = sistem",
      action: "Cek Stok",
      icon: ListChecks,
      color: "#fbbf24",
      onClick: () => navigate("/stok?kategori=2 Ons"),
    },
    {
      title: "Barang masuk hari ini",
      value: `${formatNumber(metrics.stockInPcs)} pcs`,
      detail: `${metrics.stockInEntries} entri • ${formatRupiah(metrics.stockInCost)}`,
      action: "Input Masuk",
      icon: PackagePlus,
      color: ink.indigoSoft,
      onClick: () => navigate("/masuk"),
    },
  ];

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: ink.border, background: ink.surface, color: ink.text }}
    >
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: ink.border }}>
        <div>
          <h2 className="font-display text-lg font-bold">Kerjakan berurutan</h2>
          <p className="text-xs" style={{ color: ink.textDim }}>
            Biar tidak loncat-loncat saat toko mulai ramai.
          </p>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: ink.borderHi, color: ink.textMute }}
        >
          {urgentCount > 0 ? "Ada prioritas" : "Terkendali"}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: ink.border }}>
        {rows.map((row) => (
          <button
            key={row.title}
            onClick={row.onClick}
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
            style={{ borderColor: ink.border }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: row.color + "1f", color: row.color }}
            >
              <row.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{row.title}</p>
              <p className="mt-0.5 truncate text-xs" style={{ color: ink.textDim }}>
                {row.detail}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-extrabold tabular-nums">{row.value}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: row.color }}>
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

function LowStockQueue({ products, isLoading }: { products: ProductWithDetails[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  const items = products
    ?.filter((p) => p.stock && p.stock.jumlah > 0 && p.stock.jumlah <= 15)
    .sort((a, b) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 6) ?? [];

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: ink.border, background: ink.surface, color: ink.text }}
    >
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: ink.border }}>
        <div>
          <h2 className="font-display text-lg font-bold">Antrian cek stok</h2>
          <p className="text-xs" style={{ color: ink.textDim }}>Kode dengan stok fisik rendah.</p>
        </div>
        {items.length > 0 && (
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: "rgba(248,113,113,0.15)", color: "#fca5a5" }}
          >
            {items.length}
          </span>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: ink.border }}>
        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: ink.textDim }}>Memuat stok…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: ink.textDim }}>Tidak ada stok rendah.</p>
        ) : (
          items.map((product) => {
            const jumlah = product.stock?.jumlah ?? 0;
            const status = getStockStatus(jumlah);
            const accent = status === "kritis" ? "#f87171" : "#fbbf24";
            const secondaryLabel = getCompactProductLabel(product.kode, product.nama);
            const pct = Math.max((jumlah / 15) * 100, 6);
            return (
              <div key={product.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold tracking-tight">{product.kode}</span>
                      {secondaryLabel && (
                        <span className="truncate text-xs" style={{ color: ink.textDim }}>
                          {secondaryLabel}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-wider" style={{ color: accent }}>
                      {status === "kritis" ? "Kritis" : "Perlu cek"} • batas aman 15 pcs
                    </p>
                  </div>
                  <p className="font-display text-2xl font-extrabold tabular-nums" style={{ color: accent }}>
                    {jumlah}
                  </p>
                </div>
                <Progress
                  value={pct}
                  className="mt-3 h-1 bg-white/[0.06]"
                  style={{ ["--progress-color" as never]: accent }}
                />
              </div>
            );
          })
        )}
      </div>
      <div className="border-t px-5 py-3" style={{ borderColor: ink.border }}>
        <button
          onClick={() => navigate("/stok?kategori=2 Ons")}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-colors hover:bg-white/[0.04]"
          style={{ color: ink.textMute }}
        >
          Lihat semua stok
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", color: "#34d399" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", color: "#f87171" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", color: "#fbbf24" },
    { icon: Package, label: "Cek Stok", path: "/stok?kategori=2 Ons", color: ink.indigoSoft },
  ];

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: ink.border, background: ink.surface, color: ink.text }}
    >
      <div className="border-b px-5 py-4" style={{ borderColor: ink.border }}>
        <h2 className="font-display text-lg font-bold">Aksi cepat</h2>
        <p className="text-xs" style={{ color: ink.textDim }}>Jalur masuk ke kerja harian.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="group flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all hover:-translate-y-0.5"
            style={{ borderColor: ink.border, background: "rgba(255,255,255,0.02)" }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
              style={{ background: action.color + "1f", color: action.color }}
            >
              <action.icon className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <span className="text-sm font-semibold">{action.label}</span>
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
    <div
      className="-mx-4 -my-4 min-h-[calc(100vh-4rem)] px-4 py-6 md:-mx-6 md:-my-6 md:px-6 md:py-8"
      style={{ background: ink.bg }}
    >
      <div className="mx-auto w-full max-w-[1360px] space-y-5 pb-24 md:pb-8">
        <HeroPanel summary={summary} metrics={todayMetrics} />

        <StatusGrid summary={summary} />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <WorkQueue summary={summary} metrics={todayMetrics} />
          <LowStockQueue products={products} isLoading={isLoading} />
        </div>

        <QuickActions />

        <div className="rounded-2xl">
          <CriticalStockAlert />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
