import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertTriangle, Package, Skull,
  BarChart3, DollarSign, Store, ArrowDown,
  ShoppingCart, Clock, Trophy, Activity,
  Wallet, Flame, TrendingUp,
  Calculator, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, Palette, Calendar as CalendarIcon, Users,
  Plus, Send, Loader2, Lock
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

const ReviewAI = lazy(() => import("@/components/analisa/ReviewAI"));
const ColorTrendAnalysis = lazy(() => import("@/components/analisa/ColorTrendAnalysis"));
const HariRamaiAnalysis = lazy(() => import("@/components/analisa/HariRamaiAnalysis"));
const RepeatCustomerAnalysis = lazy(() => import("@/components/analisa/RepeatCustomerAnalysis"));


// ─── Formatting Helpers ───────────────────────────────────

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDaysLeft(d: number): string {
  if (d >= 999) return "∞";
  if (d < 1) return "< 1hr";
  return Math.round(d) + "hr";
}

function urgencyIcon(days: number) {
  if (days <= RULES.CRITICAL_DAYS) return "🔴";
  if (days <= RULES.WARNING_DAYS) return "🟠";
  if (days <= RULES.ATTENTION_DAYS) return "🟡";
  return "🟢";
}

// ─── Types ────────────────────────────────────────────────

type FilterChip = "ALL" | "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";
type PriorityLevel = "critical" | "high" | "medium" | "safe";

const PRIORITY_ORDER: Record<PriorityLevel, number> = { critical: 0, high: 1, medium: 2, safe: 3 };

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

const PRIORITY_LEGEND = [
  { color: "bg-destructive", label: "Kritis", desc: "stok hampir habis" },
  { color: "bg-warning", label: "Segera Habis", desc: "perlu perhatian" },
  { color: "bg-accent", label: "Perhatian", desc: "monitor" },
  { color: "bg-success", label: "Aman", desc: "stok cukup" },
];

const FILTER_CHIPS: { key: FilterChip; label: string; icon: string; activeClass: string }[] = [
  { key: "CRITICAL", label: "Critical", icon: "🔴", activeClass: "bg-destructive text-destructive-foreground" },
  { key: "WARNING", label: "<4 Hari", icon: "🟠", activeClass: "bg-warning text-warning-foreground" },
  { key: "ATTENTION", label: "Perhatian", icon: "🟡", activeClass: "bg-accent text-accent-foreground" },
  { key: "SAFE", label: "Aman", icon: "🟢", activeClass: "bg-success text-success-foreground" },
  { key: "ALL", label: "Semua", icon: "🔵", activeClass: "bg-primary text-primary-foreground" },
];

const STATUS_BADGE: Record<DosStatus, { label: string; className: string }> = {
  CRITICAL: { label: "CRITICAL", className: "bg-destructive/15 text-destructive border-destructive/30" },
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
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
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
          <span className="text-xs text-muted-foreground font-mono">{typeof rank === 'number' && rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `#${rank}`}</span>
          <span className="font-bold text-sm">{kode}</span>
          {isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

const Analisa = () => {
  const { products, stockOutData, isLoading } = useSalesAnalysis();
  const [filter, setFilter] = useState<FilterChip>("ALL");
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

  const filtered = useMemo(() => {
    const base = filter === "ALL" ? analyses : analyses.filter((a) => a.dosStatus === filter);
    return [...base].sort((a, b) => PRIORITY_ORDER[getPriorityLevel(a.dosStatus)] - PRIORITY_ORDER[getPriorityLevel(b.dosStatus)]);
  }, [analyses, filter]);

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
  }, [filter]);

  // Action Summary computed values
  const criticalCount = counts.critical;
  const warningCount = counts.warning;
  const zeroStockCount = useMemo(() => analyses.filter(a => a.isStockOut).length, [analyses]);
  const totalRestockCost = useMemo(() => {
    const items = filter === "ALL" ? analyses : filtered;
    return items.reduce((s, a) => s + a.cost, 0);
  }, [analyses, filtered, filter]);
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
  const profitItems = useMemo(() => calcProfit(products, stockOutData), [products, stockOutData]);
  const tokoItems = useMemo(() => calcTokoAnalysis(products, stockOutData), [products, stockOutData]);
  const budgetEstimates = useMemo(() => DAYS_PRESETS.map((days) => buildBudgetEstimateFromAnalyses(analyses, days)), [analyses]);
  const stats = useMemo(() => calcStats(products, stockOutData), [products, stockOutData]);

  if (isLoading) {
    return <AnalisaSkeleton />;
  }

  const predCritical = predictions.filter(p => p.urgency === "critical");
  const predWarning = predictions.filter(p => p.urgency === "warning");
  const predAttention = predictions.filter(p => p.urgency === "attention");
  const predSafe = predictions.filter(p => p.urgency === "safe");

  const totalTW = trendItems.reduce((s, t) => s + t.thisWeek, 0);
  const totalLW = trendItems.reduce((s, t) => s + t.lastWeek, 0);
  const overallChange = totalLW > 0 ? ((totalTW - totalLW) / totalLW * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full overflow-y-auto overflow-x-hidden pb-24 md:pb-6">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🔴 ACTION SUMMARY BAR — STICKY */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md pb-3 -mx-4 px-4 md:-mx-6 md:px-6 pt-2 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight">Analisa</h1>
              <p className="text-[10px] text-muted-foreground">
                {analyses.length} SKU · WMA {RULES.WMA_PERIOD1_DAYS}d · cycle {RULES.CYCLE_DAYS}d
              </p>
            </div>
          </div>
          {needsReorder > 0 && (
            <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              {needsReorder} restock
            </Badge>
          )}
        </div>

        {/* 4-Card Action Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={() => setFilter(filter === "CRITICAL" ? "ALL" : "CRITICAL")}
            className={`relative overflow-hidden card-premium bg-destructive/5 p-3.5 text-left transition-all duration-200 active:scale-[0.97] animate-fade-in ${
              filter === "CRITICAL" ? "ring-2 ring-destructive shadow-md" : ""
            }`}
            style={{ animationDelay: "0ms", animationFillMode: "both" }}
          >
            <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-destructive/8" />
            <span className="text-lg">🚨</span>
            <p className="text-2xl font-black text-destructive tabular-nums mt-1">{criticalCount || "—"}</p>
            <p className="text-[10px] font-medium text-destructive/70 mt-0.5">Harus Restock</p>
          </button>

          <button
            onClick={() => setFilter(filter === "WARNING" ? "ALL" : "WARNING")}
            className={`relative overflow-hidden card-premium bg-warning/5 p-3.5 text-left transition-all duration-200 active:scale-[0.97] animate-fade-in ${
              filter === "WARNING" ? "ring-2 ring-warning shadow-md" : ""
            }`}
            style={{ animationDelay: "60ms", animationFillMode: "both" }}
          >
            <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-warning/8" />
            <span className="text-lg">⚠️</span>
            <p className="text-2xl font-black text-warning tabular-nums mt-1">{warningCount || "—"}</p>
            <p className="text-[10px] font-medium text-warning/70 mt-0.5">Segera Habis</p>
          </button>

          <button
            onClick={() => setFilter(filter === "CRITICAL" ? "ALL" : "CRITICAL")}
            className="relative overflow-hidden card-premium bg-muted/30 p-3.5 text-left transition-all duration-200 active:scale-[0.97] animate-fade-in"
            style={{ animationDelay: "120ms", animationFillMode: "both" }}
          >
            <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-muted/40" />
            <span className="text-lg">📦</span>
            <p className="text-2xl font-black tabular-nums mt-1">{zeroStockCount || "—"}</p>
            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">Stok Kosong</p>
          </button>

          <div
            className="relative overflow-hidden card-premium bg-primary/5 p-3.5 text-left animate-fade-in"
            style={{ animationDelay: "180ms", animationFillMode: "both" }}
          >
            <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-primary/5" />
            <span className="text-lg">💰</span>
            <p className="text-base font-black tabular-nums mt-1 truncate">{formatRp(totalRestockCost)}</p>
            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">Modal Restock</p>
          </div>
        </div>
      </div>


      {/* MAIN CONTENT — TABS */}
      <Tabs defaultValue="restock" className="w-full">
        <div className="rounded-2xl bg-card/80 backdrop-blur-sm border border-border/40 shadow-md p-1.5">
          <TabsList className="grid grid-cols-3 w-full bg-transparent h-auto p-0 gap-1">
            {[
              { value: "restock", icon: ShoppingCart, label: "Restock", mobileLabel: "Restock", badge: needsReorder > 0 ? needsReorder : null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "penjualan", icon: Trophy, label: "Penjualan", mobileLabel: "Jual", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "insight", icon: BarChart3, label: "Lainnya", mobileLabel: "Lainnya", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`relative rounded-xl ${tab.activeColor} data-[state=active]:shadow-lg data-[state=active]:scale-[1.02] data-[state=inactive]:hover:bg-muted/60 text-[11px] md:text-xs px-1.5 md:px-3 py-2.5 font-semibold gap-1 md:gap-1.5 transition-all duration-200 ease-out flex flex-col md:flex-row items-center`}
              >
                <div className="relative">
                  <tab.icon className="h-4 w-4 shrink-0" />
                  {tab.badge && (
                    <span className="md:hidden absolute -top-1.5 -right-2 h-4 min-w-[16px] px-1 text-[9px] rounded-full bg-destructive text-destructive-foreground flex items-center justify-center font-bold">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] md:text-xs leading-tight">{tab.mobileLabel}</span>
                {tab.badge && (
                  <Badge variant="destructive" className="hidden md:flex ml-0.5 h-4 min-w-[16px] px-1 text-[9px] rounded-full shrink-0 animate-pulse">
                    {tab.badge}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ══════════ RESTOCK ══════════ */}
        <TabsContent value="restock" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          {/* Inline filter bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_CHIPS.map((chip) => {
              const isActive = filter === chip.key;
              const count = chip.key === "ALL"
                ? analyses.length
                : counts[chip.key.toLowerCase() as keyof typeof counts];
              return (
                <button
                  key={chip.key}
                  onClick={() => { setFilter(chip.key); setFilterKey(k => k + 1); setVisibleCount(30); }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? `${chip.activeClass} shadow-sm`
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/70 active:scale-95"
                  }`}
                >
                  <span className="text-xs">{chip.icon}</span>
                  {chip.label}
                  <span className={`text-[10px] tabular-nums ${isActive ? "opacity-90" : "opacity-50"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div key={`s-${filterKey}`} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground animate-fade-in">
            <span>Ditampilkan: <strong className="text-foreground">{filtered.length}</strong></span>
            <span className="text-border">·</span>
            <span>Perlu reorder: <strong className="text-foreground">{needsReorder}</strong></span>
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
                      <TableHead className="text-right hidden sm:table-cell">Vel/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
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
                              {a.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                              {a.isStockOut && <span className="text-xs">🚨</span>}
                              {priority === "critical" && <span className="text-[10px] font-bold text-destructive">HOT</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{a.nama}</div>
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
                          <p className="text-sm">Tidak ada produk dalam kategori ini</p>
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
                <p className="text-sm text-muted-foreground">Tidak ada produk dalam kategori ini</p>
              </div>
            ) : (
              paginatedFiltered.map((a, idx) => {
                const globalIdx = idx;
                const badge = STATUS_BADGE[a.dosStatus];
                const priority = getPriorityLevel(a.dosStatus);
                const isZeroStock = a.currentStock === 0;
                const ringClass =
                  a.dosStatus === "CRITICAL" ? "border-l-[3px] border-l-destructive border-border/60" :
                  a.dosStatus === "WARNING" ? "border-l-[3px] border-l-warning border-border/60" :
                  a.dosStatus === "ATTENTION" ? "border-l-[3px] border-l-accent border-border/60" : "border-l-[3px] border-l-success border-border/60";

                return (
                  <button
                    key={a.productId}
                    onClick={() => openProductDrawer(a)}
                    className={`rounded-xl border bg-card p-3.5 transition-all active:scale-[0.99] w-full text-left ${ringClass} ${PRIORITY_ROW_BG[priority]} animate-fade-in`}
                    style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sm truncate">{a.kode}</span>
                        {priority === "critical" && <span className="text-[10px] font-bold text-destructive">HOT</span>}
                        {a.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning shrink-0" />}
                        {a.isStockOut && <span className="text-xs shrink-0">🚨</span>}
                        <Badge variant="outline" className={`text-[9px] font-semibold shrink-0 ${badge.className}`}>
                          {badge.label}
                        </Badge>
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
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-bold text-sm">
                            {a.recommendedQty}
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

          <Card className="border-0 shadow-sm p-5 space-y-4 animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
            <SectionHeader icon={Clock} title="Prediksi Kehabisan Stok" subtitle="Berdasarkan velocity saat ini" />
            {[
              { items: predCritical, label: `Kritis — ≤${RULES.CRITICAL_DAYS} hari`, color: "text-destructive", dot: "bg-destructive" },
              { items: predWarning, label: `Warning — ${RULES.CRITICAL_DAYS + 1}-${RULES.WARNING_DAYS} hari`, color: "text-warning", dot: "bg-warning" },
              { items: predAttention, label: `Perhatian — ${RULES.WARNING_DAYS + 1}-${RULES.ATTENTION_DAYS} hari`, color: "text-accent", dot: "bg-accent" },
            ].map(({ items, label, color, dot }) => items.length > 0 && (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <h4 className={`text-xs font-semibold ${color}`}>{label} ({items.length})</h4>
                </div>
                {isMobile ? (
                  <div className="space-y-2">
                    {items.map((p, pIdx) => (
                      <div key={p.productId} className={`rounded-xl border p-3 space-y-1.5 animate-fade-in ${
                        p.urgency === "critical" ? "border-l-[3px] border-l-destructive border-border/60" : "border-border/60"
                      }`} style={{ animationDelay: `${Math.min(pIdx * 30, 300)}ms`, animationFillMode: "both" }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">{p.kode}{p.isBestSeller ? " 🔥" : ""}</span>
                          <span className={`font-mono font-bold tabular-nums ${color}`}>{formatDaysLeft(p.daysLeft)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div><span className="text-muted-foreground">Stok</span><p className="font-semibold tabular-nums">{p.stok}</p></div>
                          <div><span className="text-muted-foreground">Vel</span><p className="font-semibold tabular-nums">{p.velocity.toFixed(1)}/hr</p></div>
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
                            <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.stok}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.velocity.toFixed(1)}/hr</TableCell>
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
            <p className="text-xs text-muted-foreground">🟢 Aman ({`>${RULES.ATTENTION_DAYS} hari`}): {predSafe.length} item</p>
          </Card>

          {/* Low Stock */}
          <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
            <SectionHeader icon={ArrowDown} title="10 Stok Paling Sedikit" />
            {isMobile ? (
              <div className="space-y-2">
                {lowStock.map((l, i) => {
                  const icon = l.stok === 0 ? "🔴" : l.stok < 10 ? "🟡" : "🟢";
                  return (
                    <div key={l.productId} className={`rounded-xl border p-3 transition-all active:scale-[0.99] animate-fade-in ${
                      l.stok === 0 ? "border-l-[3px] border-l-destructive border-border/60" : "border-border/60"
                    }`} style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{i + 1}</span>
                          <span className="font-bold text-sm">{icon} {l.kode}{l.isBestSeller ? " 🔥" : ""}</span>
                        </div>
                        <span className={`font-mono font-bold tabular-nums ${l.stok === 0 ? "text-destructive" : ""}`}>{l.stok}</span>
                      </div>
                      <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
                        <span>Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</span>
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
                      <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.map((l, i) => {
                      const icon = l.stok === 0 ? "🔴" : l.stok < 10 ? "🟡" : "🟢";
                      return (
                        <TableRow key={l.productId}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="font-semibold text-sm">{icon} {l.kode}{l.isBestSeller ? " 🔥" : ""}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${l.stok === 0 ? "text-destructive font-bold" : ""}`}>{l.stok}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{(l.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ PENJUALAN (grouped: Penjualan + Profit) ══════════ */}
        <TabsContent value="penjualan" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="laris" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-9 rounded-xl bg-muted/50">
              <TabsTrigger value="laris" className="text-xs rounded-lg data-[state=active]:shadow-sm"><Trophy className="h-3.5 w-3.5 mr-1" />Laris</TabsTrigger>
              <TabsTrigger value="profit" className="text-xs rounded-lg data-[state=active]:shadow-sm"><DollarSign className="h-3.5 w-3.5 mr-1" />Profit</TabsTrigger>
            </TabsList>

            <TabsContent value="laris" className="space-y-4 mt-3">
              <SalesTrendCharts
                stockOutData={stockOutData}
                topSellers={topSellers}
                trendItems={trendItems}
                isMobile={isMobile}
              />

              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={Trophy} title={`${RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris`} subtitle="30 hari terakhir" />
                {isMobile ? (
                  <div className="space-y-2.5">
                    {topSellers.map((t, i) => (
                      <MobileRankedCard key={t.productId} rank={i + 1} kode={t.kode} isBestSeller={t.isBestSeller} index={i}>
                        <div className="grid grid-cols-2 gap-2 text-[11px] mt-1.5">
                          <div><span className="text-muted-foreground">Terjual</span><p className="font-bold tabular-nums">{t.totalQty} pcs</p></div>
                          <div><span className="text-muted-foreground">Hari Data</span><p className="font-semibold tabular-nums">{t.days}{t.days < 7 ? " ⚠️" : ""}</p></div>
                          <div><span className="text-muted-foreground">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</span><p className="font-semibold tabular-nums">{(t.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</p></div>
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
                          <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                          <TableHead className="text-right text-xs">Stok</TableHead>
                          <TableHead className="text-right text-xs">Sisa Hari</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topSellers.map((t, i) => {
                          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                          return (
                            <TableRow key={t.productId}>
                              <TableCell className="font-medium">{medal}</TableCell>
                              <TableCell className="font-semibold text-sm">
                                {t.kode}{t.isBestSeller ? " 🔥" : ""}{t.days < 7 ? " ⚠️" : ""}
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
                <p className="text-[11px] text-muted-foreground">⚠️ = data &lt; 7 hari (mungkin belum akurat)</p>
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
                      const icon = t.changePct > 10 ? "📈" : t.changePct < -10 ? "📉" : "➡️";
                      return (
                        <div key={t.productId} className="rounded-xl border border-border/60 p-3 space-y-1 animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{icon} {t.kode}{t.isBestSeller ? " 🔥" : ""}</span>
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
                          const icon = t.changePct > 10 ? "📈" : t.changePct < -10 ? "📉" : "➡️";
                          return (
                            <TableRow key={t.productId}>
                              <TableCell className="text-xs">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-sm">{icon} {t.kode}{t.isBestSeller ? " 🔥" : ""}</TableCell>
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
                              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                              return (
                                <TableRow key={p.productId}>
                                  <TableCell>{medal}</TableCell>
                                  <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
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

        {/* Toko content merged into Insight tab below */}
        <TabsContent value="toko" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="top-toko" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-9 rounded-xl bg-muted/50">
              <TabsTrigger value="top-toko" className="text-xs rounded-lg data-[state=active]:shadow-sm"><Store className="h-3.5 w-3.5 mr-1" />Top Toko</TabsTrigger>
              <TabsTrigger value="pelanggan" className="text-xs rounded-lg data-[state=active]:shadow-sm"><Users className="h-3.5 w-3.5 mr-1" />Repeat</TabsTrigger>
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
                              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
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
              <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
                <RepeatCustomerAnalysis stockOutData={stockOutData} products={products} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════ INSIGHT (grouped: Ringkasan + Hari + Tren + Dead + Budget + Review) ══════════ */}
        <TabsContent value="insight" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Tabs defaultValue="ringkasan" className="w-full">
            <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto rounded-xl bg-muted/50 gap-1 p-1">
              <TabsTrigger value="ringkasan" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><BarChart3 className="h-3.5 w-3.5 mr-1 shrink-0" />Ringkasan</TabsTrigger>
              <TabsTrigger value="hari" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><CalendarIcon className="h-3.5 w-3.5 mr-1 shrink-0" />Hari</TabsTrigger>
              <TabsTrigger value="tren" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><Palette className="h-3.5 w-3.5 mr-1 shrink-0" />Tren</TabsTrigger>
              <TabsTrigger value="dead" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground py-2"><Skull className="h-3.5 w-3.5 mr-1 shrink-0" />Dead</TabsTrigger>
              <TabsTrigger value="budget" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><Calculator className="h-3.5 w-3.5 mr-1 shrink-0" />Budget</TabsTrigger>
              <TabsTrigger value="review" className="text-[10px] md:text-xs rounded-lg data-[state=active]:shadow-sm py-2"><Sparkles className="h-3.5 w-3.5 mr-1 shrink-0" />Review</TabsTrigger>
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

              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
                <SectionHeader icon={DollarSign} title="Estimasi Budget Restock" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {budgetEstimates.map((e) => {
                    const label = e.days === 4 ? "1 siklus" : e.days === 7 ? "1 minggu" : e.days === 14 ? "2 minggu" : e.days === 21 ? "3 minggu" : "1 bulan";
                    const isExpanded = expandedBudgetDays === e.days;
                    return (
                      <div key={e.days} className="space-y-0">
                        <button
                          onClick={() => setExpandedBudgetDays(isExpanded ? null : e.days)}
                          className={`w-full text-left p-4 rounded-xl space-y-1 transition-colors ${
                            isExpanded ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-xs text-muted-foreground">{e.days} hari · {label}</p>
                          <p className="text-lg font-bold tabular-nums">{formatRp(e.cost)}</p>
                          <p className="text-[11px] text-muted-foreground">{e.items} item · {e.qty} pcs · <span className="underline">Lihat daftar ▾</span></p>
                        </button>
                        {isExpanded && (
                          <div className="mt-2 rounded-lg border bg-background p-2 space-y-1 max-h-[400px] overflow-y-auto">
                            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] text-muted-foreground font-medium px-1 pb-1 border-b">
                              <span>Kode</span>
                              <span className="text-right">Stok</span>
                              <span className="text-right">Beli</span>
                              <span className="text-right">Biaya</span>
                            </div>
                            {e.details.map((d) => (
                              <div key={d.productId} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center text-xs px-1 py-1 rounded ${
                                d.daysLeft <= RULES.CRITICAL_DAYS ? "bg-destructive/10" : d.isBestSeller ? "bg-primary/5" : ""
                              }`}>
                                <span className="font-mono text-[11px] truncate flex items-center gap-1">
                                  {d.daysLeft <= RULES.CRITICAL_DAYS ? "🔴" : d.isBestSeller ? "⭐" : ""}
                                  {d.kode}
                                </span>
                                <span className={`text-right tabular-nums ${d.stok === 0 ? "text-destructive font-bold" : d.stok <= 5 ? "text-warning" : ""}`}>{d.stok}</span>
                                <span className="text-right tabular-nums font-semibold">{d.qty}</span>
                                <span className="text-right tabular-nums text-muted-foreground">{formatRp(d.cost)}</span>
                              </div>
                            ))}
                            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-xs font-bold px-1 pt-1 border-t">
                              <span>Total</span>
                              <span></span>
                              <span className="text-right tabular-nums">{e.qty}</span>
                              <span className="text-right tabular-nums">{formatRp(e.cost)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="border-0 shadow-sm animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
                <CardContent className="p-4 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground text-sm">⚙️ Pengaturan Analisa</p>
                  <div className="grid grid-cols-2 gap-1">
                    <p>Siklus belanja: {RULES.CYCLE_DAYS} hari</p>
                    <p>Laris jika laku: {RULES.BESTSELLER_VELOCITY}/hari</p>
                    <p>Dead stock setelah: {RULES.DEAD_STOCK_DAYS} hari</p>
                    <p>Beli minimal: {RULES.BATCH} pcs (BW: {RULES.BATCH_BW})</p>
                    <p>Lead time: {RULES.LEAD_TIME_DAYS} hari</p>
                    <p>WMA: {RULES.WMA_PERIOD1_DAYS}hr ({RULES.WMA_PERIOD1_WEIGHT * 100}%) + sisa ({RULES.WMA_PERIOD2_WEIGHT * 100}%)</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hari" className="space-y-4 mt-3">
              <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
                <HariRamaiAnalysis stockOutData={stockOutData} />
              </Suspense>
            </TabsContent>

            <TabsContent value="tren" className="space-y-4 mt-3">
              <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
                <ColorTrendAnalysis products={products} stockOutData={stockOutData} />
              </Suspense>
            </TabsContent>

            <TabsContent value="dead" className="space-y-4 mt-3">
              <Card className="border-0 shadow-sm p-5 space-y-3 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
                <SectionHeader icon={Skull} title={`Barang Tidak Laku (${RULES.DEAD_STOCK_DAYS}+ hari)`} />
                {deadStock.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-success text-lg">✅</p>
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

            <TabsContent value="budget" className="space-y-4 mt-3">
              <AnalisaBudgetPlanner
                analyses={analyses}
                budgetAmount={budgetAmount}
                setBudgetAmount={setBudgetAmount}
                budgetDays={budgetDays}
                setBudgetDays={setBudgetDays}
              />
            </TabsContent>

            <TabsContent value="review" className="space-y-4 mt-3">
              <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
                <ReviewAI budgetEstimates={budgetEstimates} />
              </Suspense>
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

