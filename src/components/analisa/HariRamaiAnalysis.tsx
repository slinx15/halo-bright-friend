import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import type { StockOutRecord } from "@/lib/stockAnalyticsEngine";
import { useIsMobile } from "@/hooks/use-mobile";

const HARI_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface DayData {
  dayIndex: number;
  nama: string;
  short: string;
  totalPcs: number;
  totalTrx: number;
  avgPcs: number;
  weeks: number;
}

interface HourData {
  hour: number;
  label: string;
  totalPcs: number;
  totalTrx: number;
}

function calcHariRamai(sales: StockOutRecord[]): { days: DayData[]; hours: HourData[]; busiestDay: DayData | null; busiestHour: HourData | null } {
  const dayMap: Record<number, { pcs: number; trx: number; dates: Set<string> }> = {};
  const hourMap: Record<number, { pcs: number; trx: number }> = {};

  for (let i = 0; i < 7; i++) dayMap[i] = { pcs: 0, trx: 0, dates: new Set() };
  for (let i = 0; i < 24; i++) hourMap[i] = { pcs: 0, trx: 0 };

  const WIB_OFFSET_MS = 7 * 3600000;

  for (const s of sales) {
    const utcMs = new Date(s.created_at).getTime();
    const wib = new Date(utcMs + WIB_OFFSET_MS);
    const dayOfWeek = wib.getUTCDay();
    const hour = wib.getUTCHours();
    const dateStr = wib.toISOString().slice(0, 10);

    dayMap[dayOfWeek].pcs += s.qty_kirim;
    dayMap[dayOfWeek].trx += 1;
    dayMap[dayOfWeek].dates.add(dateStr);

    hourMap[hour].pcs += s.qty_kirim;
    hourMap[hour].trx += 1;
  }

  // Count distinct weeks per day
  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const dm = dayMap[i];
    const weeks = dm.dates.size || 1;
    days.push({
      dayIndex: i,
      nama: HARI_NAMES[i],
      short: HARI_SHORT[i],
      totalPcs: dm.pcs,
      totalTrx: dm.trx,
      avgPcs: Math.round(dm.pcs / weeks),
      weeks,
    });
  }

  // Reorder: Senin first
  const reordered = [...days.slice(1), days[0]];

  const hours: HourData[] = [];
  for (let i = 6; i <= 21; i++) {
    hours.push({
      hour: i,
      label: `${String(i).padStart(2, "0")}:00`,
      totalPcs: hourMap[i].pcs,
      totalTrx: hourMap[i].trx,
    });
  }

  const busiestDay = [...reordered].sort((a, b) => b.avgPcs - a.avgPcs)[0] || null;
  const busiestHour = [...hours].sort((a, b) => b.totalPcs - a.totalPcs)[0] || null;

  return { days: reordered, hours, busiestDay, busiestHour };
}

export default function HariRamaiAnalysis({ stockOutData }: { stockOutData: StockOutRecord[] }) {
  const isMobile = useIsMobile();
  const { days, hours, busiestDay, busiestHour } = useMemo(() => calcHariRamai(stockOutData), [stockOutData]);

  const maxAvgPcs = Math.max(...days.map(d => d.avgPcs), 1);
  const maxHourPcs = Math.max(...hours.map(h => h.totalPcs), 1);

  if (stockOutData.length === 0) {
    return (
      <Card className="border-0 shadow-sm p-8 text-center">
        <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm font-medium">Belum ada data penjualan</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card-premium bg-primary/5 p-4 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <span className="text-lg">📅</span>
          <p className="text-[10px] text-muted-foreground mt-1">Hari Paling Ramai</p>
          <p className="text-xl font-black text-primary">{busiestDay?.nama ?? "-"}</p>
          <p className="text-xs text-muted-foreground">rata-rata {busiestDay?.avgPcs ?? 0} pcs/hari</p>
        </div>
        <div className="card-premium bg-warning/5 p-4 animate-fade-in" style={{ animationDelay: "60ms", animationFillMode: "both" }}>
          <span className="text-lg">⏰</span>
          <p className="text-[10px] text-muted-foreground mt-1">Jam Paling Ramai</p>
          <p className="text-xl font-black text-warning">{busiestHour?.label ?? "-"}</p>
          <p className="text-xs text-muted-foreground">{busiestHour?.totalPcs ?? 0} pcs total</p>
        </div>
      </div>

      {/* Day Chart */}
      <Card className="card-premium animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Penjualan per Hari</h3>
              <p className="text-[10px] text-muted-foreground">Rata-rata pcs terjual per hari dalam seminggu</p>
            </div>
          </div>

          <div className={isMobile ? "h-48" : "h-56"}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis dataKey="short" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} pcs`, "Rata-rata"]}
                  labelFormatter={(label) => HARI_NAMES[HARI_SHORT.indexOf(label as string)] || label}
                  contentStyle={{
                    borderRadius: 12, fontSize: 11,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                  }}
                />
                <Bar dataKey="avgPcs" radius={[6, 6, 0, 0]}>
                  {days.map((d) => (
                    <Cell
                      key={d.dayIndex}
                      fill={d.avgPcs === maxAvgPcs ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.4)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Day detail cards */}
          <div className="grid grid-cols-7 gap-1 mt-3">
            {days.map((d, i) => {
              const pct = maxAvgPcs > 0 ? (d.avgPcs / maxAvgPcs) * 100 : 0;
              const isTop = d.avgPcs === maxAvgPcs;
              return (
                <div
                  key={d.dayIndex}
                  className={`rounded-lg p-2 text-center text-[10px] transition-all ${
                    isTop ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30"
                  }`}
                >
                  <p className="font-bold text-[11px]">{d.short}</p>
                  <p className={`font-black text-sm tabular-nums ${isTop ? "text-primary" : ""}`}>{d.avgPcs}</p>
                  <p className="text-muted-foreground">pcs</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hour Chart */}
      <Card className="card-premium animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-warning/10">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Penjualan per Jam</h3>
              <p className="text-[10px] text-muted-foreground">Total pcs terjual per jam (06:00 - 21:00)</p>
            </div>
          </div>

          <div className={isMobile ? "h-48" : "h-56"}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} className="fill-muted-foreground" axisLine={false} tickLine={false} interval={isMobile ? 2 : 1} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number) => [`${value} pcs`, "Total"]}
                  contentStyle={{
                    borderRadius: 12, fontSize: 11,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                  }}
                />
                <Bar dataKey="totalPcs" radius={[4, 4, 0, 0]}>
                  {hours.map((h) => (
                    <Cell
                      key={h.hour}
                      fill={h.totalPcs === maxHourPcs ? "hsl(var(--warning))" : "hsl(var(--warning) / 0.3)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Insight */}
      <Card className="card-premium p-4 animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
        <CardContent className="p-0 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">💡 Insight</p>
          <div className="text-xs text-muted-foreground space-y-1">
            {busiestDay && (
              <p>• Hari <strong className="text-foreground">{busiestDay.nama}</strong> paling ramai dengan rata-rata <strong className="text-foreground">{busiestDay.avgPcs} pcs</strong> — siapkan stok sebelumnya!</p>
            )}
            {busiestHour && (
              <p>• Jam sibuk di <strong className="text-foreground">{busiestHour.label}</strong> — usahakan proses pengiriman di jam ini.</p>
            )}
            {(() => {
              const sorted = [...days].sort((a, b) => a.avgPcs - b.avgPcs);
              const quietest = sorted[0];
              if (quietest && quietest.avgPcs < maxAvgPcs * 0.5) {
                return <p>• Hari <strong className="text-foreground">{quietest.nama}</strong> paling sepi — cocok untuk restock atau admin.</p>;
              }
              return null;
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
