import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Flame, TrendingDown } from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, type ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { formatNumber } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

export function CriticalStockAlert() {
  const navigate = useNavigate();
  const { products, stockOutData, isLoading } = useSalesAnalysis();

  const criticalItems = useMemo(() => {
    if (!products?.length || !stockOutData) return [];
    const analysis = analyzeAllProducts(products, stockOutData);
    return analysis
      .filter((a) => a.dosStatus === "CRITICAL")
      .sort((a, b) => a.daysOfStock - b.daysOfStock)
      .slice(0, 3);
  }, [products, stockOutData]);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </section>
    );
  }

  if (criticalItems.length === 0) {
    return (
      <section className="rounded-xl border border-success/25 bg-success/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h2 className="font-semibold text-foreground">Stok kritis</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Tidak ada item yang diprediksi habis dalam 2 hari.</p>
          </div>
          <Badge className="rounded-full bg-success text-success-foreground">Aman</Badge>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-destructive/20 bg-card">
      <div className="flex items-start justify-between gap-3 bg-destructive/[0.035] px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold text-foreground">Yang paling rawan</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Cek 3 kode ini sebelum yang lain.</p>
        </div>
        <Badge variant="destructive" className="rounded-full">
          {criticalItems.length} item
        </Badge>
      </div>

      <div className="grid gap-2 p-2">
        {criticalItems.map((item) => (
          <CriticalItemRow key={item.productId} item={item} />
        ))}
      </div>

      <div className="border-t border-border bg-muted/15 p-3">
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-full justify-between rounded-lg text-sm font-semibold"
          onClick={() => navigate("/analisa")}
        >
          Lihat analisa lengkap
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

function CriticalItemRow({ item }: { item: ProductAnalysis }) {
  const dosText = item.daysOfStock < 1 ? "< 1 hari" : `${item.daysOfStock.toFixed(1)} hari`;
  const isEmergency = item.daysOfStock < 1;

  return (
    <article className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-3 transition-colors hover:border-destructive/20 hover:bg-destructive/[0.025] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold text-foreground">{item.kode}</span>
          {item.isBestSeller && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <Flame className="h-3 w-3" />
              Laris
            </span>
          )}
          <span
            className={
              isEmergency
                ? "inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground"
                : "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive"
            }
          >
            <Clock className="h-3 w-3" />
            {dosText}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            Stok <strong className="text-foreground">{formatNumber(item.currentStock)}</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5" />
            {item.velocity.toFixed(1)} pcs/hari
          </span>
        </div>
      </div>

      {item.recommendedQty > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-primary/8 px-3 py-2 sm:min-w-[132px] sm:flex-col sm:items-start">
          <span className="text-xs font-medium text-muted-foreground">Saran beli</span>
          <strong className="text-sm text-primary">+{formatNumber(item.recommendedQty)} pcs</strong>
        </div>
      )}
    </article>
  );
}
