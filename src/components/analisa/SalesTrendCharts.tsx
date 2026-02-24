import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Activity, TrendingUp, Trophy } from "lucide-react";
import type { StockOutRecord } from "@/lib/stockAnalyticsEngine";
import type { TopSellerItem, TrendItem } from "@/lib/analysisFeatures";

interface SalesTrendChartsProps {
  stockOutData: StockOutRecord[];
  topSellers: TopSellerItem[];
  trendItems: TrendItem[];
  isMobile: boolean;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// Custom tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SalesTrendCharts({ stockOutData, topSellers, trendItems, isMobile }: SalesTrendChartsProps) {
  // 1. Daily sales over last 30 days
  const dailySalesData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days: { date: string; label: string; qty: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      days.push({ date: key, label, qty: 0 });
    }

    const dayMap = new Map(days.map(d => [d.date, d]));
    for (const s of stockOutData) {
      const localDate = new Date(s.created_at);
      const key = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      const day = dayMap.get(key);
      if (day) day.qty += s.qty_pesan;
    }

    return days;
  }, [stockOutData]);

  // 2. Top 10 sellers bar data
  const topSellerBarData = useMemo(() => {
    return topSellers.slice(0, 10).map(t => ({
      kode: t.kode,
      terjual: t.totalQty,
      isBestSeller: t.isBestSeller,
    }));
  }, [topSellers]);

  // 3. Weekly comparison bar data (top trending)
  const weeklyCompareData = useMemo(() => {
    return trendItems
      .filter(t => t.thisWeek > 0 || t.lastWeek > 0)
      .slice(0, 10)
      .map(t => ({
        kode: t.kode,
        "Minggu Ini": t.thisWeek,
        "Minggu Lalu": t.lastWeek,
      }));
  }, [trendItems]);

  const chartHeight = isMobile ? 220 : 280;

  return (
    <div className="space-y-5">
      {/* Daily Sales Area Chart */}
      <Card className="border-0 shadow-sm p-5 space-y-3">
        <SectionHeader icon={Activity} title="Penjualan Harian" subtitle="30 hari terakhir" />
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer>
            <AreaChart data={dailySalesData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={isMobile ? 4 : 2}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="qty"
                name="Terjual"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Top Sellers Bar Chart */}
      <Card className="border-0 shadow-sm p-5 space-y-3">
        <SectionHeader icon={Trophy} title="Top 10 Barang Terlaris" subtitle="Jumlah terjual 30 hari" />
        <div style={{ width: "100%", height: chartHeight + 20 }}>
          <ResponsiveContainer>
            <BarChart
              data={topSellerBarData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: isMobile ? 40 : 60, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="kode"
                tick={{ fontSize: isMobile ? 9 : 11, fill: "hsl(var(--foreground))", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={isMobile ? 50 : 70}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="terjual"
                name="Terjual"
                fill="hsl(var(--primary))"
                radius={[0, 6, 6, 0]}
                barSize={isMobile ? 16 : 20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Weekly Comparison */}
      {weeklyCompareData.length > 0 && (
        <Card className="border-0 shadow-sm p-5 space-y-3">
          <SectionHeader icon={TrendingUp} title="Perbandingan Mingguan" subtitle="Top 10 produk" />
          <div style={{ width: "100%", height: chartHeight + 20 }}>
            <ResponsiveContainer>
              <BarChart
                data={weeklyCompareData}
                margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="kode"
                  tick={{ fontSize: isMobile ? 8 : 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 50 : 30}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey="Minggu Lalu" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 18} />
                <Bar dataKey="Minggu Ini" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
