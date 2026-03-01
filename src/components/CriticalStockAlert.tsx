import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, Clock, ArrowRight, Flame } from "lucide-react";
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
      .slice(0, 6);
  }, [products, stockOutData]);

  const isLoading = prodLoading || salesLoading;

  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (criticalItems.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-md border-0 overflow-hidden transition-all duration-150 hover:shadow-lg animate-fade-in">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            Stok Kritis
          </CardTitle>
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full font-bold">
            {criticalItems.length}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Habis dalam ≤2 hari berdasarkan kecepatan jual
        </p>
      </CardHeader>
      <CardContent className="pt-1 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {criticalItems.map((item, i) => (
            <div key={item.productId} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}>
              <CriticalItemCard item={item} />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs mt-3 rounded-xl font-semibold hover:bg-primary/5 hover:text-primary transition-all duration-150"
          onClick={() => navigate("/analisa")}
        >
          Lihat analisa lengkap <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

function CriticalItemCard({ item }: { item: ProductAnalysis }) {
  const dosText =
    item.daysOfStock < 1
      ? "< 1 hari"
      : `${item.daysOfStock.toFixed(1)} hr`;

  const urgency = item.daysOfStock < 1 ? "extreme" : "high";

  return (
    <div
      className={`relative p-3 rounded-xl border transition-all duration-150 ${
        urgency === "extreme"
          ? "border-destructive/40 bg-destructive/5"
          : "border-destructive/20 bg-destructive/[0.03]"
      }`}
    >
      {/* Kode + badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-mono font-bold text-sm truncate">{item.kode}</span>
        {item.isBestSeller && (
          <Flame className="h-3 w-3 text-primary shrink-0" />
        )}
      </div>

      {/* DOS pill */}
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
          urgency === "extreme"
            ? "bg-destructive text-destructive-foreground"
            : "bg-destructive/15 text-destructive"
        }`}
      >
        <Clock className="h-3 w-3" />
        {dosText}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span>
          Stok <strong className="text-foreground">{formatNumber(item.currentStock)}</strong>
        </span>
        <span className="flex items-center gap-0.5">
          <TrendingDown className="h-3 w-3" />
          {item.velocity.toFixed(1)}/hr
        </span>
      </div>

      {/* Restock hint */}
      {item.recommendedQty > 0 && (
        <div className="mt-1.5 text-[10px] text-primary font-semibold">
          Restock +{formatNumber(item.recommendedQty)}
        </div>
      )}
    </div>
  );
}
