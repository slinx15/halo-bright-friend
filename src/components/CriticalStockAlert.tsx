import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
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

      <div className="divide-y divide-border">
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
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-destructive/[0.025]">
      <div className="min-w-0">
        <p className="font-mono text-base font-bold text-foreground">{item.kode}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{isEmergency ? "Habis hari ini" : `Sisa ${dosText}`}</p>
      </div>

      {item.recommendedQty > 0 && (
        <div className="text-right">
          <span className="block text-xs font-medium text-muted-foreground">Saran beli</span>
          <strong className="text-sm text-primary">+{formatNumber(item.recommendedQty)} pcs</strong>
        </div>
      )}
    </article>
  );
}
