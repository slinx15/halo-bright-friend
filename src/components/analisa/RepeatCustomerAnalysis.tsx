import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, Trophy, TrendingUp, TrendingDown, Clock, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { StockOutRecord } from "@/lib/stockAnalyticsEngine";
import type { ProductWithDetails } from "@/hooks/useProducts";
import { useIsMobile } from "@/hooks/use-mobile";

interface CustomerData {
  nama: string;
  totalQty: number;
  totalTrx: number;
  totalNilai: number;
  firstOrder: Date;
  lastOrder: Date;
  orderDates: Date[];
  avgCycleDays: number;
  predictedNextOrder: Date | null;
  daysOverdue: number; // days past predicted order (negative = not yet due)
  status: "vip" | "regular" | "at_risk" | "lost" | "new";
  favoriteProducts: string[];
}

const WIB_OFFSET = 7 * 3600000;

function calcRepeatCustomers(
  sales: StockOutRecord[],
  products: ProductWithDetails[]
): CustomerData[] {
  const nowWib = new Date(Date.now() + WIB_OFFSET);
  const now = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate()));

  const productMap = new Map(products.map(p => [p.id, p]));

  // Group sales by toko
  const tokoMap: Record<string, {
    trx: number;
    qty: number;
    nilai: number;
    dates: Date[];
    produkMap: Record<string, number>;
  }> = {};

  for (const s of sales) {
    const toko = (s.toko ?? "").trim().toUpperCase();
    if (!toko) continue;

    if (!tokoMap[toko]) {
      tokoMap[toko] = { trx: 0, qty: 0, nilai: 0, dates: [], produkMap: {} };
    }

    const t = tokoMap[toko];
    t.trx += 1;
    t.qty += s.qty_kirim;

    const product = productMap.get(s.product_id);
    const harga = product?.prices?.harga_normal ?? 0;
    t.nilai += s.qty_kirim * harga;

    t.dates.push(new Date(new Date(s.created_at).getTime() + WIB_OFFSET));

    const kode = product?.kode ?? s.product_id;
    t.produkMap[kode] = (t.produkMap[kode] ?? 0) + s.qty_kirim;
  }

  const items: CustomerData[] = [];

  for (const [nama, data] of Object.entries(tokoMap)) {
    // Sort dates
    const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());
    const firstOrder = sortedDates[0];
    const lastOrder = sortedDates[sortedDates.length - 1];

    // Calculate unique order days
    const uniqueDays = [...new Set(sortedDates.map(d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    ))].sort();

    // Calculate average cycle between order days
    let avgCycleDays = 0;
    let predictedNextOrder: Date | null = null;

    if (uniqueDays.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < uniqueDays.length; i++) {
        const prev = new Date(uniqueDays[i - 1]);
        const curr = new Date(uniqueDays[i]);
        const gap = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        if (gap > 0) gaps.push(gap);
      }
      if (gaps.length > 0) {
        avgCycleDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
        predictedNextOrder = new Date(lastOrder.getTime() + avgCycleDays * 86400000);
      }
    }

    const daysSinceLastOrder = Math.floor((now.getTime() - lastOrder.getTime()) / 86400000);
    const daysOverdue = predictedNextOrder
      ? Math.floor((now.getTime() - predictedNextOrder.getTime()) / 86400000)
      : 0;

    // Determine status
    let status: CustomerData["status"] = "regular";
    if (uniqueDays.length <= 1) {
      status = "new";
    } else if (avgCycleDays > 0 && daysOverdue > avgCycleDays * 2) {
      status = "lost"; // more than 2x their cycle overdue
    } else if (avgCycleDays > 0 && daysOverdue > avgCycleDays * 0.5) {
      status = "at_risk"; // past their cycle by 50%+
    } else if (uniqueDays.length >= 5 && avgCycleDays <= 10) {
      status = "vip"; // frequent buyer
    }

    // Favorite products
    const favs = Object.entries(data.produkMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([k]) => k);

    items.push({
      nama,
      totalQty: data.qty,
      totalTrx: data.trx,
      totalNilai: data.nilai,
      firstOrder,
      lastOrder,
      orderDates: sortedDates,
      avgCycleDays,
      predictedNextOrder,
      daysOverdue,
      status,
      favoriteProducts: favs,
    });
  }

  // Sort: at_risk first, then lost, then vip, then regular, then new
  const statusOrder = { at_risk: 0, lost: 1, vip: 2, regular: 3, new: 4 };
  items.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    return b.totalQty - a.totalQty;
  });

  return items;
}

const STATUS_CONFIG = {
  vip: { label: "VIP 🏆", emoji: "🏆", color: "text-primary", bg: "bg-primary/10", border: "border-l-primary", badgeCls: "bg-primary/15 text-primary border-primary/30" },
  regular: { label: "Reguler", emoji: "👤", color: "text-foreground", bg: "bg-muted/30", border: "border-l-muted-foreground", badgeCls: "bg-muted text-muted-foreground border-border" },
  at_risk: { label: "Mulai Hilang ⚠️", emoji: "⚠️", color: "text-warning", bg: "bg-warning/10", border: "border-l-warning", badgeCls: "bg-warning/15 text-warning border-warning/30" },
  lost: { label: "Hilang 🚨", emoji: "🚨", color: "text-destructive", bg: "bg-destructive/10", border: "border-l-destructive", badgeCls: "bg-destructive/15 text-destructive border-destructive/30" },
  new: { label: "Baru ✨", emoji: "✨", color: "text-success", bg: "bg-success/10", border: "border-l-success", badgeCls: "bg-success/15 text-success border-success/30" },
};

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function RepeatCustomerAnalysis({
  stockOutData,
  products,
}: {
  stockOutData: StockOutRecord[];
  products: ProductWithDetails[];
}) {
  const isMobile = useIsMobile();
  const customers = useMemo(() => calcRepeatCustomers(stockOutData, products), [stockOutData, products]);

  const vipCount = customers.filter(c => c.status === "vip").length;
  const atRiskCount = customers.filter(c => c.status === "at_risk").length;
  const lostCount = customers.filter(c => c.status === "lost").length;
  const newCount = customers.filter(c => c.status === "new").length;

  // Chart: top 10 by total qty
  const chartData = useMemo(() =>
    [...customers]
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10)
      .map(c => ({ nama: c.nama.length > 8 ? c.nama.slice(0, 8) + ".." : c.nama, pcs: c.totalQty })),
    [customers]
  );

  if (customers.length === 0) {
    return (
      <Card className="border-0 shadow-sm p-8 text-center">
        <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm font-medium">Belum ada data pelanggan</p>
        <p className="text-xs text-muted-foreground mt-1">Isi nama toko saat input barang keluar</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "VIP", count: vipCount, emoji: "🏆", color: "text-primary", bg: "bg-primary/5" },
          { label: "Mulai Hilang", count: atRiskCount, emoji: "⚠️", color: "text-warning", bg: "bg-warning/5" },
          { label: "Hilang", count: lostCount, emoji: "🚨", color: "text-destructive", bg: "bg-destructive/5" },
          { label: "Pelanggan Baru", count: newCount, emoji: "✨", color: "text-success", bg: "bg-success/5" },
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

      {/* Top customers chart */}
      {chartData.length > 0 && (
        <Card className="card-premium animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Trophy className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Top 10 Pelanggan</h3>
                <p className="text-[10px] text-muted-foreground">Berdasarkan total pcs pembelian</p>
              </div>
            </div>
            <div className={isMobile ? "h-48" : "h-56"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                  <YAxis type="category" dataKey="nama" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={60} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => [`${value} pcs`, "Total Beli"]}
                    contentStyle={{
                      borderRadius: 12, fontSize: 11,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))", color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="pcs" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Cards */}
      <div className="space-y-2">
        {customers.map((c, idx) => {
          const cfg = STATUS_CONFIG[c.status];
          const now = new Date();
          const daysSinceLast = Math.floor((now.getTime() - c.lastOrder.getTime()) / 86400000);

          return (
            <div
              key={c.nama}
              className={`card-premium border-l-[3px] ${cfg.border} p-4 space-y-3 transition-all active:scale-[0.99] animate-fade-in`}
              style={{ animationDelay: `${Math.min(idx * 40, 400)}ms`, animationFillMode: "both" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{cfg.emoji}</span>
                  <span className="font-bold text-sm truncate">{c.nama}</span>
                  <Badge variant="outline" className={`text-[9px] font-semibold shrink-0 ${cfg.badgeCls}`}>
                    {cfg.label}
                  </Badge>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total Beli</p>
                  <p className="font-mono font-bold text-sm tabular-nums">{c.totalQty}</p>
                  <p className="text-[9px] text-muted-foreground">pcs</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Transaksi</p>
                  <p className="font-mono font-bold text-sm tabular-nums">{c.totalTrx}</p>
                  <p className="text-[9px] text-muted-foreground">kali</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Siklus</p>
                  <p className="font-mono font-bold text-sm tabular-nums">{c.avgCycleDays > 0 ? c.avgCycleDays : "-"}</p>
                  <p className="text-[9px] text-muted-foreground">hari</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Terakhir</p>
                  <p className={`font-mono font-bold text-sm tabular-nums ${
                    daysSinceLast > 14 ? "text-destructive" : daysSinceLast > 7 ? "text-warning" : ""
                  }`}>{daysSinceLast}</p>
                  <p className="text-[9px] text-muted-foreground">hari lalu</p>
                </div>
              </div>

              {/* Prediction & Favorites */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {c.predictedNextOrder ? (
                    c.daysOverdue > 0 ? (
                      <span className="text-destructive font-semibold">
                        Terlambat {c.daysOverdue} hari dari prediksi
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Prediksi order: <strong className="text-foreground">{Math.abs(c.daysOverdue)} hari lagi</strong>
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">Belum cukup data prediksi</span>
                  )}
                </div>
              </div>

              {c.favoriteProducts.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Favorit:</span>
                  {c.favoriteProducts.map(fp => (
                    <Badge key={fp} variant="outline" className="text-[9px] px-1.5 py-0 font-mono">{fp}</Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Insight */}
      <Card className="card-premium p-4 animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
        <CardContent className="p-0 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">💡 Insight</p>
          <div className="text-xs text-muted-foreground space-y-1">
            {atRiskCount > 0 && (
              <p>• <strong className="text-warning">{atRiskCount} pelanggan mulai hilang</strong> — segera follow-up sebelum pindah ke kompetitor!</p>
            )}
            {lostCount > 0 && (
              <p>• <strong className="text-destructive">{lostCount} pelanggan sudah hilang</strong> — pertimbangkan promo khusus untuk menarik kembali.</p>
            )}
            {vipCount > 0 && (
              <p>• <strong className="text-primary">{vipCount} pelanggan VIP</strong> — jaga hubungan baik, kasih prioritas pengiriman!</p>
            )}
            {newCount > 0 && (
              <p>• <strong className="text-success">{newCount} pelanggan baru</strong> — pantau terus, bisa jadi VIP berikutnya.</p>
            )}
            <p>• Siklus order dihitung dari rata-rata jarak antar pembelian.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
