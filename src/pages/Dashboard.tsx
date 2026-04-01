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
    { label: "Kosong", count: kosong, icon: PackageX, lightBg: "bg-destructive/8", lightText: "text-destructive", emoji: "🚨" },
    { label: "Kritis", count: kritis, icon: AlertCircle, lightBg: "bg-orange-500/8", lightText: "text-orange-600", emoji: "⚠️" },
    { label: "Warning", count: warning, icon: AlertTriangle, lightBg: "bg-warning/8", lightText: "text-amber-600", emoji: "📦" },
    { label: "Aman", count: aman, icon: Package, lightBg: "bg-success/8", lightText: "text-success", emoji: "✅" },
  ];

  return (
    <div className="space-y-2">
      {/* Total Item & Stok summary */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground font-medium">{formatNumber(total)} item</span>
        </div>
        <span className="text-border">·</span>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-success" />
          <span className="text-xs text-muted-foreground font-medium">{formatNumber(totalStok)} stok</span>
        </div>
      </div>
      {/* Status grid */}
      <div className="grid grid-cols-4 gap-2">
        {cards.map((card, idx) => (
          <button
            key={card.label}
            onClick={() => navigate("/stok")}
            className={`card-premium ${card.lightBg} p-3 flex flex-col items-center gap-1 transition-all duration-200 native-press animate-fade-in`}
            style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
          >
            <span className="text-lg leading-none">{card.emoji}</span>
            <span className={`text-2xl font-black tabular-nums leading-none ${card.lightText}`}>{card.count}</span>
            <span className="text-[10px] font-semibold text-muted-foreground leading-tight">{card.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hero KPI Section ──────────────────────────────────────────────
function HeroKpi({ omzet, profit, pcs, margin }: { omzet: number; profit: number; pcs: number; margin: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Omzet */}
      <div className="col-span-2 relative overflow-hidden rounded-2xl p-4 text-primary-foreground shadow-premium-lg" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(217 91% 40%))" }}>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 animate-glow-pulse" />
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
      <div className="card-premium p-4 flex flex-col justify-between">
        <div className="flex items-center gap-1.5 mb-1">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">{formatNumber(pcs)}</p>
          <span className="text-[10px] text-muted-foreground font-medium">pcs terjual</span>
        </div>
      </div>

      {/* Profit */}
      <div className="col-span-3 card-premium p-3.5">
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
    <Card className="card-premium">
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

// InventorySummary removed — integrated into CommandCenter

// ── Main Dashboard ────────────────────────────────────────────────
const Dashboard = () => {
  const { data: products, isLoading } = useProducts();

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;

  // WIB (UTC+7) midnight for today
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowUtc = new Date();
  const nowWib = new Date(nowUtc.getTime() + WIB_OFFSET_MS);
  const todayWibStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-${String(nowWib.getUTCDate()).padStart(2, "0")}`;
  const todayStartUtc = new Date(todayWibStr + "T00:00:00+07:00");

  const { data: todaySales } = useQuery({
    queryKey: ["dashboard_today_sales"],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=product_id,qty_kirim,total_harga,created_at&created_at=gte.${todayStartUtc.toISOString()}&order=created_at.desc`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ product_id: string; qty_kirim: number; total_harga: number; created_at: string }[]>;
    },
    refetchInterval: 30000,
  });

  const sevenDaysAgoUtc = new Date(todayStartUtc.getTime() - 6 * 86400000);

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

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full pb-24 md:pb-6">
      {/* Header — greeting based on time */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <p className="text-sm text-muted-foreground font-medium">
            {getGreeting()}, Boss {getGreetingEmoji()}
          </p>
          <h1 className="text-xl font-extrabold tracking-tight">Dashboard</h1>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground glass px-3 py-1.5 rounded-full border border-border/20">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse shadow-glow" />
          Live
        </div>
      </div>

      {/* 1. Command Center Chips */}
      <div className="animate-fade-in" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
        <CommandCenter products={products} isLoading={isLoading} />
      </div>

      {/* 2. Critical Stock Alert — DOS ≤ 2 hari */}
      <div className="animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
        <CriticalStockAlert />
      </div>

      {/* 3. Hero KPI — Omzet, Profit, Pcs */}
      <div className="animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
        <HeroKpi omzet={omzetHariIni} profit={profitHariIni} pcs={pcsHariIni} margin={marginPct} />
      </div>

      {/* 4. Chart + Stok Rendah */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        <Card className="md:col-span-2 card-premium">
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
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid hsl(213 25% 90%)", boxShadow: "0 8px 32px rgba(0,0,0,0.08)", background: "hsl(210 40% 99%)", color: "hsl(222 47% 11%)" }}
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
