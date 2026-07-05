import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, TrendingDown, Minus, Package, Clock, Activity, ShoppingCart } from "lucide-react";
import type { ProductAnalysis, TrendInfo, StockOutRecord } from "@/lib/stockAnalyticsEngine";

interface ProductDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ProductAnalysis | null;
  trendInfo?: TrendInfo | null;
  lastSaleDate?: string | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; desc: string }> = {
  CRITICAL: { label: "🔴 Kritis", color: "text-destructive", desc: "Harus segera restock!" },
  WARNING: { label: "🟠 Segera Habis", color: "text-warning", desc: "Perlu perhatian, stok menipis" },
  ATTENTION: { label: "🟡 Perhatian", color: "text-accent-foreground", desc: "Stok masih cukup tapi perlu dipantau" },
  SAFE: { label: "🟢 Aman", color: "text-success", desc: "Stok masih cukup untuk beberapa hari" },
};

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDaysNatural(d: number): string {
  if (d >= 999) return "Sangat lama (stok banyak)";
  if (d < 1) return "Kurang dari 1 hari!";
  const rounded = Math.round(d);
  if (rounded <= 1) return "± 1 hari lagi";
  return `± ${rounded} hari lagi`;
}

function formatVelocityNatural(v: number): string {
  if (v === 0) return "Belum ada penjualan";
  if (v < 1) return `Rata-rata kurang dari 1 pcs/hari`;
  if (v < 5) return `Rata-rata ${v.toFixed(1)} pcs/hari`;
  return `Rata-rata ${v.toFixed(1)} pcs/hari (laris!)`;
}

function formatTrendNatural(change: number): { text: string; icon: React.ReactNode; color: string } {
  if (change > 0.1) {
    const pct = Math.round(change * 100);
    return { text: `Naik ${pct}% dari minggu lalu`, icon: <TrendingUp className="h-4 w-4" />, color: "text-success" };
  }
  if (change < -0.1) {
    const pct = Math.abs(Math.round(change * 100));
    return { text: `Turun ${pct}% dari minggu lalu`, icon: <TrendingDown className="h-4 w-4" />, color: "text-destructive" };
  }
  return { text: "Stabil, sama seperti minggu lalu", icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground" };
}

function formatLastSale(dateStr: string | null | undefined): string {
  if (!dateStr) return "Belum pernah terjual";
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays <= 7) return `${diffDays} hari yang lalu`;
  
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function ProductDetailDrawer({ open, onOpenChange, item, trendInfo, lastSaleDate }: ProductDetailDrawerProps) {
  if (!item) return null;

  const status = STATUS_INFO[item.dosStatus] || STATUS_INFO.SAFE;
  const trend = formatTrendNatural(trendInfo?.change ?? 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DrawerTitle className="text-lg font-extrabold">{item.kode}</DrawerTitle>
              {item.isBestSeller && <Flame className="h-4 w-4 text-warning" />}
              {item.isStockOut && <span className="text-sm">🚨</span>}
            </div>
            <Badge variant="outline" className={`text-xs font-semibold ${status.color}`}>
              {status.label}
            </Badge>
          </div>
          {item.nama && <p className="text-xs text-muted-foreground text-left">{item.nama}</p>}
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Status explanation */}
          <div className={`rounded-xl border p-3 ${
            item.dosStatus === "CRITICAL" ? "bg-destructive/5 border-destructive/20" :
            item.dosStatus === "WARNING" ? "bg-warning/5 border-warning/20" :
            "bg-muted/30 border-border/50"
          }`}>
            <p className="text-sm font-medium">{status.desc}</p>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stok saat ini */}
            <div className="rounded-xl bg-muted/40 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Stok Sekarang</span>
              </div>
              <p className={`text-2xl font-black tabular-nums ${item.currentStock === 0 ? "text-destructive" : ""}`}>
                {item.currentStock}
              </p>
              <p className="text-[11px] text-muted-foreground">pcs tersisa</p>
            </div>

            {/* Sisa hari */}
            <div className="rounded-xl bg-muted/40 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Bertahan</span>
              </div>
              <p className={`text-lg font-black ${
                item.daysOfStock <= 2 ? "text-destructive" :
                item.daysOfStock <= 4 ? "text-warning" :
                item.daysOfStock <= 7 ? "text-accent-foreground" :
                "text-success"
              }`}>
                {formatDaysNatural(item.daysOfStock)}
              </p>
            </div>
          </div>

          {/* Kecepatan jual */}
          <div className="rounded-xl border border-border/50 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Kecepatan Jual</span>
            </div>
            <p className="text-sm font-bold">{formatVelocityNatural(item.velocity)}</p>
            {item.wmaInfo && item.wmaInfo.totalDays > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Dihitung dari data {item.wmaInfo.totalDays} hari penjualan
              </p>
            )}
          </div>

          {/* Terakhir laku */}
          <div className="rounded-xl border border-border/50 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Terakhir Laku</span>
            </div>
            <p className="text-sm font-bold">{formatLastSale(lastSaleDate)}</p>
          </div>

          {/* Tren mingguan */}
          <div className="rounded-xl border border-border/50 p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Tren Minggu Ini</span>
            </div>
            <div className={`flex items-center gap-2 ${trend.color}`}>
              {trend.icon}
              <p className="text-sm font-bold">{trend.text}</p>
            </div>
            {trendInfo && (trendInfo.thisWeek > 0 || trendInfo.lastWeek > 0) && (
              <p className="text-[11px] text-muted-foreground">
                Minggu ini: {trendInfo.thisWeek} pcs · Minggu lalu: {trendInfo.lastWeek} pcs
              </p>
            )}
          </div>

          {/* Saran restock */}
          {item.recommendedQty > 0 && (() => {
            const isUrgent = item.dosStatus === "CRITICAL" || item.dosStatus === "WARNING" || item.daysOfStock <= 3;
            const urgencyLabel = item.dosStatus === "CRITICAL" ? "🚨 DARURAT" : item.dosStatus === "WARNING" ? "⚠️ SEGERA" : item.daysOfStock <= 3 ? "⚠️ SEGERA" : "📋 BISA DITUNDA";
            const urgencyColor = isUrgent ? "bg-destructive/10 border-destructive/30" : "bg-primary/5 border-primary/20";
            const urgencyTextColor = isUrgent ? "text-destructive" : "text-primary";

            const reasons: string[] = [];
            if (item.currentStock === 0) {
              reasons.push("Stok sudah habis total");
            } else if (item.daysOfStock <= 1) {
              reasons.push(`Stok hanya cukup ${item.daysOfStock < 1 ? "kurang dari 1 hari" : "1 hari"} lagi`);
            } else if (item.daysOfStock <= 3) {
              reasons.push(`Stok hanya bertahan ± ${Math.round(item.daysOfStock)} hari lagi`);
            } else {
              reasons.push(`Stok masih cukup ± ${Math.round(item.daysOfStock)} hari`);
            }
            if (item.velocity > 0) reasons.push(`Terjual rata-rata ${item.velocity.toFixed(1)} pcs/hari`);
            const trendChange = trendInfo?.change ?? item.trendChange ?? 0;
            if (trendChange > 0.1) reasons.push(`Penjualan naik ${Math.round(trendChange * 100)}% minggu ini`);
            else if (trendChange < -0.1) reasons.push(`Penjualan turun ${Math.abs(Math.round(trendChange * 100))}% minggu ini`);
            if (item.isBestSeller) reasons.push("Produk best seller");

            return (
              <div className={`rounded-xl border p-3.5 space-y-2.5 ${urgencyColor}`}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-primary">💡 Saran Beli</p>
                  <Badge className={`text-[10px] font-bold rounded-full px-2.5 border-0 ${isUrgent ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                    {urgencyLabel}
                  </Badge>
                </div>
                <p className={`text-lg font-black ${urgencyTextColor}`}>{item.recommendedQty} pcs</p>
                <p className="text-[11px] text-muted-foreground">
                  Estimasi biaya: {formatRp(item.cost)} · Target stok {item.targetDays} hari
                </p>
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alasan:</p>
                  {reasons.map((r, i) => (
                    <p key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span> {r}
                    </p>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
