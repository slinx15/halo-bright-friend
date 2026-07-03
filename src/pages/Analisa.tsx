import { useState, useMemo, useEffect, useCallback, useDeferredValue, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertTriangle, Package, Skull,
  BarChart3, DollarSign, Store, ArrowDown,
  ShoppingCart, Clock, Trophy, Activity,
  Wallet, Flame, TrendingUp,
  Calculator, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, Palette, Calendar as CalendarIcon, Users,
  Plus, Send, Loader2, Lock, Search, RotateCcw
} from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, calculateTrendData, RULES, type DosStatus, type ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { ProductDetailExpand } from "@/components/analisa/ProductDetailExpand";
import { AnalisaBudgetPlanner } from "@/components/analisa/AnalisaBudgetPlanner";
import {
  calcTrend, calcDeadStock, calcLowStock,
  calcPredictions, calcProfit, calcTokoAnalysis, calcStats,
} from "@/lib/analysisFeatures";
import { DAYS_PRESETS, buildBudgetEstimateFromAnalyses } from "@/lib/analisaBudget";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnalisaSkeleton } from "@/components/LoadingSkeletons";
import { SalesTrendCharts } from "@/components/analisa/SalesTrendCharts";
import ReviewAI from "@/components/analisa/ReviewAI";
import ColorTrendAnalysis from "@/components/analisa/ColorTrendAnalysis";
import HariRamaiAnalysis from "@/components/analisa/HariRamaiAnalysis";
import RepeatCustomerAnalysis from "@/components/analisa/RepeatCustomerAnalysis";
import { filterAndSortAnalyses, type RestockFilter, type RestockSort } from "@/lib/analysisView";


// ─── Formatting Helpers ───────────────────────────────────

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDaysLeft(d: number): string {
  if (d >= 999) return "Tak terbatas";
  if (d < 1) return "< 1 hari";
  return Math.round(d) + " hari";
}

function urgencyIcon(days: number) {
  if (days <= RULES.CRITICAL_DAYS) return "!";
  if (days <= RULES.WARNING_DAYS) return "!!";
  if (days <= RULES.ATTENTION_DAYS) return "?";
  return "OK";
}

// ─── Types ────────────────────────────────────────────────

type AnalysisSection = "restock" | "penjualan" | "toko" | "planning" | "insight";
type RestockView = "recommendations" | "predictions" | "low-stock";
type PriorityLevel = "critical" | "high" | "medium" | "safe";

function getPriorityLevel(status: DosStatus): PriorityLevel {
  if (status === "CRITICAL") return "critical";
  if (status === "WARNING") return "high";
  if (status === "ATTENTION") return "medium";
  return "safe";
}

const PRIORITY_BAR_COLOR: Record<PriorityLevel, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-accent",
  safe: "bg-success",
};

const PRIORITY_ROW_BG: Record<PriorityLevel, string> = {
  critical: "bg-destructive/5",
  high: "",
  medium: "",
  safe: "",
};

const FILTER_CHIPS: { key: RestockFilter; label: string; activeClass: string; inactiveClass: string }[] = [
  { key: "ALL", label: "Semua", activeClass: "bg-primary/12 text-primary border-primary/25 shadow-sm", inactiveClass: "bg-background text-muted-foreground border-border/70" },
  { key: "CRITICAL", label: "Kritis", activeClass: "bg-destructive/12 text-destructive border-destructive/25 shadow-sm", inactiveClass: "bg-background text-muted-foreground border-border/70" },
  { key: "WARNING", label: "Segera", activeClass: "bg-warning/12 text-warning border-warning/25 shadow-sm", inactiveClass: "bg-background text-muted-foreground border-border/70" },
  { key: "ATTENTION", label: "Pantau", activeClass: "bg-accent/12 text-accent-foreground border-accent/25 shadow-sm", inactiveClass: "bg-background text-muted-foreground border-border/70" },
  { key: "SAFE", label: "Aman", activeClass: "bg-success/12 text-success border-success/25 shadow-sm", inactiveClass: "bg-background text-muted-foreground border-border/70" },
  { key: "OUT_OF_STOCK", label: "Kosong", activeClass: "bg-slate-100 text-slate-800 border-slate-300 shadow-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700", inactiveClass: "bg-background text-muted-foreground border-border/70" },
];

const STATUS_BADGE: Record<DosStatus, { label: string; className: string }> = {
  CRITICAL: { label: "KRITIS", className: "bg-destructive/15 text-destructive border-destructive/30" },
  WARNING: { label: "SEGERA", className: "bg-warning/15 text-warning border-warning/30" },
  ATTENTION: { label: "PERHATIAN", className: "bg-accent/15 text-accent-foreground border-accent/30" },
  SAFE: { label: "AMAN", className: "bg-success/15 text-success border-success/30" },
};

// ─── Section Header Component ─────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

type BudgetEstimate = ReturnType<typeof buildBudgetEstimateFromAnalyses>;

function RestockEstimateList({
  estimates,
  expandedDays,
  onToggle,
}: {
  estimates: BudgetEstimate[];
  expandedDays: number | null;
  onToggle: (days: number) => void;
}) {
  return (
    <Card className="border-0 p-5 shadow-sm">
      <div className="space-y-3">
        <SectionHeader icon={DollarSign} title="Estimasi Budget Restock" subtitle="Pilih periode untuk melihat daftar pembelian." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {estimates.map((estimate) => {
            const label = estimate.days === 4 ? "1 siklus" : estimate.days === 7 ? "1 minggu" : estimate.days === 14 ? "2 minggu" : estimate.days === 21 ? "3 minggu" : "1 bulan";
            const isExpanded = expandedDays === estimate.days;
            return (
              <div key={estimate.days}>
                <button
                  type="button"
                  onClick={() => onToggle(estimate.days)}
                  aria-expanded={isExpanded}
                  className={`w-full rounded-xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isExpanded ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <p className="text-xs text-muted-foreground">{estimate.days} hari | {label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{formatRp(estimate.cost)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{estimate.items} item | {estimate.qty} pcs</p>
                </button>
                {isExpanded && (
                  <div className="mt-2 max-h-[400px] space-y-1 overflow-y-auto rounded-lg border bg-background p-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-b px-1 pb-1 text-[10px] font-medium text-muted-foreground">
                      <span>Kode</span><span className="text-right">Stok</span><span className="text-right">Beli</span><span className="text-right">Biaya</span>
                    </div>
                    {estimate.details.map((detail) => (
                      <div key={detail.productId} className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 rounded px-1 py-1 text-xs ${
                        detail.daysLeft <= RULES.CRITICAL_DAYS ? "bg-destructive/10" : detail.isBestSeller ? "bg-primary/5" : ""
                      }`}>
                        <span className="flex items-center gap-1 truncate font-mono text-[11px]">{detail.daysLeft <= RULES.CRITICAL_DAYS ? "!" : detail.isBestSeller ? "*" : ""}{detail.kode}</span>
                        <span className={`text-right tabular-nums ${detail.stok === 0 ? "font-bold text-destructive" : detail.stok <= 5 ? "text-warning" : ""}`}>{detail.stok}</span>
                        <span className="text-right font-semibold tabular-nums">{detail.qty}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{formatRp(detail.cost)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-t px-1 pt-1 text-xs font-bold">
                      <span>Total</span><span /><span className="text-right tabular-nums">{estimate.qty}</span><span className="text-right tabular-nums">{formatRp(estimate.cost)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── Budget Planner Component ─────────────────────────────

function MobileRankedCard({ rank, kode, isBestSeller, children, borderClass, index = 0 }: {
  rank: number | string; kode: string; isBestSeller?: boolean; children: React.ReactNode; borderClass?: string; index?: number;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2 transition-all active:scale-[0.99] animate-fade-in ${borderClass || "border-border/60"}`}
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground font-mono">{typeof rank === "number" ? `#${rank}` : rank}</span>
          <span className="font-bold text-sm">{kode}</span>
          {isBestSeller && <Flame className="h-3 w-3 text-warning" />}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

const Analisa = () => {
  const { products, stockOutData, isLoading } = useSalesAnalysis();
  const [activeSection, setActiveSection] = useState<AnalysisSection>("restock");
  const [restockView, setRestockView] = useState<RestockView>("recommendations");
  const [filter, setFilter] = useState<RestockFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [restockSort, setRestockSort] = useState<RestockSort>("priority");
  const [filterKey, setFilterKey] = useState(0);
  const [visibleCount, setVisibleCount] = useState(30);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [budgetAmount, setBudgetAmount] = useState<number>(2000000);
  const [budgetDays, setBudgetDays] = useState<number>(4);
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysis | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedBudgetDays, setExpandedBudgetDays] = useState<number | null>(null);
  const isMobile = useIsMobile();
  

  const analyses = useMemo(() => {
    if (!products.length) return [];
    return analyzeAllProducts(products, stockOutData);
  }, [products, stockOutData]);

  // Trend data for drawer
  const trendData = useMemo(() => {
    if (!products.length) return {};
    return calculateTrendData(stockOutData, products);
  }, [products, stockOutData]);

  // Last sale date & previous sale date + buyers per product
  const { lastSaleDates, lastDayBuyers, prevSaleDates, prevDayBuyers } = useMemo(() => {
    const WIB_OFFSET = 7 * 3600000;
    const toWibDateKey = (iso: string) => new Date(new Date(iso).getTime() + WIB_OFFSET).toISOString().slice(0, 10);
    // Collect all unique sale dates per product
    const datesPerProduct: Record<string, Set<string>> = {};
    for (const s of stockOutData) {
      if (!datesPerProduct[s.product_id]) datesPerProduct[s.product_id] = new Set();
      datesPerProduct[s.product_id].add(toWibDateKey(s.created_at));
    }
    // Get last and previous dates
    const dateMap: Record<string, string> = {};
    const prevDateMap: Record<string, string> = {};
    for (const [pid, dates] of Object.entries(datesPerProduct)) {
      const sorted = Array.from(dates).sort((a, b) => b.localeCompare(a));
      if (sorted[0]) dateMap[pid] = sorted[0];
      if (sorted[1]) prevDateMap[pid] = sorted[1];
    }
    // Collect buyers for a given date
    function collectBuyers(targetDates: Record<string, string>) {
      const buyersMap: Record<string, { toko: string; qty: number }[]> = {};
      for (const s of stockOutData) {
        const targetDate = targetDates[s.product_id];
        if (!targetDate) continue;
        if (toWibDateKey(s.created_at) === targetDate) {
          if (!buyersMap[s.product_id]) buyersMap[s.product_id] = [];
          const toko = s.toko || "";
          const qtyKirim = s.qty_kirim || 0;
          const existing = buyersMap[s.product_id].find(b => b.toko === toko);
          if (existing) {
            existing.qty += qtyKirim;
          } else {
            buyersMap[s.product_id].push({ toko, qty: qtyKirim });
          }
        }
      }
      return buyersMap;
    }
    return {
      lastSaleDates: dateMap,
      lastDayBuyers: collectBuyers(dateMap),
      prevSaleDates: prevDateMap,
      prevDayBuyers: collectBuyers(prevDateMap),
    };
  }, [stockOutData]);

  const openProductDrawer = useCallback((item: ProductAnalysis) => {
    setSelectedProduct(item);
    setDrawerOpen(true);
  }, []);

  const counts = useMemo(() => getStatusCounts(analyses), [analyses]);

  const filtered = useMemo(
    () => filterAndSortAnalyses(analyses, filter, deferredSearchQuery, restockSort),
    [analyses, filter, deferredSearchQuery, restockSort],
  );

  const paginatedFiltered = useMemo(() =>
    filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  // Infinite scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < filtered.length) {
          setVisibleCount(v => Math.min(v + 30, filtered.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length]);

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(30);
  }, [filter, deferredSearchQuery, restockSort]);

  const resetRestockControls = useCallback(() => {
    setFilter("ALL");
    setSearchQuery("");
    setRestockSort("priority");
    setVisibleCount(30);
  }, []);

  // Action Summary computed values
  const zeroStockCount = useMemo(() => analyses.filter(a => a.isStockOut).length, [analyses]);
  const totalRestockCost = useMemo(() => analyses.reduce((sum, item) => sum + item.cost, 0), [analyses]);
  const needsReorder = useMemo(() => analyses.filter((a) => a.recommendedQty > 0).length, [analyses]);

  const topSellers = useMemo(() => {
    const salesMap: Record<string, { qty: number; days: Set<string> }> = {};
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    for (const s of stockOutData) {
      if (new Date(s.created_at) < thirtyAgo) continue;
      if (!salesMap[s.product_id]) salesMap[s.product_id] = { qty: 0, days: new Set() };
      salesMap[s.product_id].qty += s.qty_kirim;
      const wibDate = new Date(new Date(s.created_at).getTime() + 7 * 3600000);
      salesMap[s.product_id].days.add(wibDate.toISOString().slice(0, 10));
    }
    return analyses
      .filter(a => {
        const sm = salesMap[a.productId];
        return sm && sm.qty > 0;
      })
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, RULES.DISPLAY_TOP_ITEMS)
      .map(a => {
        const sm = salesMap[a.productId] ?? { qty: 0, days: new Set() };
        return {
          kode: a.kode, productId: a.productId, totalQty: sm.qty,
          days: sm.days.size, velocity: a.velocity, stok: a.currentStock,
          daysLeft: a.daysOfStock, isBestSeller: a.isBestSeller,
        };
      });
  }, [analyses, stockOutData]);

  const trendItems = useMemo(() => calcTrend(products, stockOutData), [products, stockOutData]);
  const deadStock = useMemo(() => calcDeadStock(products, stockOutData), [products, stockOutData]);
  const lowStock = useMemo(() => calcLowStock(products, stockOutData), [products, stockOutData]);
  const predictions = useMemo(() => calcPredictions(products, stockOutData), [products, stockOutData]);
  const filteredProductIds = useMemo(() => new Set(filtered.map((item) => item.productId)), [filtered]);
  const hasDefaultRestockScope = filter === "ALL" && deferredSearchQuery.trim() === "";
  const scopedPredictions = useMemo(() => (
    hasDefaultRestockScope ? predictions : predictions.filter((item) => filteredProductIds.has(item.productId))
  ), [hasDefaultRestockScope, predictions, filteredProductIds]);
  const scopedLowStock = useMemo(() => {
    if (hasDefaultRestockScope) return lowStock;
    return calcLowStock(products.filter((product) => filteredProductIds.has(product.id)), stockOutData);
  }, [hasDefaultRestockScope, filteredProductIds, lowStock, products, stockOutData]);
  const profitItems = useMemo(() => calcProfit(products, stockOutData), [products, stockOutData]);
  const tokoItems = useMemo(() => calcTokoAnalysis(products, stockOutData), [products, stockOutData]);
  const budgetEstimates = useMemo(() => DAYS_PRESETS.map((days) => buildBudgetEstimateFromAnalyses(analyses, days)), [analyses]);
  const stats = useMemo(() => calcStats(products, stockOutData), [products, stockOutData]);

  if (isLoading) {
    return <AnalisaSkeleton />;
  }

  const predCritical = scopedPredictions.filter(p => p.urgency === "critical");
  const predWarning = scopedPredictions.filter(p => p.urgency === "warning");
  const predAttention = scopedPredictions.filter(p => p.urgency === "attention");
  const predSafe = scopedPredictions.filter(p => p.urgency === "safe");
  const activeFilterLabel = FILTER_CHIPS.find((chip) => chip.key === filter)?.label ?? "Semua";

  const totalTW = trendItems.reduce((s, t) => s + t.thisWeek, 0);
  const totalLW = trendItems.reduce((s, t) => s + t.lastWeek, 0);
  const overallChange = totalLW > 0 ? ((totalTW - totalLW) / totalLW * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full overflow-y-auto overflow-x-hidden pb-32 md:pb-6">
      {/* HEADER — ringkas, ikon di kiri, konsisten dgn Masuk/Keluar/Stok */}
      <section className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">Analisa</h1>
            <p className="text-xs text-muted-foreground">
              {analyses.length} SKU · WMA {RULES.WMA_PERIOD1_DAYS} hari
            </p>
          </div>
        </div>
      </section>

      {/* KPI CARDS — Vibrant status cards (horizontal, 3 kolom) */}
      <section className="grid grid-cols-3 gap-2.5">
        {/* Perlu Restock */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-destructive leading-none">{needsReorder}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-destructive">Restock</p>
            <p className="text-[9px] text-muted-foreground">Perlu diisi</p>
          </div>
        </div>

        {/* Total SKU */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <Package className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">{analyses.length}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-foreground/90">Aktif</p>
            <p className="text-[9px] text-muted-foreground">SKU dianalisa</p>
          </div>
        </div>

        {/* Total Biaya — filled primary */}
        <div className="flex flex-col items-center justify-between rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
            <Wallet className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-primary-foreground leading-none">
              {totalRestockCost >= 1_000_000_000
                ? `${(totalRestockCost / 1_000_000_000).toFixed(1).replace(".", ",")} M`
                : totalRestockCost >= 1_000_000
                  ? `${(totalRestockCost / 1_000_000).toFixed(1).replace(".", ",")} jt`
                  : totalRestockCost >= 1_000
                    ? `${(totalRestockCost / 1_000).toFixed(0)} rb`
                    : totalRestockCost}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-primary-foreground">Biaya (Rp)</p>
            <p className="text-[9px] text-primary-foreground/75">Estimasi restock</p>
          </div>
        </div>
      </section>


      {/* MAIN CONTENT — TABS */}
      <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as AnalysisSection)} className="w-full">
        <div className="rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-sm">
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-2xl border border-border/60 bg-muted/30 p-1">
            {[
              { value: "restock", icon: ShoppingCart, label: "Restock", badge: needsReorder > 0 ? needsReorder : null },
              { value: "penjualan", icon: Trophy, label: "Jual", badge: null },
              { value: "toko", icon: Users, label: "Pelanggan", badge: null },
              { value: "planning", icon: Calculator, label: "Rencana", badge: null },
              { value: "insight", icon: BarChart3, label: "Insight", badge: null },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative flex min-h-12 flex-col items-center gap-1 rounded-xl border border-transparent px-1 py-2 text-[9px] font-semibold text-muted-foreground transition-colors data-[state=active]:border-primary/15 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:flex-row sm:justify-center sm:text-xs"
              >
                <div className="relative">
                  <tab.icon className="h-4 w-4 shrink-0" />
                  {tab.badge && (
                    <span className="md:hidden absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-700 px-1 text-[9px] font-bold text-white dark:bg-red-600">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="leading-tight">{tab.label}</span>
                {tab.badge && (
                  <Badge variant="destructive" className="ml-0.5 hidden h-4 min-w-[16px] shrink-0 rounded-full px-1 text-[9px] sm:flex">
                    {tab.badge}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ══════════ RESTOCK ══════════ */}
        <TabsContent value="restock" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs value={restockView} onValueChange={(value) => setRestockView(value as RestockView)} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border/75 bg-card/90 p-0.5 shadow-sm dark:bg-card/80">
              <TabsTrigger value="recommendations" className="min-h-10 rounded-xl border border-transparent bg-transparent px-2 text-[11px] font-semibold text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-primary/[0.08] data-[state=active]:text-primary data-[state=active]:shadow-none md:text-xs">
                <ShoppingCart className="mr-1.5 h-3 w-3" />
                <span className="hidden sm:inline">Daftar Restock</span>
                <span className="sm:hidden">Restock</span>
              </TabsTrigger>
              <TabsTrigger value="predictions" className="min-h-10 rounded-xl border border-transparent bg-transparent px-2 text-[11px] font-semibold text-muted-foreground data-[state=active]:border-warning/15 data-[state=active]:bg-warning/[0.10] data-[state=active]:text-warning md:text-xs">
                <Clock className="mr-1.5 h-3 w-3" />
                Prediksi Habis
              </TabsTrigger>
              <TabsTrigger value="low-stock" className="min-h-10 rounded-xl border border-transparent bg-transparent px-2 text-[11px] font-semibold text-muted-foreground data-[state=active]:border-success/15 data-[state=active]:bg-success/[0.10] data-[state=active]:text-success md:text-xs">
                <ArrowDown className="mr-1.5 h-3 w-3" />
                Stok Terendah
              </TabsTrigger>
            </TabsList>

            <div className="sticky top-0 z-10 mt-3 space-y-3 rounded-2xl border border-border/75 bg-card/95 px-3 py-3 shadow-sm backdrop-blur-sm">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Cari kode atau nama"
                    aria-label="Cari kode atau nama produk"
                    className="h-10 rounded-xl border-border/75 bg-background/98 pl-9 shadow-none dark:bg-slate-950/70"
                  />
                </div>
                {restockView === "recommendations" && (
                  <Select value={restockSort} onValueChange={(value) => setRestockSort(value as RestockSort)}>
                    <SelectTrigger className="h-10 w-[118px] rounded-xl border-border/75 bg-background/98 text-xs shadow-none sm:w-[160px] dark:bg-slate-950/70" aria-label="Urutkan daftar restock">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Prioritas</SelectItem>
                      <SelectItem value="stock">Stok terendah</SelectItem>
                      <SelectItem value="velocity">Paling laris</SelectItem>
                      <SelectItem value="cost">Biaya terbesar</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(filter !== "ALL" || searchQuery || restockSort !== "priority") && (
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={resetRestockControls} aria-label="Reset filter">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0">
                {FILTER_CHIPS.map((chip) => {
                  const isActive = filter === chip.key;
                  const count = chip.key === "ALL"
                    ? analyses.length
                    : chip.key === "OUT_OF_STOCK"
                      ? zeroStockCount
                      : counts[chip.key.toLowerCase() as keyof typeof counts];
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => { setFilter(chip.key); setFilterKey((key) => key + 1); setVisibleCount(30); }}
                      aria-pressed={isActive}
                    className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-xl border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2 ${
                        isActive
                          ? chip.activeClass
                          : `${chip.inactiveClass} hover:bg-muted/50`
                      }`}
                    >
                      {chip.label}
                      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          <TabsContent value="recommendations" className="mt-4 space-y-4">
          <div key={`s-${filterKey}`} className="flex items-center gap-2 animate-fade-in">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{filtered.length}</span> produk
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              Filter: <span className="font-semibold text-foreground">{activeFilterLabel}</span>
            </span>
          </div>

          <div key={filterKey} className="hidden md:block animate-fade-in">
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-0 p-0"></TableHead>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Vel/{RULES.DISPLAY_CYCLE_DAYS} hari</TableHead>
                      <TableHead className="text-right">Sisa Hari</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Target</TableHead>
                      <TableHead className="text-right">Rekomendasi</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Biaya</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFiltered.map((a, i) => {
                      const globalIdx = i;
                      const badge = STATUS_BADGE[a.dosStatus];
                      const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
                      const priority = getPriorityLevel(a.dosStatus);
                      const isZeroStock = a.currentStock === 0;
                      return (
                        <TableRow
                          key={a.productId}
                          className={`relative cursor-pointer hover:bg-muted/50 ${PRIORITY_ROW_BG[priority]} animate-fade-in`}
                          style={{ animationDelay: `${Math.min(i * 20, 200)}ms`, animationFillMode: "both" }}
                          onClick={() => openProductDrawer(a)}
                        >
                          {/* Priority Bar */}
                          <td className="w-0 p-0 relative">
                            <div className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 rounded-r ${PRIORITY_BAR_COLOR[priority]}`} />
                          </td>
                          <TableCell className="text-muted-foreground text-xs font-mono">{globalIdx + 1}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${badge.className}`}>
                              {a.dosStatus === "CRITICAL" && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold tracking-tight">
                            <div className="flex items-center gap-1">
                              <span className="text-sm">{a.kode}</span>
                              {a.isBestSeller && <Flame className="h-3 w-3 text-warning" />}
                            </div>
                            {a.nama && a.nama.trim().toLowerCase() !== a.kode.trim().toLowerCase() && !a.nama.trim().toLowerCase().startsWith(`${a.kode.trim().toLowerCase()} `) && (
                              <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{a.nama}</div>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm tabular-nums ${isZeroStock ? "text-destructive font-bold" : ""}`}>
                            {a.currentStock}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums hidden sm:table-cell">{velPerCycle.toFixed(0)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono font-bold text-base ${
                              a.daysOfStock <= 2 ? "text-destructive" :
                              a.daysOfStock <= 4 ? "text-warning" :
                              a.daysOfStock <= 7 ? "text-accent" :
                              "text-success"
                            }`}>
                              {formatDaysLeft(a.daysOfStock)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums hidden lg:table-cell">
                            {a.targetStock}
                          </TableCell>
                          <TableCell className="text-right">
                            {a.recommendedQty > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                                {a.recommendedQty}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums hidden sm:table-cell">
                            {a.cost > 0 ? formatRp(a.cost) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {paginatedFiltered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-16">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Produk tidak ditemukan</p>
                          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={resetRestockControls}>Reset filter</Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Mobile Boss Cards */}
          <div key={`m-${filterKey}`} className="md:hidden space-y-2.5 animate-fade-in">
            {paginatedFiltered.length === 0 ? (
              <div className="text-center py-16">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">Produk tidak ditemukan</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={resetRestockControls}>Reset filter</Button>
              </div>
            ) : (
              paginatedFiltered.map((a, idx) => {
                const badge = STATUS_BADGE[a.dosStatus];
                const priority = getPriorityLevel(a.dosStatus);
                const isZeroStock = a.currentStock === 0;

                return (
                  <button
                    key={a.productId}
                    onClick={() => openProductDrawer(a)}
                    className={`rounded-xl border bg-card p-3.5 transition-all active:scale-[0.99] w-full text-left ${
                      priority === "critical" ? "border-destructive/25 bg-destructive/[0.035]" : "border-border/60"
                    } animate-fade-in`}
                    style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex items-start justify-between mb-2.5 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="font-bold text-sm truncate">{a.kode}</span>
                          {a.isBestSeller && <Flame className="h-3 w-3 text-warning shrink-0" />}
                          <Badge variant="outline" className={`text-[9px] font-semibold shrink-0 ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </div>
                        {a.nama && a.nama.trim().toLowerCase() !== a.kode.trim().toLowerCase() && !a.nama.trim().toLowerCase().startsWith(`${a.kode.trim().toLowerCase()} `) && (
                          <p className="mt-1 text-[11px] text-muted-foreground truncate">{a.nama}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className={`font-mono font-extrabold text-lg leading-none tabular-nums ${
                          a.daysOfStock <= 2 ? "text-destructive" :
                          a.daysOfStock <= 4 ? "text-warning" :
                          a.daysOfStock <= 7 ? "text-accent" :
                          "text-success"
                        }`}>
                          {formatDaysLeft(a.daysOfStock)}
                        </span>
                        <p className="text-[9px] text-muted-foreground">sisa</p>
                      </div>
                    </div>


                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Stok</p>
                        <p className={`font-mono font-bold text-sm tabular-nums ${isZeroStock ? "text-destructive" : ""}`}>
                          {a.currentStock}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Beli</p>
                        {a.recommendedQty > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-bold text-xs">
                            {a.recommendedQty} <span className="ml-0.5 text-[9px] font-medium opacity-80">pcs</span>
                          </span>
                        ) : (
                          <p className="text-sm text-muted-foreground/40">—</p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Biaya</p>
                        <p className="font-mono text-xs font-semibold tabular-nums">
                          {a.cost > 0 ? formatRp(a.cost) : "—"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Infinite scroll sentinel */}
          {visibleCount < filtered.length && (
            <div ref={loadMoreRef} className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Memuat lagi...</span>
            </div>
          )}
          {visibleCount >= filtered.length && filtered.length > 0 && (
            <div className="text-center py-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                Menampilkan semua {filtered.length} produk
              </p>
              {products.length > analyses.length && (
                <p className="text-[10px] text-muted-foreground/60">
                  {products.length - analyses.length} produk disembunyikan (stok habis &amp; jarang laku)
                </p>
              )}
            </div>
          )}

          </TabsContent>

          <TabsContent value="predictions" className="mt-4">
          <Card className="border-0 shadow-sm p-5 space-y-4 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
            <SectionHeader icon={Clock} title="Prediksi Kehabisan Stok" subtitle="Berdasarkan velocity saat ini" />
            {[
              { items: predCritical, label: `Kritis <= ${RULES.CRITICAL_DAYS} hari`, color: "text-destructive", dot: "bg-destructive" },
              { items: predWarning, label: `Warning ${RULES.CRITICAL_DAYS + 1}-${RULES.WARNING_DAYS} hari`, color: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
              { items: predAttention, label: `Perhatian ${RULES.WARNING_DAYS + 1}-${RULES.ATTENTION_DAYS} hari`, color: "text-accent", dot: "bg-accent" },
            ].map(({ items, label, color, dot }) => items.length > 0 && (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <div className={`text-xs font-semibold ${color}`}>{label} ({items.length})</div>
                </div>
                {isMobile ? (
                  <div className="space-y-2">
                    {items.map((p, pIdx) => (
                      <div key={p.productId} className={`rounded-xl border p-3 space-y-1.5 animate-fade-in ${
                        p.urgency === "critical" ? "border-l-[3px] border-l-destructive border-border/60" : "border-border/60"
                      }`} style={{ animationDelay: `${Math.min(pIdx * 30, 300)}ms`, animationFillMode: "both" }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">{p.kode}{p.isBestSeller ? " Top" : ""}</span>
                          <span className={`font-mono font-bold tabular-nums ${color}`}>{formatDaysLeft(p.daysLeft)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div><span className="text-muted-foreground">Stok</span><p className="font-semibold tabular-nums">{p.stok}</p></div>
                          <div><span className="text-muted-foreground">Vel</span><p className="font-semibold tabular-nums">{p.velocity.toFixed(1)}/hari</p></div>
                          <div><span className="text-muted-foreground">Habis</span><p className="font-semibold text-[10px]">{p.predictedDate.toLocaleDateString("id-ID")}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="text-xs">Kode</TableHead>
                          <TableHead className="text-right text-xs">Stok</TableHead>
                          <TableHead className="text-right text-xs">Velocity</TableHead>
                          <TableHead className="text-right text-xs">Habis Dalam</TableHead>
                          <TableHead className="text-xs">Tanggal Habis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(p => (
                          <TableRow key={p.productId}>
                            <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " Top" : ""}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.stok}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.velocity.toFixed(1)}/hari</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatDaysLeft(p.daysLeft)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.predictedDate.toLocaleDateString("id-ID")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Aman ({`> ${RULES.ATTENTION_DAYS} hari`}): {predSafe.length} item</p>
          </Card>
          </TabsContent>

          {/* Low Stock */}
          <TabsContent value="low-stock" className="mt-4">
          <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
            <SectionHeader icon={ArrowDown} title={filter === "ALL" ? "10 Stok Paling Sedikit" : `Stok Paling Sedikit - ${FILTER_CHIPS.find((chip) => chip.key === filter)?.label}`} />
            {scopedLowStock.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Tidak ada stok dalam filter ini.
              </p>
            ) : (
            <>
            {isMobile ? (
              <div className="space-y-2">
                {scopedLowStock.map((l, i) => {
                  const label = l.stok === 0 ? "Kosong" : l.stok < 10 ? "Tipis" : "Aman";
                  return (
                    <div key={l.productId} className={`rounded-xl border p-3 transition-all active:scale-[0.99] animate-fade-in ${
                      l.stok === 0 ? "border-l-[3px] border-l-destructive border-border/60" : "border-border/60"
                    }`} style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{i + 1}</span>
                          <span className="font-bold text-sm">{l.kode}{l.isBestSeller ? " Top" : ""}</span>
                          <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                        </div>
                        <span className={`font-mono font-bold tabular-nums ${l.stok === 0 ? "text-destructive" : ""}`}>{l.stok}</span>
                      </div>
                      <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
                        <span>Laku/{RULES.DISPLAY_CYCLE_DAYS} hari</span>
                        <span className="font-semibold tabular-nums text-foreground">{(l.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="w-10 text-xs">#</TableHead>
                      <TableHead className="text-xs">Kode</TableHead>
                      <TableHead className="text-right text-xs">Stok</TableHead>
                      <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS} hari</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedLowStock.map((l, i) => {
                      return (
                        <TableRow key={l.productId}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="font-semibold text-sm">{l.kode}{l.isBestSeller ? " Top" : ""}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${l.stok === 0 ? "text-destructive font-bold" : ""}`}>{l.stok}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{(l.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            </>
            )}
          </Card>
          </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════ PENJUALAN (grouped: Penjualan + Profit) ══════════ */}
        <TabsContent value="penjualan" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid h-7 w-full grid-cols-3 rounded-lg border border-border/70 bg-muted/50 p-[2px] shadow-sm">
              <TabsTrigger value="summary" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Activity className="mr-1 h-3 w-3" />Ringkasan</TabsTrigger>
              <TabsTrigger value="terlaris" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Trophy className="mr-1 h-3 w-3" />Terlaris</TabsTrigger>
              <TabsTrigger value="profit" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><DollarSign className="h-3 w-3 mr-1" />Profit</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-3 space-y-4">
              <SalesTrendCharts
                stockOutData={stockOutData}
                topSellers={topSellers}
                trendItems={trendItems}
                isMobile={isMobile}
              />
            </TabsContent>

            <TabsContent value="terlaris" className="space-y-4 mt-3">
              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={Trophy} title={`${RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris`} subtitle="30 hari terakhir" />
                {isMobile ? (
                  <div className="space-y-2.5">
                    {topSellers.map((t, i) => (
                      <MobileRankedCard key={t.productId} rank={i + 1} kode={t.kode} isBestSeller={t.isBestSeller} index={i}>
                        <div className="grid grid-cols-2 gap-2 text-[11px] mt-1.5">
                          <div><span className="text-muted-foreground">Terjual</span><p className="font-bold tabular-nums">{t.totalQty} pcs</p></div>
                          <div><span className="text-muted-foreground">Hari Data</span><p className="font-semibold tabular-nums">{t.days}{t.days < 7 ? " (baru)" : ""}</p></div>
                          <div><span className="text-muted-foreground">Laku/{RULES.DISPLAY_CYCLE_DAYS} hari</span><p className="font-semibold tabular-nums">{(t.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</p></div>
                          <div><span className="text-muted-foreground">Sisa</span><p className={`font-bold tabular-nums ${t.daysLeft <= 2 ? "text-destructive" : t.daysLeft <= 4 ? "text-warning" : ""}`}>{urgencyIcon(t.daysLeft)} {formatDaysLeft(t.daysLeft)}</p></div>
                        </div>
                      </MobileRankedCard>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="w-10 text-xs">#</TableHead>
                          <TableHead className="text-xs">Kode</TableHead>
                          <TableHead className="text-right text-xs">Terjual</TableHead>
                          <TableHead className="text-right text-xs">Hari Data</TableHead>
                          <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS} hari</TableHead>
                          <TableHead className="text-right text-xs">Stok</TableHead>
                          <TableHead className="text-right text-xs">Sisa Hari</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topSellers.map((t, i) => {
                          const medal = `${i + 1}.`;
                          return (
                            <TableRow key={t.productId}>
                              <TableCell className="font-medium">{medal}</TableCell>
                              <TableCell className="font-semibold text-sm">
                                {t.kode}{t.isBestSeller ? " Top" : ""}{t.days < 7 ? " (baru)" : ""}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{t.totalQty}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{t.days}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{(t.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{t.stok}</TableCell>
                              <TableCell className="text-right text-sm">{urgencyIcon(t.daysLeft)} {formatDaysLeft(t.daysLeft)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Catatan: data kurang dari 7 hari masih bisa berubah lebih cepat.</p>
              </Card>

              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
                <SectionHeader icon={Activity} title="Trend Penjualan 7 Hari" />
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Minggu ini", value: `${totalTW} pcs`, color: "" },
                    { label: "Minggu lalu", value: `${totalLW} pcs`, color: "" },
                    { label: "Perubahan", value: `${overallChange >= 0 ? "+" : ""}${overallChange.toFixed(1)}%`, color: overallChange >= 0 ? "text-success" : "text-destructive" },
                  ].map(s => (
                    <div key={s.label} className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                      <span className="text-muted-foreground">{s.label}: </span>
                      <span className={`font-semibold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
                {isMobile ? (
                  <div className="space-y-2">
                    {trendItems.map((t, i) => {
                      const trendLabel = t.changePct > 10 ? "Naik" : t.changePct < -10 ? "Turun" : "Stabil";
                      return (
                        <div key={t.productId} className="rounded-xl border border-border/60 p-3 space-y-1 animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{trendLabel} | {t.kode}{t.isBestSeller ? " Top" : ""}</span>
                            <span className={`font-mono font-bold text-sm tabular-nums ${t.changePct > 0 ? "text-success" : t.changePct < 0 ? "text-destructive" : ""}`}>
                              {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex gap-4 text-[11px] text-muted-foreground">
                            <span>Minggu ini: <strong className="text-foreground tabular-nums">{t.thisWeek}</strong></span>
                            <span>Lalu: <strong className="text-foreground tabular-nums">{t.lastWeek}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="w-10 text-xs">#</TableHead>
                          <TableHead className="text-xs">Kode</TableHead>
                          <TableHead className="text-right text-xs">Minggu Ini</TableHead>
                          <TableHead className="text-right text-xs">Minggu Lalu</TableHead>
                          <TableHead className="text-right text-xs">Perubahan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trendItems.map((t, i) => {
                          const trendLabel = t.changePct > 10 ? "Naik" : t.changePct < -10 ? "Turun" : "Stabil";
                          return (
                            <TableRow key={t.productId}>
                              <TableCell className="text-xs">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-sm">{trendLabel} | {t.kode}{t.isBestSeller ? " Top" : ""}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{t.thisWeek}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{t.lastWeek}</TableCell>
                              <TableCell className={`text-right font-mono text-sm ${t.changePct > 0 ? "text-success" : t.changePct < 0 ? "text-destructive" : ""}`}>
                                {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(0)}%
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="profit" className="space-y-4 mt-3">
              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={DollarSign} title="Barang Paling Untung" subtitle="30 hari terakhir" />
                {profitItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data profit. Pastikan data harga sudah diisi.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <div className="px-3 py-2 rounded-lg bg-success/10 text-xs">
                        <span className="text-muted-foreground">Total Untung: </span>
                        <span className="font-semibold text-success tabular-nums">{formatRp(profitItems.reduce((s, p) => s + p.totalProfit, 0))}</span>
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                        <span className="text-muted-foreground">Produk: </span>
                        <span className="font-semibold">{profitItems.length}</span>
                      </div>
                    </div>
                    {isMobile ? (
                      <div className="space-y-2.5">
                        {profitItems.slice(0, 20).map((p, i) => (
                          <MobileRankedCard key={p.productId} rank={i + 1} kode={p.kode} isBestSeller={p.isBestSeller} index={i}>
                            <div className="grid grid-cols-2 gap-2 text-[11px] mt-1.5">
                              <div><span className="text-muted-foreground">Total Untung</span><p className="font-bold text-success tabular-nums">{formatRp(p.totalProfit)}</p></div>
                              <div><span className="text-muted-foreground">Terjual</span><p className="font-semibold tabular-nums">{p.totalQty} pcs</p></div>
                              <div><span className="text-muted-foreground">Margin/pcs</span><p className="font-semibold tabular-nums">{formatRp(p.margin)}</p></div>
                              <div><span className="text-muted-foreground">Margin %</span><p className="font-semibold tabular-nums">{p.marginPersen.toFixed(0)}%</p></div>
                            </div>
                          </MobileRankedCard>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">Kode</TableHead>
                              <TableHead className="text-right text-xs">Total Untung</TableHead>
                              <TableHead className="text-right text-xs">Terjual</TableHead>
                              <TableHead className="text-right text-xs">Margin/pcs</TableHead>
                              <TableHead className="text-right text-xs">Margin %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {profitItems.slice(0, 20).map((p, i) => {
                              const medal = `${i + 1}.`;
                              return (
                                <TableRow key={p.productId}>
                                  <TableCell>{medal}</TableCell>
                                  <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " Top" : ""}</TableCell>
                                  <TableCell className="text-right font-mono text-sm font-bold text-success">{formatRp(p.totalProfit)}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{p.totalQty}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{formatRp(p.margin)}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{p.marginPersen.toFixed(0)}%</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════ PELANGGAN ══════════ */}
        <TabsContent value="toko" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="top-toko" className="w-full">
            <TabsList className="w-full grid h-7 grid-cols-2 rounded-lg border border-border/70 bg-muted/50 p-[2px] shadow-sm">
              <TabsTrigger value="top-toko" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Store className="h-3 w-3 mr-1" />Top Toko</TabsTrigger>
              <TabsTrigger value="pelanggan" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Users className="h-3 w-3 mr-1" />Repeat</TabsTrigger>
            </TabsList>

            <TabsContent value="top-toko" className="space-y-4 mt-3">
              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={Store} title="Top Pelanggan" subtitle="30 hari terakhir" />
                {tokoItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data transaksi per toko.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { label: "Pelanggan", value: String(tokoItems.length) },
                        { label: "Total Penjualan", value: `${tokoItems.reduce((s, t) => s + t.totalQty, 0)} pcs` },
                        { label: "Total Nilai", value: formatRp(tokoItems.reduce((s, t) => s + t.totalNilai, 0)) },
                      ].map(s => (
                        <div key={s.label} className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                          <span className="text-muted-foreground">{s.label}: </span>
                          <span className="font-semibold">{s.value}</span>
                        </div>
                      ))}
                    </div>
                    {isMobile ? (
                      <div className="space-y-2.5">
                        {tokoItems.slice(0, 15).map((t, i) => (
                          <MobileRankedCard key={t.nama} rank={i + 1} kode={t.nama} index={i}>
                            <div className="grid grid-cols-2 gap-2 text-[11px] mt-1.5">
                              <div><span className="text-muted-foreground">Qty</span><p className="font-bold tabular-nums">{t.totalQty} pcs</p></div>
                              <div><span className="text-muted-foreground">Nilai</span><p className="font-semibold tabular-nums">{formatRp(t.totalNilai)}</p></div>
                              <div><span className="text-muted-foreground">Transaksi</span><p className="font-semibold tabular-nums">{t.transaksiCount}x</p></div>
                              <div><span className="text-muted-foreground">Hari Aktif</span><p className="font-semibold tabular-nums">{t.hariAktif}</p></div>
                            </div>
                            {t.favorit.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-1 truncate">Favorit: {t.favorit.join(", ")}</p>
                            )}
                          </MobileRankedCard>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">Toko</TableHead>
                              <TableHead className="text-right text-xs">Qty</TableHead>
                              <TableHead className="text-right text-xs">Nilai</TableHead>
                              <TableHead className="text-right text-xs">Transaksi</TableHead>
                              <TableHead className="text-right text-xs">Hari Aktif</TableHead>
                              <TableHead className="text-xs">Favorit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tokoItems.slice(0, 15).map((t, i) => {
                              const medal = `${i + 1}.`;
                              return (
                                <TableRow key={t.nama}>
                                  <TableCell>{medal}</TableCell>
                                  <TableCell className="font-semibold text-sm">{t.nama}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{t.totalQty}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{formatRp(t.totalNilai)}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{t.transaksiCount}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{t.hariAktif}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{t.favorit.join(", ")}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="pelanggan" className="space-y-4 mt-3">
              <RepeatCustomerAnalysis stockOutData={stockOutData} products={products} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════ PERENCANAAN ══════════ */}
        <TabsContent value="planning" className="mt-4 space-y-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="estimate" className="w-full">
            <TabsList className="grid h-7 w-full grid-cols-3 rounded-lg border border-border/70 bg-muted/50 p-[2px] shadow-sm">
              <TabsTrigger value="estimate" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><DollarSign className="mr-1 h-3 w-3" />Estimasi</TabsTrigger>
              <TabsTrigger value="budget" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Calculator className="mr-1 h-3 w-3" />Budget</TabsTrigger>
              <TabsTrigger value="review" className="h-full rounded-md text-[11px] data-[state=active]:shadow-sm"><Sparkles className="mr-1 h-3 w-3" />Review AI</TabsTrigger>
            </TabsList>
            <TabsContent value="estimate" className="mt-3">
              <RestockEstimateList
                estimates={budgetEstimates}
                expandedDays={expandedBudgetDays}
                onToggle={(days) => setExpandedBudgetDays((current) => current === days ? null : days)}
              />
            </TabsContent>
            <TabsContent value="budget" className="mt-3 space-y-4">
              <AnalisaBudgetPlanner
                analyses={analyses}
                budgetAmount={budgetAmount}
                setBudgetAmount={setBudgetAmount}
                budgetDays={budgetDays}
                setBudgetDays={setBudgetDays}
              />
            </TabsContent>
            <TabsContent value="review" className="mt-3 space-y-4">
              <ReviewAI budgetEstimates={budgetEstimates} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════ INSIGHT ══════════ */}
        <TabsContent value="insight" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="ringkasan" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-card/90 p-1 shadow-sm sm:grid-cols-4">
              <TabsTrigger value="ringkasan" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><BarChart3 className="h-3 w-3 mr-1 shrink-0" />Ringkasan</TabsTrigger>
              <TabsTrigger value="hari" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><CalendarIcon className="h-3 w-3 mr-1 shrink-0" />Hari</TabsTrigger>
              <TabsTrigger value="tren" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><Palette className="h-3 w-3 mr-1 shrink-0" />Tren</TabsTrigger>
              <TabsTrigger value="dead" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground py-2"><Skull className="h-3 w-3 mr-1 shrink-0" />Dead</TabsTrigger>
            </TabsList>

            <TabsContent value="ringkasan" className="space-y-4 mt-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { icon: "📦", label: "Jenis Barang", value: String(stats.totalSKU), color: "" },
                  { icon: "🧵", label: "Total Stok", value: `${stats.totalStock.toLocaleString("id-ID")} pcs`, color: "" },
                  { icon: "💵", label: "Nilai Barang", value: formatRp(stats.totalValue), color: "" },
                  { icon: "🔴", label: "Habis", value: String(stats.outOfStock), color: "text-destructive" },
                  { icon: "⚠️", label: "Mau Habis", value: String(stats.criticalCount), color: "text-warning" },
                  { icon: "🔥", label: "Laris", value: String(stats.bestSellerCount), color: "text-primary" },
                ].map((s, idx) => (
                  <div key={s.label} className="rounded-2xl bg-card border border-border/50 shadow-sm p-3.5 animate-fade-in" style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{s.icon}</span>
                      <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
                    </div>
                    <p className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              <Card className="border-0 shadow-sm animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
                <CardContent className="p-4 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground text-sm">Pengaturan Analisa</p>
                  <div className="grid grid-cols-2 gap-1">
                    <p>Siklus belanja: {RULES.CYCLE_DAYS} hari</p>
                    <p>Laris jika laku: {RULES.BESTSELLER_VELOCITY}/hari</p>
                    <p>Dead stock setelah: {RULES.DEAD_STOCK_DAYS} hari</p>
                    <p>Beli minimal: {RULES.BATCH} pcs (BW: {RULES.BATCH_BW})</p>
                    <p>Lead time: {RULES.LEAD_TIME_DAYS} hari</p>
                    <p>WMA: {RULES.WMA_PERIOD1_DAYS} hari ({RULES.WMA_PERIOD1_WEIGHT * 100}%) + sisa ({RULES.WMA_PERIOD2_WEIGHT * 100}%)</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hari" className="space-y-4 mt-3">
              <HariRamaiAnalysis stockOutData={stockOutData} />
            </TabsContent>

            <TabsContent value="tren" className="space-y-4 mt-3">
              <ColorTrendAnalysis products={products} stockOutData={stockOutData} />
            </TabsContent>

            <TabsContent value="dead" className="space-y-4 mt-3">
              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={Skull} title={`Barang Tidak Laku (${RULES.DEAD_STOCK_DAYS}+ hari)`} />
                {deadStock.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-success text-lg">OK</p>
                    <p className="text-sm font-medium mt-1">Semua barang laku!</p>
                    <p className="text-xs text-muted-foreground">Tidak ada yang macet</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { label: "Jumlah", value: `${deadStock.length} barang` },
                        { label: "Stok macet", value: `${deadStock.reduce((s, d) => s + d.stok, 0)} pcs` },
                        { label: "Uang nyangkut", value: formatRp(deadStock.reduce((s, d) => s + d.nilai, 0)) },
                      ].map(s => (
                        <div key={s.label} className="px-3 py-2 rounded-lg bg-destructive/10 text-xs">
                          <span className="text-muted-foreground">{s.label}: </span>
                          <span className="font-semibold">{s.value}</span>
                        </div>
                      ))}
                    </div>
                    {isMobile ? (
                      <div className="space-y-2.5">
                        {deadStock.map((d, i) => (
                          <div key={d.productId} className="rounded-xl border border-l-[3px] border-l-destructive border-border/60 p-3.5 space-y-1.5 transition-all active:scale-[0.99] animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                                <span className="font-bold text-sm">{d.kode}</span>
                              </div>
                              <span className="font-mono font-bold text-destructive tabular-nums">{d.daysSinceLastSale} hari</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              <div><span className="text-muted-foreground">Stok</span><p className="font-semibold tabular-nums">{d.stok}</p></div>
                              <div><span className="text-muted-foreground">Nilai</span><p className="font-semibold tabular-nums">{formatRp(d.nilai)}</p></div>
                              <div><span className="text-muted-foreground">Terakhir</span><p className="font-semibold text-[10px]">{d.lastSaleDate ? d.lastSaleDate.toLocaleDateString("id-ID") : "Tidak pernah"}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">Kode</TableHead>
                              <TableHead className="text-right text-xs">Stok</TableHead>
                              <TableHead className="text-right text-xs">Nilai</TableHead>
                              <TableHead className="text-right text-xs">Tidak Laku</TableHead>
                              <TableHead className="text-xs">Terakhir Laku</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {deadStock.map((d, i) => (
                              <TableRow key={d.productId}>
                                <TableCell className="text-xs">{i + 1}</TableCell>
                                <TableCell className="font-semibold text-sm">{d.kode}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{d.stok}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatRp(d.nilai)}</TableCell>
                                <TableCell className="text-right font-mono text-sm text-destructive">{d.daysSinceLastSale} hari</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{d.lastSaleDate ? d.lastSaleDate.toLocaleDateString("id-ID") : "Tidak pernah"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">💡 Saran: jual obral atau kasih promo untuk barang-barang ini</p>
                  </>
                )}
              </Card>
            </TabsContent>

          </Tabs>
        </TabsContent>
      </Tabs>

      <ProductDetailExpand
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        item={selectedProduct}
        trendInfo={selectedProduct ? trendData[selectedProduct.productId] : null}
        lastSaleDate={selectedProduct ? lastSaleDates[selectedProduct.productId] : null}
        lastDayBuyers={selectedProduct ? lastDayBuyers[selectedProduct.productId] : null}
        prevSaleDate={selectedProduct ? prevSaleDates[selectedProduct.productId] : null}
        prevDayBuyers={selectedProduct ? prevDayBuyers[selectedProduct.productId] : null}
      />
    </div>
  );
};

export default Analisa;

