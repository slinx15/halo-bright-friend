import { useEffect } from "react";
import { Package, PackagePlus, PackageMinus, ClipboardCheck, AlertTriangle, TrendingUp, DollarSign, BarChart3, AlertCircle, PackageX, Sparkles, CheckCircle2, ChevronRight } from "lucide-react";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { AiInsightsCard } from "@/components/AiInsightsCard";
import { CriticalStockAlert } from "@/components/CriticalStockAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";
import { useQuery } from "@tanstack/react-query";
import { formatNumber, formatRupiah, getStockStatus } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { getAuthHeaders } from "@/lib/authHeaders";
import { useStockNotifications, requestNotificationPermission } from "@/hooks/useStockNotifications";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

// ── Time-based greeting ───────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
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

// ── Command Center Chips ──────────────────────────────────────────
function CommandCenter({ products, isLoading }: { products: ProductWithDetails[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  if (isLoading || !products) return null;

  const total = products.length;
  const totalStok = products.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0);
  const kosong = products.filter(p => (p.stock?.jumlah ?? 0) === 0).length;
  const kritis = products.filter(p => {
    const j = p.stock?.jumlah ?? 0;
    return j > 0 && j <= 5;
  }).length;
  const warning = products.filter(p => {
    const j = p.stock?.jumlah ?? 0;
    return j > 5 && j <= 15;
  }).length;
  const aman = total - kosong - kritis - warning;

  const cards = [
    {
      label: "Kosong",
      helper: "perlu isi ulang",
      count: kosong,
      icon: PackageX,
      lightBg: "bg-destructive/8",
      lightText: "text-destructive",
      indicator: "bg-destructive",
    },
    {
      label: "Kritis",
      helper: "stok menipis",
      count: kritis,
      icon: AlertCircle,
      lightBg: "bg-orange-500/8",
      lightText: "text-orange-600",
      indicator: "bg-orange-500",
    },
    {
      label: "Perlu Cek",
      helper: "masih perlu pantau",
      count: warning,
      icon: AlertTriangle,
      lightBg: "bg-warning/8",
      lightText: "text-amber-600",
      indicator: "bg-warning",
    },
    {
      label: "Aman",
      helper: "stok cukup",
      count: aman,
      icon: CheckCircle2,
      lightBg: "bg-success/8",
      lightText: "text-success",
      indicator: "bg-success",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="card-premium p-3.5 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Ringkasan inventaris 2 Ons
            </div>
            <p className="text-lg font-extrabold tracking-tight">Stok toko hari ini terlihat jelas dari sini.</p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Fokus utama: barang kosong, stok kritis, dan total barang aktif yang masih aman untuk dijual.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
            <div className="rounded-2xl bg-muted/45 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jenis Barang</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(total)}</p>
            </div>
            <div className="rounded-2xl bg-muted/45 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total Stok</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(totalStok)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate("/stok?kategori=2 Ons")}
            className={`card-premium ${card.lightBg} p-3 text-left transition-all duration-200 native-press`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.lightBg}`}>
                <card.icon className={`h-4.5 w-4.5 ${card.lightText}`} />
              </div>
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${card.indicator}`} />
            </div>
            <div className="mt-4 space-y-1">
              <p className={`text-2xl font-black leading-none tabular-nums ${card.lightText}`}>{card.count}</p>
              <p className="text-sm font-bold">{card.label}</p>
              <p className="text-[11px] text-muted-foreground">{card.helper}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hero KPI Section ──────────────────────────────────────────────
function DailyOverview({
  omzet,
  profit,
  pcs,
  margin,
  stockInPcs,
  stockInEntries,
  stockInCost,
}: {
  omzet: number;
  profit: number;
  pcs: number;
  margin: number;
  stockInPcs: number;
  stockInEntries: number;
  stockInCost: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.7fr_1fr]">
      <Card className="card-premium border-border/60">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-bold text-primary">
                <DollarSign className="h-3.5 w-3.5" />
                Performa Hari Ini
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">Angka utama operasional harian.</h2>
              <p className="text-sm text-muted-foreground">
                Omzet, profit, dan laju penjualan hari ini disusun untuk dibaca cepat tanpa efek dekoratif berlebihan.
              </p>
            </div>
            <div className="rounded-2xl bg-primary/8 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">Margin</p>
              <p className="mt-1 text-lg font-extrabold tabular-nums text-primary">{margin}%</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Omzet</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{formatRupiah(omzet)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profit</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums text-success">{formatRupiah(profit)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pcs Terjual</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(pcs)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Card className="card-premium border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Barang Masuk</p>
                <p className="mt-2 text-xl font-extrabold tracking-tight tabular-nums">{formatNumber(stockInPcs)} pcs</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{stockInEntries} entri hari ini</p>
              </div>
              <div className="rounded-2xl bg-primary/8 p-2.5">
                <PackagePlus className="h-4.5 w-4.5 text-primary" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-muted/35 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total Modal Masuk</p>
              <p className="mt-1 text-base font-extrabold tabular-nums text-primary">{formatRupiah(stockInCost)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-premium border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arah Hari Ini</p>
                <p className="mt-2 text-base font-bold leading-snug">
                  {profit > 0 ? "Penjualan bergerak sehat dan margin tetap positif." : "Aktivitas penjualan ada, tapi profit belum terlihat kuat."}
                </p>
              </div>
              <div className="rounded-2xl bg-success/10 p-2.5">
                <TrendingUp className="h-4.5 w-4.5 text-success" />
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary">
              Buka Analisa untuk keputusan restock
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Stok Rendah Card ──────────────────────────────────────────────
function StokRendahCard({ products, isLoading }: { products: ProductWithDetails[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  const stokKritisList = products
    ?.filter(p => p.stock && p.stock.jumlah > 0 && p.stock.jumlah <= 15)
    .sort((a, b) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 5) ?? [];

  const maxStock = 15;

  return (
    <Card className="card-premium">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <div className="p-1 rounded-md bg-destructive/10">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            </div>
            Stok Rendah
          </CardTitle>
          {stokKritisList.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full font-bold">
              {stokKritisList.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Memuat...</p>
        ) : stokKritisList.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Semua stok aman</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stokKritisList.map((p) => {
              const jumlah = p.stock?.jumlah ?? 0;
              const status = getStockStatus(jumlah);
              const pct = Math.max((jumlah / maxStock) * 100, 5);
              const secondaryLabel = getCompactProductLabel(p.kode, p.nama);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-2 rounded-2xl border p-2.5 ${
                    status === "kritis" ? "border-destructive/25 bg-destructive/5" : "border-warning/25 bg-warning/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm shrink-0">{p.kode}</span>
                      {secondaryLabel && (
                        <span className="text-muted-foreground text-[11px] truncate">{secondaryLabel}</span>
                      )}
                    </div>
                    <span className={`font-extrabold text-sm tabular-nums ${status === "kritis" ? "text-destructive" : "text-warning"}`}>
                      {jumlah}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      className={
                        status === "kritis"
                          ? "border-destructive/20 bg-destructive/10 text-destructive"
                          : "border-warning/20 bg-warning/10 text-warning"
                      }
                    >
                      {status === "kritis" ? "Kritis" : "Perlu cek"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">maks 15 pcs aman</span>
                  </div>
                  <Progress
                    value={pct}
                    className={`h-1 ${status === "kritis" ? "[&>div]:bg-destructive" : "[&>div]:bg-warning"}`}
                  />
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs mt-1 rounded-xl font-semibold text-primary hover:bg-primary/5"
              onClick={() => navigate("/stok?kategori=2 Ons")}
            >
              Lihat semua stok
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quick Actions (desktop only) ──────────────────────────────────
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
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-bold">Aksi Cepat</CardTitle>
          <p className="text-[11px] text-muted-foreground">Masuk ke alur kerja paling sering dipakai</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-4 gap-3">
          {actions.map(action => (
            <Button
              key={action.path}
              variant="outline"
              className="h-auto flex-col gap-2 rounded-2xl border-border/60 bg-card py-4 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-150"
              onClick={() => navigate(action.path)}
            >
              <div className={`p-2 rounded-lg ${action.bg}`}>
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

// InventorySummary removed — integrated into CommandCenter

// ── Main Dashboard ────────────────────────────────────────────────
function DashboardHeader({ totalItems, totalStok }: { totalItems: number; totalStok: number }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{getGreeting()}, Boss</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard operasional RRCollections</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Halaman ini harus jadi titik baca tercepat untuk kondisi stok, laju penjualan, dan aksi penting hari ini.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
        <div className="rounded-2xl border border-border/60 bg-card px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2 Ons Aktif</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">{formatNumber(totalItems)}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stok Fisik</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">{formatNumber(totalStok)}</p>
        </div>
      </div>
    </div>
  );
}

const Dashboard = () => {
  const { data: allProducts, isLoading } = useProducts();
  useStockNotifications();
  // Dashboard hanya menampilkan produk 2 Ons (stok fisik di rumah)
  const products = allProducts?.filter(p => p.kategori === "2 Ons");
  const dashboardLoading = isLoading;

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;

  // WIB (UTC+7) boundaries for today
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowWib = new Date(nowUtc.getTime() + WIB_OFFSET_MS);
  const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-${String(nowWib.getUTCDate()).padStart(2, "0")}`;
  const todayStartUtc = new Date(todayWibStr + "T00:00:00+07:00");
  const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 86400000);

  // Request notification permission on first visit
  useEffect(() => { requestNotificationPermission(); }, []);

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

  const omzetHariIni = todaySales?.reduce((s, r) => s + r.total_harga, 0) ?? 0;
  const pcsHariIni = todaySales?.reduce((s, r) => s + r.qty_kirim, 0) ?? 0;

  // Use ALL products (not just 2 Ons) for profit calculation
  const modalHariIni = todaySales?.reduce((s, r) => {
    const product = allProducts?.find(p => p.id === r.product_id);
    const modal = product?.prices?.harga_modal ?? 0;
    return s + (r.qty_kirim * modal);
  }, 0) ?? 0;
  const profitHariIni = omzetHariIni - modalHariIni;
  const marginPct = omzetHariIni > 0 ? Math.round((profitHariIni / omzetHariIni) * 100) : 0;

  // Stock In today
  const stockInPcsHariIni = todayStockIn?.reduce((s, r) => s + r.qty, 0) ?? 0;
  const stockInEntries = todayStockIn?.length ?? 0;
  const stockInCostHariIni = todayStockIn?.reduce((s, r) => {
    const product = allProducts?.find(p => p.id === r.product_id);
    const modal = product?.prices?.harga_modal ?? 0;
    return s + (r.qty * modal);
  }, 0) ?? 0;

  const chartData = (() => {
    // Convert UTC timestamp to WIB (UTC+7) date string to avoid timezone mismatch
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const toWibDateStr = (isoStr: string) => {
      const utc = new Date(isoStr).getTime();
      const wib = new Date(utc + WIB_OFFSET_MS);
      return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-${String(wib.getUTCDate()).padStart(2, "0")}`;
    };
    const toWibLabel = (d: Date) => {
      const utc = d.getTime();
      const wib = new Date(utc + WIB_OFFSET_MS);
      const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      return `${dayNames[wib.getUTCDay()]} ${wib.getUTCDate()}`;
    };

    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = toWibDateStr(d.toISOString());
      const label = toWibLabel(d);
      days.push({ label, date: dateStr, omzet: 0, pcs: 0 });
    }
    weekSales?.forEach(sale => {
      const saleDate = toWibDateStr(sale.created_at);
      const day = days.find(d => d.date === saleDate);
      if (day) {
        day.omzet += sale.total_harga;
        day.pcs += sale.qty_kirim;
      }
    });
    return days;
  })();

  if (dashboardLoading) return <DashboardSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full pb-24 md:pb-6">
      {/* Header — greeting based on time */}
      <div className="animate-fade-in">
        <DashboardHeader totalItems={totalItems} totalStok={totalStok} />
      </div>

      {/* 1. Command Center Chips */}
      <div className="animate-fade-in" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
        <CommandCenter products={products} isLoading={dashboardLoading} />
      </div>

      {/* 2. Critical Stock Alert — DOS ≤ 2 hari */}
      <div className="animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
        <CriticalStockAlert />
      </div>

      {/* 3. Hero KPI — Omzet, Profit, Pcs */}
      <div className="animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
        <DailyOverview
          omzet={omzetHariIni}
          profit={profitHariIni}
          pcs={pcsHariIni}
          margin={marginPct}
          stockInPcs={stockInPcsHariIni}
          stockInEntries={stockInEntries}
          stockInCost={stockInCostHariIni}
        />
      </div>

      {/* 3.5 Barang Masuk Hari Ini */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        <Card className="md:col-span-2 card-premium">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <div className="p-1 rounded-md bg-primary/10">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  Penjualan 7 Hari
                </CardTitle>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Grafik ini membantu baca ritme harian, bukan sekadar dekorasi dashboard.
                </p>
              </div>
              <Badge className="border-primary/20 bg-primary/8 text-primary">
                7 hari terakhir
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1 pb-3">
            <div className="h-48 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "omzet" ? formatRupiah(value) : formatNumber(value),
                      name === "omzet" ? "Omzet" : "Pcs",
                    ]}
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid hsl(213 25% 90%)", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", background: "hsl(210 40% 99%)", color: "hsl(222 47% 11%)" }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <StokRendahCard products={products} isLoading={dashboardLoading} />
      </div>

      {/* 5. AI Insights */}
      <div className="animate-fade-in" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
        <AiInsightsCard />
      </div>
      {/* 7. Quick Actions — desktop only */}
      <div className="hidden md:block animate-fade-in" style={{ animationDelay: "350ms", animationFillMode: "both" }}>
        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
