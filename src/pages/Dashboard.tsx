import { Package, PackagePlus, PackageMinus, ClipboardCheck, AlertTriangle, TrendingUp, DollarSign, ShoppingCart, BarChart3, AlertCircle, PackageX } from "lucide-react";
import { DashboardSkeleton } from "@/components/LoadingSkeletons";
import { AiInsightsCard } from "@/components/AiInsightsCard";
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
    { label: "Stok Kosong", count: kosong, bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30", icon: PackageX },
    { label: "Segera Habis", count: kritis, bg: "bg-critical/15", text: "text-critical", border: "border-critical/30", icon: AlertCircle },
    { label: "Perlu Restock", count: warning, bg: "bg-warning/15", text: "text-warning", border: "border-warning/30", icon: AlertTriangle },
  ].filter(c => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 md:mx-0 md:px-0">
      {chips.map(chip => (
        <button
          key={chip.label}
          onClick={() => navigate("/stok")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border ${chip.bg} ${chip.border} ${chip.text} shrink-0 transition-all duration-150 active:scale-95 hover:shadow-md`}
        >
          <chip.icon className="h-4 w-4" />
          <span className="font-bold text-lg">{chip.count}</span>
          <span className="text-xs font-semibold opacity-80">{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ icon: Icon, value, label, sub, color, bgColor }: {
  icon: any; value: string; label: string; sub?: string; color: string; bgColor: string;
}) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm min-w-[160px] snap-start transition-all duration-150 md:hover:shadow-md md:hover:-translate-y-[1px]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${bgColor} shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums truncate">{value || "—"}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Stok Rendah Card ──────────────────────────────────────────────
function StokRendahCard({ products, isLoading }: { products: any[] | undefined; isLoading: boolean }) {
  const navigate = useNavigate();
  const stokKritisList = products
    ?.filter(p => p.stock && p.stock.jumlah <= 15)
    .sort((a: any, b: any) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 5) ?? [];

  const maxStock = 15; // threshold for bar

  return (
    <Card className="rounded-2xl shadow-md border-0 transition-all duration-150 hover:shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Stok Rendah
          </CardTitle>
          {stokKritisList.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full">
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
          <div className="space-y-3">
            {stokKritisList.map((p: any) => {
              const jumlah = p.stock?.jumlah ?? 0;
              const status = getStockStatus(jumlah);
              const pct = Math.max((jumlah / maxStock) * 100, 5);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-1.5 p-2.5 rounded-xl transition-all duration-150 ${
                    status === "kritis" ? "border-l-[3px] border-l-destructive bg-destructive/5" : "border-l-[3px] border-l-warning bg-warning/5"
                  }`}
                >
                    <div className="flex items-center justify-between gap-2">
                     <div className="min-w-0 flex items-center gap-1.5">
                       <span className="font-mono font-bold text-sm shrink-0">{p.kode}</span>
                       <span className="text-muted-foreground text-xs truncate">{p.nama}</span>
                     </div>
                    <span className={`font-extrabold text-base ${status === "kritis" ? "text-destructive" : "text-warning"}`}>
                      {jumlah}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={`h-1.5 ${status === "kritis" ? "[&>div]:bg-destructive" : "[&>div]:bg-warning"}`}
                  />
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs mt-2 rounded-xl font-semibold hover:bg-primary/5 hover:text-primary transition-all duration-150"
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

// ── Quick Actions ─────────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", color: "text-success", bg: "bg-success/10" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", color: "text-destructive", bg: "bg-destructive/10" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", color: "text-warning", bg: "bg-warning/10" },
    { icon: Package, label: "Cek Stok", path: "/stok", color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <Card className="rounded-2xl shadow-md border-0 transition-all duration-150 hover:shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold">Aksi Cepat</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map(action => (
            <Button
              key={action.path}
              variant="outline"
              className="h-auto flex-col gap-2.5 py-5 rounded-xl border-border/60 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
              onClick={() => navigate(action.path)}
            >
              <div className={`p-2.5 rounded-xl ${action.bg}`}>
                <action.icon className={`h-6 w-6 ${action.color}`} strokeWidth={2.5} />
              </div>
              <span className="text-sm font-semibold">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────
const Dashboard = () => {
  const { data: products, isLoading } = useProducts();

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;
  const warning = products?.filter(p => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length ?? 0;
  const kritis = products?.filter(p => getStockStatus(p.stock?.jumlah ?? 0) === "kritis").length ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todaySales } = useQuery({
    queryKey: ["dashboard_today_sales"],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=qty_kirim,total_harga,created_at&created_at=gte.${todayStart.toISOString()}&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ qty_kirim: number; total_harga: number; created_at: string }[]>;
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

  const chartData = (() => {
    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      days.push({ label, date: dateStr, omzet: 0, pcs: 0 });
    }
    weekSales?.forEach(sale => {
      const saleDate = sale.created_at.slice(0, 10);
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
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Command center RRCollections</p>
      </div>

      {/* 1. Command Center Chips */}
      <CommandCenter products={products} isLoading={isLoading} />

      {/* 2. KPI Cards — horizontal scroll mobile, grid desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} value={formatRupiah(omzetHariIni)} label="Omzet Hari Ini" color="text-primary" bgColor="bg-primary/10" />
        <KpiCard icon={ShoppingCart} value={formatNumber(pcsHariIni)} label="Pcs Terjual" sub="hari ini" color="text-success" bgColor="bg-success/10" />
        <KpiCard icon={AlertTriangle} value={isLoading ? "..." : String(warning)} label="Stok Warning" color="text-warning" bgColor="bg-warning/10" />
        <KpiCard icon={AlertTriangle} value={isLoading ? "..." : String(kritis)} label="Stok Kritis" color="text-destructive" bgColor="bg-destructive/10" />
      </div>

      {/* 3. Chart + Stok Rendah */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 rounded-2xl shadow-md border-0 transition-all duration-150 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              Penjualan 7 Hari Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            <div className="h-56 md:h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "omzet" ? formatRupiah(value) : formatNumber(value),
                      name === "omzet" ? "Omzet" : "Pcs",
                    ]}
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <StokRendahCard products={products} isLoading={isLoading} />
      </div>

      {/* 4. AI Insights */}
      <AiInsightsCard />

      {/* 5. Info Ringkasan */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Package} value={isLoading ? "..." : formatNumber(totalItems)} label="Total Item" sub="produk aktif" color="text-primary" bgColor="bg-primary/10" />
        <KpiCard icon={TrendingUp} value={isLoading ? "..." : formatNumber(totalStok)} label="Total Stok" sub="semua gudang" color="text-success" bgColor="bg-success/10" />
      </div>

      {/* 6. Quick Actions */}
      <QuickActions />
    </div>
  );
};

export default Dashboard;
