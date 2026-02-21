import { Package, PackagePlus, PackageMinus, ClipboardCheck, AlertTriangle, TrendingUp, DollarSign, ShoppingCart, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { useQuery } from "@tanstack/react-query";
import { formatNumber, formatRupiah, getStockStatus } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;
  const warning = products?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length ?? 0;
  const kritis = products?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "kritis").length ?? 0;

  // Today's date range
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Fetch today's sales
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

  // Fetch last 7 days sales for chart
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

  // Today stats
  const omzetHariIni = todaySales?.reduce((s, r) => s + r.total_harga, 0) ?? 0;
  const pcsHariIni = todaySales?.reduce((s, r) => s + r.qty_kirim, 0) ?? 0;
  const txHariIni = todaySales?.length ?? 0;

  // Build chart data for 7 days
  const chartData = (() => {
    const days: { label: string; date: string; omzet: number; pcs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      days.push({ label, date: dateStr, omzet: 0, pcs: 0 });
    }
    weekSales?.forEach((sale) => {
      const saleDate = sale.created_at.slice(0, 10);
      const day = days.find((d) => d.date === saleDate);
      if (day) {
        day.omzet += sale.total_harga;
        day.pcs += sale.qty_kirim;
      }
    });
    return days;
  })();

  // Top 5 stok kritis
  const stokKritisList = products
    ?.filter((p) => p.stock && p.stock.jumlah <= 15)
    .sort((a, b) => (a.stock?.jumlah ?? 0) - (b.stock?.jumlah ?? 0))
    .slice(0, 5) ?? [];

  const quickActions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", color: "text-success" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", color: "text-destructive" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", color: "text-warning" },
    { icon: Package, label: "Cek Stok", path: "/stok", color: "text-primary" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Ringkasan stok & penjualan RRCollections</p>
      </div>

      {/* Sales stats today */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm md:text-2xl font-bold truncate">{formatRupiah(omzetHariIni)}</p>
                <p className="text-xs text-muted-foreground">Omzet Hari Ini</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <ShoppingCart className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatNumber(pcsHariIni)}</p>
                <p className="text-xs text-muted-foreground">Pcs Terjual</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : warning}</p>
                <p className="text-xs text-muted-foreground">Stok Warning</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : kritis}</p>
                <p className="text-xs text-muted-foreground">Stok Kritis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grafik + Stok Kritis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Penjualan 7 Hari Terakhir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "omzet" ? formatRupiah(value) : formatNumber(value),
                      name === "omzet" ? "Omzet" : "Pcs",
                    ]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stok Kritis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Stok Rendah
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stokKritisList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Semua stok aman 👍</p>
            ) : (
              <div className="space-y-2">
                {stokKritisList.map((p) => {
                  const status = getStockStatus(p.stock?.jumlah ?? 0);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-mono font-medium">{p.kode}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{p.nama}</span>
                      </div>
                      <span className={`font-bold ${status === "kritis" ? "text-destructive" : "text-warning"}`}>
                        {p.stock?.jumlah ?? 0}
                      </span>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => navigate("/stok")}>
                  Lihat semua →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info ringkasan */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : formatNumber(totalItems)}</p>
                <p className="text-xs text-muted-foreground">Total Item</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : formatNumber(totalStok)}</p>
                <p className="text-xs text-muted-foreground">Total Stok</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => navigate(action.path)}
              >
                <action.icon className={`h-6 w-6 ${action.color}`} />
                <span className="text-sm">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
