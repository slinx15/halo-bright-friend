import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, TrendingDown, Minus, Package, Clock, Activity, ShoppingCart, X } from "lucide-react";
import type { ProductAnalysis, TrendInfo } from "@/lib/stockAnalyticsEngine";

interface ProductDetailExpandProps {
  open: boolean;
  onClose: () => void;
  item: ProductAnalysis | null;
  trendInfo?: TrendInfo | null;
  lastSaleDate?: string | null;
  lastDayBuyers?: { toko: string; qty: number }[] | null;
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

export function ProductDetailExpand({ open, onClose, item, trendInfo, lastSaleDate, lastBuyer }: ProductDetailExpandProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!item) return null;

  const status = STATUS_INFO[item.dosStatus] || STATUS_INFO.SAFE;
  const trend = formatTrendNatural(trendInfo?.change ?? 0);

  const statusGradient =
    item.dosStatus === "CRITICAL" ? "from-destructive/10 via-background to-background" :
    item.dosStatus === "WARNING" ? "from-warning/10 via-background to-background" :
    item.dosStatus === "ATTENTION" ? "from-accent/10 via-background to-background" :
    "from-success/10 via-background to-background";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Expanding panel */}
      <div
        className={`fixed inset-0 z-50 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-8 scale-95 pointer-events-none"
        }`}
      >
        <div
          ref={contentRef}
          className={`flex-1 bg-background overflow-y-auto overscroll-contain rounded-t-[20px] mt-6 sm:mt-4 sm:mx-auto sm:max-w-lg sm:rounded-2xl sm:mb-4 shadow-2xl`}
        >
          {/* Hero header with gradient */}
          <div className={`relative bg-gradient-to-b ${statusGradient} px-5 pt-5 pb-4`}>
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-muted/80 backdrop-blur flex items-center justify-center hover:bg-muted transition-colors active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Product identity */}
            <div className="flex items-start gap-3 pr-10">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                item.dosStatus === "CRITICAL" ? "bg-destructive/15 text-destructive" :
                item.dosStatus === "WARNING" ? "bg-warning/15 text-warning" :
                item.dosStatus === "ATTENTION" ? "bg-accent/15 text-accent-foreground" :
                "bg-success/15 text-success"
              }`}>
                {item.kode.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight">{item.kode}</h2>
                  {item.isBestSeller && <Flame className="h-5 w-5 text-warning" />}
                  {item.isStockOut && <span className="text-base">🚨</span>}
                </div>
                {item.nama && (
                  <p className="text-sm text-muted-foreground truncate">{item.nama}</p>
                )}
                <Badge variant="outline" className={`mt-1.5 text-xs font-semibold ${status.color}`}>
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Content body */}
          <div className="px-5 pb-8 space-y-4">
            {/* Status message */}
            <div className={`rounded-2xl border p-4 -mt-1 ${
              item.dosStatus === "CRITICAL" ? "bg-destructive/5 border-destructive/20" :
              item.dosStatus === "WARNING" ? "bg-warning/5 border-warning/20" :
              "bg-muted/30 border-border/50"
            }`}>
              <p className="text-sm font-medium">{status.desc}</p>
            </div>

            {/* Key metrics - large cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted/40 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Stok Sekarang</span>
                </div>
                <p className={`text-3xl font-black tabular-nums leading-none ${item.currentStock === 0 ? "text-destructive" : ""}`}>
                  {item.currentStock}
                </p>
                <p className="text-[11px] text-muted-foreground">pcs tersisa</p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Bertahan</span>
                </div>
                <p className={`text-lg font-black leading-tight ${
                  item.daysOfStock <= 2 ? "text-destructive" :
                  item.daysOfStock <= 4 ? "text-warning" :
                  item.daysOfStock <= 7 ? "text-accent-foreground" :
                  "text-success"
                }`}>
                  {formatDaysNatural(item.daysOfStock)}
                </p>
              </div>
            </div>

            {/* Info rows */}
            <div className="space-y-3">
              <InfoRow
                icon={<Activity className="h-4 w-4" />}
                label="Kecepatan Jual"
                value={formatVelocityNatural(item.velocity)}
                sub={item.wmaInfo && item.wmaInfo.totalDays > 0
                  ? `Dihitung dari data ${item.wmaInfo.totalDays} hari penjualan`
                  : undefined}
              />

              <InfoRow
                icon={<ShoppingCart className="h-4 w-4" />}
                label="Terakhir Laku"
                value={formatLastSale(lastSaleDate)}
                sub={lastBuyer ? `Dibeli oleh: ${lastBuyer}` : undefined}
              />

              <div className="rounded-2xl border border-border/50 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
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
            </div>

            {/* Restock recommendation */}
            {item.recommendedQty > 0 && (
              <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">💡 Saran Beli</p>
                <p className="text-2xl font-black text-primary">{item.recommendedQty} pcs</p>
                <p className="text-[11px] text-muted-foreground">
                  Estimasi biaya: {formatRp(item.cost)} · Target stok {item.targetDays} hari
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/50 p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
