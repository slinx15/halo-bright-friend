import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, Clock, ArrowRight } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, type ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { formatNumber } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

export function CriticalStockAlert() {
  const navigate = useNavigate();
  const { data: products, isLoading: prodLoading } = useProducts();
  const { stockOutData, isLoading: salesLoading } = useSalesAnalysis();

  const criticalItems = useMemo(() => {
    if (!products || !stockOutData) return [];
    const analysis = analyzeAllProducts(products, stockOutData);
    return analysis
      .filter((a) => a.dosStatus === "CRITICAL" && a.velocity > 0)
      .sort((a, b) => a.daysOfStock - b.daysOfStock)
      .slice(0, 8);
  }, [products, stockOutData]);

  const isLoading = prodLoading || salesLoading;

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-destructive/30 bg-destructive/5 shadow-md">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (criticalItems.length === 0) return null;

  return (
    <Card className="rounded-2xl border-destructive/30 bg-destructive/5 shadow-md overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-destructive">
            <div className="p-1.5 rounded-lg bg-destructive/15 animate-pulse">
              <AlertTriangle className="h-4 w-4" />
            </div>
            Stok Kritis — Segera Habis!
          </CardTitle>
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full font-bold">
            {criticalItems.length} item
          </Badge>
        </div>
        <p className="text-xs text-destructive/70 mt-1">
          Produk berikut diprediksi habis dalam ≤2 hari berdasarkan kecepatan penjualan
        </p>
      </CardHeader>
      <CardContent className="pt-1 space-y-2">
        {criticalItems.map((item) => (
          <CriticalItemRow key={item.productId} item={item} />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs mt-2 rounded-xl font-semibold border-destructive/30 text-destructive hover:bg-destructive/10 transition-all duration-150"
          onClick={() => navigate("/analisa")}
        >
          Lihat analisa lengkap <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

function CriticalItemRow({ item }: { item: ProductAnalysis }) {
  const dosText =
    item.daysOfStock < 1
      ? "< 1 hari"
      : `${item.daysOfStock.toFixed(1)} hari`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-background/80 border border-destructive/20 transition-all duration-150 hover:border-destructive/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{item.kode}</span>
          {item.isBestSeller && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 rounded-full bg-primary/10 text-primary">
              Best Seller
            </Badge>
          )}
          {item.isStockOut && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 rounded-full">
              HABIS
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            Stok: <strong className="text-destructive">{formatNumber(item.currentStock)}</strong>
          </span>
          <span className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            {item.velocity.toFixed(1)}/hari
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 text-destructive font-bold text-sm">
          <Clock className="h-3.5 w-3.5" />
          {dosText}
        </div>
        {item.recommendedQty > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Restock: +{formatNumber(item.recommendedQty)}
          </p>
        )}
      </div>
    </div>
  );
}
