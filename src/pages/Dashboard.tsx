import { Package, PackagePlus, PackageMinus, ClipboardCheck, AlertTriangle, TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3, AlertCircle, PackageX, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { AiInsightsCard } from "@/components/AiInsightsCard";
import { CriticalStockAlert } from "@/components/CriticalStockAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { useQuery } from "@tanstack/react-query";
import { formatNumber, formatRupiah, getStockStatus } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getAuthHeaders() {
  const storageKey = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
  let token = SUPABASE_KEY;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.access_token || SUPABASE_KEY;
    }
  } catch {}
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  };
}

// ── Time-based greeting ───────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function getGreetingEmoji() {
  const hour = new Date().getHours();
  if (hour < 11) return "☀️";
  if (hour < 15) return "🌤️";
  if (hour < 18) return "🌅";
  return "🌙";
}

// ── Command Center Chips ──────────────────────────────────────────
function CommandCenter({ products, isLoading }: { products: any[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  if (isLoading || !products) return null;

  const kosong = products.filter(p => (p.stock?.jumlah ?? 0) === 0).length;
  const kritis = products.filter(p => {
    const j = p.stock?.jumlah ?? 0;
    return j > 0 && j <= 5;
  }).length;
  const warning = products.filter(p => {
    const j = p.stock?.jumlah ?? 0;
    return j > 5 && j <= 15;
  }).length;

  const chips = [
    { label: "Stok Kosong", count: kosong, bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20", icon: PackageX },
    { label: "Segera Habis", count: kritis, bg: "bg-orange-500/10", text: "text-orange-600", border: "border-orange-500/20", icon: AlertCircle },
    { label: "Perlu Restock", count: warning, bg: "bg-warning/10", text: "text-warning", border: "border-warning/20", icon: AlertTriangle },
  ].filter(c => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 md:mx-0 md:px-0">
      {chips.map(chip => (
        <button
          key={chip.label}
          onClick={() => navigate("/stok")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full border ${chip.bg} ${chip.border} ${chip.text} shrink-0 transition-all duration-200 active:scale-95 hover:shadow-md`}
        >
          <chip.icon className="h-3.5 w-3.5" />
          <span className="font-extrabold text-base leading-none">{chip.count}</span>
          <span className="text-[11px] font-semibold opacity-75">{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Hero KPI Section ──────────────────────────────────────────────
function HeroKpi({ omzet, profit, pcs, margin }: { omzet: number; profit: number; pcs: number; margin: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Omzet */}
      <div className="col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="h-3.5 w-3.5 opacity-80" />
            <span className="text-xs font-medium opacity-80">Omzet Hari Ini</span>
          </div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatRupiah(omzet)}</p>
          {margin > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <ArrowUpRight className="h-3 w-3" />
              <span className="text-[11px] font-semibold opacity-90">margin {margin}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Pcs Terjual */}
      <div className="rounded-2xl bg-card border border-border/50 p-4 shadow-sm flex flex-col justify-between">
        <div className="flex items-center gap-1.5 mb-1">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(pcs)}</p>
          <span className="text-[10px] text-muted-foreground font-medium">pcs terjual</span>
        </div>
      </div>

      {/* Profit */}
      <div className="col-span-3 rounded-2xl bg-card border border-border/50 p-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-success/10">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Profit Hari Ini</p>
              <p className="text-lg font-extrabold tracking-tight tabular-nums">{formatRupiah(profit)}</p>
            </div>
          </div>
          {profit > 0 && (
            <Badge className="bg-success/10 text-success border-0 text-[10px] font-bold px-2 py-0.5">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              +{formatRupiah(profit)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stok Rendah Card ──────────────────────────────────────────────
function StokRendahCard({ products, isLoading }: { products: any[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  const stokKritisList = products
    ?.filter(p => p.stock && p.stock.jumlah > 0 && p.stock.jumlah <= 15)
    .sort((a: any, b: any) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 5) ?? [];

  const maxStock = 15;

  return (
    <Card className="rounded-2xl shadow-sm border border-border/50">
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
            <p className="text-sm text-muted-foreground">Semua stok aman 👍</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stokKritisList.map((p: any) => {
              const jumlah = p.stock?.jumlah ?? 0;
              const status = getStockStatus(jumlah);
              const pct = Math.max((jumlah / maxStock) * 100, 5);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-1 p-2.5 rounded-xl ${
                    status === "kritis" ? "bg-destructive/5 border-l-[3px] border-l-destructive" : "bg-warning/5 border-l-[3px] border-l-warning"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm shrink-0">{p.kode}</span>
                      {p.nama && p.nama !== p.kode && (
                        <span className="text-muted-foreground text-[11px] truncate">{p.nama}</span>
                      )}
                    </div>
                    <span className={`font-extrabold text-sm tabular-nums ${status === "kritis" ? "text-destructive" : "text-warning"}`}>
                      {jumlah}
                    </span>
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
              onClick={() => navigate("/stok")}
            >
              Lihat semua stok →
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
    { icon: Package, label: "Cek Stok", path: "/stok", color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <Card className="rounded-2xl shadow-sm border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold">Aksi Cepat</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-4 gap-3">
          {actions.map(action => (
            <Button
              key={action.path}
              variant="outline"
              className="h-auto flex-col gap-2 py-4 rounded-xl border-border/50 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-150"
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

// ── Inventory Summary Mini ────────────────────────────────────────
function InventorySummary({ totalItems, totalStok, isLoading }: { totalItems: number; totalStok: number; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-card border border-border/50 p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Total Item</p>
            <p className="text-xl font-extrabold tracking-tight tabular-nums">{isLoading ? "..." : formatNumber(totalItems)}</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border/50 p-3.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-success/10">
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Total Stok</p>
            <p className="text-xl font-extrabold tracking-tight tabular-nums">{isLoading ? "..." : formatNumber(totalStok)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────
const Dashboard = () => {
  const { data: products, isLoading } = useProducts();

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todaySales } = useQuery({
    queryKey: ["dashboard_today_sales"],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,total_harga,created_at&created_at=gte.${todayStart.toISOString()}&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ product_id: string; qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 30000,
  });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const { data: weekSales } = useQuery({
    queryKey: ["dashboard_week_sales"],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=qty_kirim,total_harga,created_at&created_at=gte.${sevenDaysAgo.toISOString()}&order=created_at.asc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 60000,
  });

  const omzetHariIni = todaySales?.reduce((s, r) => s + r.total_harga, 0) ?? 0;
  const pcsHariIni = todaySales?.reduce((s, r) => s + r.qty_kirim, 0) ?? 0;

  const modalHariIni = todaySales?.reduce((s, r) => {
    const product = products?.find(p => p.id === r.product_id);
    const modal = product?.prices?.harga_modal ?? 0;
    return s + (r.qty_kirim * modal);
  }, 0) ?? 0;
  const profitHariIni = omzetHariIni - modalHariIni;
  const marginPct = omzetHariIni > 0 ? Math.round((profitHariIni / omzetHariIni) * 100) : 0;

  const chartData = (() => {
    const toLocalDateStr = (isoStr: string) => {
      const d = new Date(isoStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      days.push({ label, date: dateStr, omzet: 0, pcs: 0 });
    }
    weekSales?.forEach(sale => {
      const saleDate = toLocalDateStr(sale.created_at);
      const day = days.find(d => d.date === saleDate);
      if (day) {
        day.omzet += sale.total_harga;
        day.pcs += sale.qty_kirim;
      }
    });
    return days;
  })();

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full pb-24 md:pb-6">
      {/* Header — greeting based on time */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">
            {getGreeting()}, Boss {getGreetingEmoji()}
          </p>
          <h1 className="text-xl font-extrabold tracking-tight">Dashboard</h1>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          Live
        </div>
      </div>

      {/* 1. Command Center Chips */}
      <CommandCenter products={products} isLoading={isLoading} />

      {/* 2. Critical Stock Alert — DOS ≤ 2 hari */}
      <CriticalStockAlert />

      {/* 3. Hero KPI — Omzet, Profit, Pcs */}
      <HeroKpi omzet={omzetHariIni} profit={profitHariIni} pcs={pcsHariIni} margin={marginPct} />

      {/* 4. Chart + Stok Rendah */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2 rounded-2xl shadow-sm border border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="p-1 rounded-md bg-primary/10">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
              </div>
              Penjualan 7 Hari
            </CardTitle>
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
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <StokRendahCard products={products} isLoading={isLoading} />
      </div>

      {/* 5. AI Insights */}
      <AiInsightsCard />

      {/* 6. Inventory Summary */}
      <InventorySummary totalItems={totalItems} totalStok={totalStok} isLoading={isLoading} />

      {/* 7. Quick Actions — desktop only */}
      <div className="hidden md:block">
        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
