import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Palette } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import type { ProductWithDetails } from "@/hooks/useProducts";
import type { StockOutRecord } from "@/lib/stockAnalyticsEngine";
import { useIsMobile } from "@/hooks/use-mobile";

interface ColorTrendItem {
  kode: string;
  productId: string;
  nama: string;
  thisWeek: number;
  lastWeek: number;
  twoWeeksAgo: number;
  changePct: number;
  trend: "rising" | "falling" | "stable" | "new";
  streak: number; // consecutive weeks of growth/decline
  totalMonth: number;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${weekNum}`;
}

function calcColorTrends(
  products: ProductWithDetails[],
  sales: StockOutRecord[]
): ColorTrendItem[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(now.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(now.getTime() - 14 * 86400000);
  const twoWeeksStart = new Date(now.getTime() - 21 * 86400000);
  const monthStart = new Date(now.getTime() - 30 * 86400000);

  const productMap = new Map(products.map(p => [p.id, p]));

  // Aggregate sales per product per period
  const data: Record<string, { tw: number; lw: number; tw2: number; month: number }> = {};

  for (const s of sales) {
    const d = new Date(s.created_at);
    if (d < monthStart) continue;
    const pid = s.product_id;
    if (!data[pid]) data[pid] = { tw: 0, lw: 0, tw2: 0, month: 0 };

    data[pid].month += s.qty_kirim;
    if (d >= thisWeekStart) {
      data[pid].tw += s.qty_kirim;
    } else if (d >= lastWeekStart) {
      data[pid].lw += s.qty_kirim;
    } else if (d >= twoWeeksStart) {
      data[pid].tw2 += s.qty_kirim;
    }
  }

  const items: ColorTrendItem[] = [];

  for (const [pid, d] of Object.entries(data)) {
    const product = productMap.get(pid);
    if (!product) continue;

    const changePct = d.lw > 0 ? ((d.tw - d.lw) / d.lw) * 100 : d.tw > 0 ? 100 : 0;

    // Determine trend
    let trend: ColorTrendItem["trend"] = "stable";
    let streak = 0;

    if (d.tw > d.lw && d.lw > d.tw2) {
      trend = "rising";
      streak = 2;
    } else if (d.tw > d.lw) {
      trend = "rising";
      streak = 1;
    } else if (d.tw < d.lw && d.lw < d.tw2) {
      trend = "falling";
      streak = 2;
    } else if (d.tw < d.lw) {
      trend = "falling";
      streak = 1;
    } else if (d.lw === 0 && d.tw2 === 0 && d.tw > 0) {
      trend = "new";
      streak = 1;
    }

    items.push({
      kode: product.kode,
      productId: pid,
      nama: product.nama || product.kode,
      thisWeek: d.tw,
      lastWeek: d.lw,
      twoWeeksAgo: d.tw2,
      changePct,
      trend,
      streak,
      totalMonth: d.month,
    });
  }

  // Sort: rising first (by change%), then stable, then falling
  items.sort((a, b) => {
    const trendOrder = { rising: 0, new: 1, stable: 2, falling: 3 };
    if (trendOrder[a.trend] !== trendOrder[b.trend]) return trendOrder[a.trend] - trendOrder[b.trend];
    return b.changePct - a.changePct;
  });

  return items;
}

const TREND_CONFIG = {
  rising: { icon: TrendingUp, label: "Naik", emoji: "🔥", color: "text-success", bg: "bg-success/10", border: "border-l-success" },
  new: { icon: TrendingUp, label: "Baru", emoji: "✨", color: "text-primary", bg: "bg-primary/10", border: "border-l-primary" },
  stable: { icon: Minus, label: "Stabil", emoji: "➡️", color: "text-muted-foreground", bg: "bg-muted/40", border: "border-l-muted-foreground" },
  falling: { icon: TrendingDown, label: "Turun", emoji: "📉", color: "text-destructive", bg: "bg-destructive/10", border: "border-l-destructive" },
};

export default function ColorTrendAnalysis({
  products,
  stockOutData,
}: {
  products: ProductWithDetails[];
  stockOutData: StockOutRecord[];
}) {
  const isMobile = useIsMobile();
  const trends = useMemo(() => calcColorTrends(products, stockOutData), [products, stockOutData]);

  const rising = trends.filter(t => t.trend === "rising");
  const falling = trends.filter(t => t.trend === "falling");
  const newItems = trends.filter(t => t.trend === "new");
  const stable = trends.filter(t => t.trend === "stable");

  // Top 10 chart data (by this week sales)
  const chartData = useMemo(() =>
    [...trends]
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 10)
      .map(t => ({
        kode: t.kode,
        "Minggu Ini": t.thisWeek,
        "Minggu Lalu": t.lastWeek,
      })),
    [trends]
  );

  if (trends.length === 0) {
    return (
      <Card className="border-0 shadow-sm p-8 text-center">
        <Palette className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm font-medium">Belum ada data penjualan</p>
        <p className="text-xs text-muted-foreground mt-1">Data tren warna akan muncul setelah ada transaksi</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Naik", count: rising.length, emoji: "🔥", color: "text-success", bg: "bg-success/5" },
          { label: "Turun", count: falling.length, emoji: "📉", color: "text-destructive", bg: "bg-destructive/5" },
          { label: "Baru Muncul", count: newItems.length, emoji: "✨", color: "text-primary", bg: "bg-primary/5" },
          { label: "Stabil", count: stable.length, emoji: "➡️", color: "text-muted-foreground", bg: "bg-muted/30" },
        ].map((s, i) => (
          <div
            key={s.label}
            className={`card-premium ${s.bg} p-3.5 text-center animate-fade-in`}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
          >
            <span className="text-lg">{s.emoji}</span>
            <p className={`text-2xl font-black tabular-nums mt-1 ${s.color}`}>{s.count}</p>
            <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart: Top 10 comparison */}
      {chartData.length > 0 && (
        <Card className="card-premium animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Palette className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Top 10 Warna Terlaris</h3>
                <p className="text-[10px] text-muted-foreground">Perbandingan minggu ini vs minggu lalu</p>
              </div>
            </div>
            <div className={isMobile ? "h-56" : "h-64"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="kode" tick={{ fontSize: 9 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12, fontSize: 11,
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="Minggu Lalu" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Minggu Ini" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30" /> Minggu Lalu</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Minggu Ini</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rising Colors */}
      {rising.length > 0 && (
        <TrendSection title="🔥 Warna Naik Daun" subtitle="Permintaan meningkat" items={rising} isMobile={isMobile} />
      )}

      {/* New Colors */}
      {newItems.length > 0 && (
        <TrendSection title="✨ Warna Baru Muncul" subtitle="Mulai ada permintaan baru" items={newItems} isMobile={isMobile} />
      )}

      {/* Falling Colors */}
      {falling.length > 0 && (
        <TrendSection title="📉 Warna Menurun" subtitle="Permintaan mulai turun" items={falling} isMobile={isMobile} />
      )}

      {/* Insight */}
      <Card className="card-premium p-4 animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
        <CardContent className="p-0 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">💡 Insight</p>
          <div className="text-xs text-muted-foreground space-y-1">
            {rising.length > 0 && (
              <p>• Warna <strong className="text-foreground">{rising.slice(0, 3).map(r => r.kode).join(", ")}</strong> sedang naik daun — pastikan stok cukup!</p>
            )}
            {falling.length > 0 && (
              <p>• Warna <strong className="text-foreground">{falling.slice(0, 3).map(f => f.kode).join(", ")}</strong> mulai turun — kurangi restock atau promo.</p>
            )}
            {newItems.length > 0 && (
              <p>• Ada <strong className="text-foreground">{newItems.length}</strong> warna baru yang mulai diminati — pantau terus!</p>
            )}
            <p>• Data berdasarkan penjualan 30 hari terakhir, dibandingkan per minggu.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrendSection({
  title,
  subtitle,
  items,
  isMobile,
}: {
  title: string;
  subtitle: string;
  items: ColorTrendItem[];
  isMobile: boolean;
}) {
  return (
    <Card className="card-premium overflow-hidden animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
      <div className="px-4 py-3 bg-muted/20 border-b">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="p-3 space-y-2">
        {items.slice(0, 15).map((item, idx) => {
          const cfg = TREND_CONFIG[item.trend];
          const Icon = cfg.icon;
          return (
            <div
              key={item.productId}
              className={`rounded-xl border border-l-[3px] ${cfg.border} p-3 transition-all active:scale-[0.99] animate-fade-in`}
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-sm">{item.kode}</span>
                  {item.nama !== item.kode && (
                    <span className="text-[10px] text-muted-foreground truncate">{item.nama}</span>
                  )}
                  {item.streak >= 2 && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-success/30 text-success">
                      {item.streak}x naik
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  <span className={`font-mono font-bold text-sm tabular-nums ${cfg.color}`}>
                    {item.changePct > 0 ? "+" : ""}{Math.round(item.changePct)}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Minggu Ini</p>
                  <p className="font-mono font-bold text-sm tabular-nums">{item.thisWeek}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Minggu Lalu</p>
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">{item.lastWeek}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">30 Hari</p>
                  <p className="font-mono text-sm tabular-nums">{item.totalMonth}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
