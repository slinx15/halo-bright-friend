import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ChevronDown, Flame, TrendingUp, TrendingDown, Minus, Package, Clock, Activity, ShoppingCart, X } from "lucide-react";
import type { ProductAnalysis, TrendInfo } from "@/lib/stockAnalyticsEngine";

interface ProductDetailExpandProps {
  open: boolean;
  onClose: () => void;
  item: ProductAnalysis | null;
  trendInfo?: TrendInfo | null;
  lastSaleDate?: string | null;
  lastDayBuyers?: { toko: string; qty: number }[] | null;
  prevSaleDate?: string | null;
  prevDayBuyers?: { toko: string; qty: number }[] | null;
}

const STATUS_INFO: Record<string, { label: string; color: string; desc: string }> = {
  CRITICAL: { label: "Kritis", color: "text-destructive", desc: "Harus segera restock" },
  WARNING: { label: "Segera Habis", color: "text-warning", desc: "Stok menipis dan perlu perhatian" },
  ATTENTION: { label: "Perhatian", color: "text-accent-foreground", desc: "Stok masih cukup, tetapi perlu dipantau" },
  SAFE: { label: "Aman", color: "text-success", desc: "Stok masih cukup untuk beberapa hari" },
};

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDaysNatural(d: number): string {
  if (d >= 999) return "Sangat lama (stok banyak)";
  if (d < 1) return "Kurang dari 1 hari!";
  const rounded = Math.round(d);
  if (rounded <= 1) return "Sekitar 1 hari";
  return `Sekitar ${rounded} hari`;
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

export function ProductDetailExpand({ open, onClose, item, trendInfo, lastSaleDate, lastDayBuyers, prevSaleDate, prevDayBuyers }: ProductDetailExpandProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
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
  const isUrgent = item.dosStatus === "CRITICAL" || item.dosStatus === "WARNING" || item.daysOfStock <= 3;
  const urgencyLabel = item.dosStatus === "CRITICAL"
    ? "Darurat"
    : isUrgent
      ? "Segera"
      : "Bisa ditunda";
  const recommendationReasons: string[] = [];

  if (item.currentStock === 0) {
    recommendationReasons.push("Stok sudah habis");
  } else if (item.daysOfStock <= 1) {
    recommendationReasons.push("Stok tersisa kurang dari 1 hari");
  } else {
    recommendationReasons.push(`Stok bertahan sekitar ${Math.round(item.daysOfStock)} hari`);
  }
  if (item.velocity > 0) recommendationReasons.push(`Terjual ${item.velocity.toFixed(1)} pcs per hari`);
  if (item.isBestSeller) recommendationReasons.push("Termasuk produk laris");

  const statusGradient =
    item.dosStatus === "CRITICAL" ? "from-destructive/10 via-background to-background" :
    item.dosStatus === "WARNING" ? "from-warning/10 via-background to-background" :
    item.dosStatus === "ATTENTION" ? "from-accent/10 via-background to-background" :
    "from-success/10 via-background to-background";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Expanding panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        aria-hidden={!open}
        className={`fixed inset-0 z-[70] flex flex-col justify-end transition-all duration-300 ease-out motion-reduce:transition-none sm:justify-center sm:py-4 ${
          open
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-8 scale-95 pointer-events-none"
        }`}
      >
        <div
          ref={contentRef}
          className="w-full overflow-y-auto overscroll-contain rounded-t-[20px] bg-background shadow-2xl sm:mx-auto sm:max-w-lg sm:rounded-2xl"
          style={{ maxHeight: "calc(100dvh - 24px)", WebkitOverflowScrolling: "touch" }}
        >
          {/* Hero header with gradient */}
          <div className={`relative bg-gradient-to-b ${statusGradient} px-5 pt-5 pb-4`}>
            {/* Close button */}
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Tutup detail produk"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Product identity */}
            <div className="flex items-start gap-3 pr-10">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black ${
                item.dosStatus === "CRITICAL" ? "bg-destructive/15 text-destructive" :
                item.dosStatus === "WARNING" ? "bg-warning/15 text-warning" :
                item.dosStatus === "ATTENTION" ? "bg-accent/15 text-accent-foreground" :
                "bg-success/15 text-success"
              }`}>
                {item.kode.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 id="product-detail-title" className="text-xl font-black tracking-tight">{item.kode}</h2>
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
          <div className="space-y-4 px-5 pb-8">
            <section className={`rounded-xl border p-4 ${
              isUrgent ? "border-destructive/25 bg-destructive/5" : "border-primary/20 bg-primary/5"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Saran beli</p>
                  <p className={`mt-1 text-3xl font-black tabular-nums ${isUrgent ? "text-destructive" : "text-primary"}`}>
                    {item.recommendedQty > 0 ? `${item.recommendedQty} pcs` : "Belum perlu"}
                  </p>
                </div>
                <Badge className={`border-0 px-2.5 py-1 text-[10px] font-bold ${
                  isUrgent ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"
                }`}>
                  {isUrgent ? <AlertTriangle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {urgencyLabel}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-xs">
                <span><strong>{formatRp(item.cost)}</strong> estimasi biaya</span>
                <span className="text-muted-foreground">Cakupan aman {item.targetDays} hari</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{status.desc}.</p>
            </section>

            <section className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border/60 bg-card">
              <Metric icon={<Package className="h-3.5 w-3.5" />} label="Stok" value={`${item.currentStock}`} danger={item.currentStock === 0} />
              <Metric icon={<Clock className="h-3.5 w-3.5" />} label="Bertahan" value={formatDaysNatural(item.daysOfStock)} danger={item.daysOfStock <= 2} />
              <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Laku/hari" value={item.velocity > 0 ? item.velocity.toFixed(1) : "-"} />
            </section>

            <details className="group rounded-xl border border-border/60 bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Detail penjualan
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-border/60 px-4 py-4">
                <div>
                  <p className="text-xs text-muted-foreground">Kecepatan jual</p>
                  <p className="mt-1 text-sm font-semibold">{formatVelocityNatural(item.velocity)}</p>
                  {item.wmaInfo && item.wmaInfo.totalDays > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Data dari {item.wmaInfo.totalDays} hari penjualan</p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Tren minggu ini</p>
                  <div className={`mt-1 flex items-center gap-2 ${trend.color}`}>
                    {trend.icon}
                    <p className="text-sm font-semibold">{trend.text}</p>
                  </div>
                  {trendInfo && (trendInfo.thisWeek > 0 || trendInfo.lastWeek > 0) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Minggu ini {trendInfo.thisWeek} pcs | minggu lalu {trendInfo.lastWeek} pcs
                    </p>
                  )}
                </div>

                <SaleDateBlock label="Terakhir laku" dateStr={lastSaleDate} buyers={lastDayBuyers} />
                {prevSaleDate && <SaleDateBlock label="Penjualan sebelumnya" dateStr={prevSaleDate} buyers={prevDayBuyers} />}

                <div>
                  <p className="text-xs text-muted-foreground">Dasar rekomendasi</p>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {recommendationReasons.map((reason) => <li key={reason}>• {reason}</li>)}
                  </ul>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

function SaleDateBlock({ label, dateStr, buyers }: { label: string; dateStr?: string | null; buyers?: { toko: string; qty: number }[] | null }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ShoppingCart className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-sm font-semibold">{formatLastSale(dateStr)}</p>
      {buyers && buyers.length > 0 && (
        <div className="space-y-1 pt-1">
          {buyers.filter(b => b.toko).map((b, i) => (
            <div key={`${b.toko}-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">🏪 {b.toko}</span>
              <span className="font-semibold tabular-nums">{b.qty} pcs</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0 px-2.5 py-3 text-center sm:px-4">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-bold tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
