import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  AlertTriangle, Package, Skull,
  BarChart3, DollarSign, Store, ArrowDown,
  ShoppingCart, Clock, Trophy, Activity,
  AlertCircle, PackageX, Wallet, Flame, TrendingUp, TrendingDown,
  Calculator, CheckCircle2
} from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, RULES, type DosStatus, type ProductAnalysis, isBlackWhiteCode } from "@/lib/stockAnalyticsEngine";
import {
  calcTrend, calcDeadStock, calcLowStock,
  calcPredictions, calcProfit, calcTokoAnalysis, calcBudgetEstimates, calcStats,
} from "@/lib/analysisFeatures";

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

const FILTER_CHIPS: { key: FilterChip; label: string; icon: string; activeClass: string }[] = [
  { key: "CRITICAL", label: "Critical", icon: "🔴", activeClass: "bg-destructive text-destructive-foreground" },
  { key: "WARNING", label: "<4 Hari", icon: "🟠", activeClass: "bg-warning text-warning-foreground" },
  { key: "ATTENTION", label: "Perhatian", icon: "🟡", activeClass: "bg-amber-500 text-white" },
  { key: "SAFE", label: "Aman", icon: "🟢", activeClass: "bg-success text-success-foreground" },
  { key: "ALL", label: "Semua", icon: "🔵", activeClass: "bg-primary text-primary-foreground" },
];

const STATUS_BADGE: Record<DosStatus, { label: string; className: string }> = {
  CRITICAL: { label: "CRITICAL", className: "bg-destructive/15 text-destructive border-destructive/30" },
  WARNING: { label: "SEGERA", className: "bg-warning/15 text-warning border-warning/30" },
  ATTENTION: { label: "PERHATIAN", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
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

const BUDGET_PRESETS = [1000000, 2000000, 3000000, 5000000, 10000000];
const DAYS_PRESETS = [3, 5, 7, 14];

function BudgetPlanner({
  analyses,
  budgetAmount,
  setBudgetAmount,
  budgetDays,
  setBudgetDays,
}: {
  analyses: ProductAnalysis[];
  budgetAmount: number;
  setBudgetAmount: (v: number) => void;
  budgetDays: number;
  setBudgetDays: (v: number) => void;
}) {
  const recommendations = useMemo(() => {
    const sorted = [...analyses]
      .filter(a => a.velocity > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    type RecItem = { item: ProductAnalysis; qty: number; cost: number; reason: string };
    const result: RecItem[] = [];
    let remaining = budgetAmount;

    // Step 1: Calculate ideal qty for ALL products that need restock
    const candidates: { item: ProductAnalysis; idealQty: number; idealCost: number; reason: string; batch: number; minOrder: number }[] = [];

    for (const item of sorted) {
      const neededStock = Math.ceil(item.velocity * budgetDays);
      const deficit = neededStock - item.currentStock;
      if (deficit <= 0) continue;

      const isBW = isBlackWhiteCode(item.kode);
      const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
      const minOrder = isBW ? RULES.BATCH_BW : RULES.MIN_ORDER_PER_CODE;
      const qty = Math.max(minOrder, Math.ceil(deficit / batch) * batch);
      const cost = qty * item.unitPrice;
      const reason = item.daysOfStock <= RULES.CRITICAL_DAYS ? "🔴 Kritis" :
        item.daysOfStock <= RULES.WARNING_DAYS ? "🟠 Segera habis" :
        item.isStockOut ? "🚨 Stok kosong" : "📦 Perlu restock";
      candidates.push({ item, idealQty: qty, idealCost: cost, reason, batch, minOrder });
    }

    const totalIdealCost = candidates.reduce((s, c) => s + c.idealCost, 0);

    if (totalIdealCost <= budgetAmount) {
      // Budget cukup untuk semua — beli semua ideal qty
      for (const c of candidates) {
        result.push({ item: c.item, qty: c.idealQty, cost: c.idealCost, reason: c.reason });
        remaining -= c.idealCost;
      }

      // Sisa budget → top-up extended coverage (2x target days)
      const pickedIds = new Set(result.map(r => r.item.productId));
      if (remaining > 0) {
        const extendedDays = budgetDays * 2;
        for (const item of sorted) {
          if (remaining <= 0) break;
          if (pickedIds.has(item.productId)) continue;
          const neededStock = Math.ceil(item.velocity * extendedDays);
          const deficit = neededStock - item.currentStock;
          if (deficit <= 0) continue;
          const isBW = isBlackWhiteCode(item.kode);
          const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
          const minOrder = isBW ? RULES.BATCH_BW : RULES.MIN_ORDER_PER_CODE;
          let qty = Math.max(minOrder, Math.ceil(deficit / batch) * batch);
          let cost = qty * item.unitPrice;
          if (cost > remaining) {
            qty = Math.floor(Math.floor(remaining / item.unitPrice) / batch) * batch;
            if (qty < minOrder) continue;
            cost = qty * item.unitPrice;
          }
          result.push({ item, qty, cost, reason: "🔄 Top-up stok" });
          remaining -= cost;
          pickedIds.add(item.productId);
        }
      }

      // Still remaining → extra batch to best sellers
      if (remaining > 0) {
        for (const r of [...result]) {
          if (remaining <= 0) break;
          if (!r.item.isBestSeller) continue;
          const isBW = isBlackWhiteCode(r.item.kode);
          const batch = isBW ? RULES.BATCH_BW : RULES.BATCH;
          const cost = batch * r.item.unitPrice;
          if (cost <= remaining) {
            r.qty += batch;
            r.cost += cost;
            r.reason = "🔥 Best seller + extra";
            remaining -= cost;
          }
        }
      }
    } else {
      // Budget TIDAK cukup → 3-Tier Waterfall Algorithm
      const tier1: typeof candidates = []; // Urgent: stok habis / critical (≤2 hari)
      const tier2: typeof candidates = []; // Best seller dengan stok > critical
      const tier3: typeof candidates = []; // Sisanya

      for (const c of candidates) {
        const isUrgent = c.item.isStockOut || c.item.daysOfStock <= RULES.CRITICAL_DAYS;
        if (isUrgent) {
          tier1.push(c);
        } else if (c.item.isBestSeller) {
          tier2.push(c);
        } else {
          tier3.push(c);
        }
      }

      // --- Tier 1: Urgent → full coverage (wajib beli) ---
      for (const c of tier1) {
        if (remaining <= 0) break;
        let qty = c.idealQty;
        let cost = c.idealCost;
        if (cost > remaining) {
          // Budget tidak cukup bahkan untuk urgent → beli sebisanya
          qty = Math.floor(Math.floor(remaining / c.item.unitPrice) / c.batch) * c.batch;
          if (qty < c.minOrder) continue;
          cost = qty * c.item.unitPrice;
        }
        result.push({ item: c.item, qty, cost, reason: c.item.isStockOut ? "🚨 Stok kosong" : "🔴 Kritis" });
        remaining -= cost;
      }

      // --- Tier 2: Best seller → full coverage ---
      for (const c of tier2) {
        if (remaining <= 0) break;
        let qty = c.idealQty;
        let cost = c.idealCost;
        if (cost > remaining) {
          qty = Math.floor(Math.floor(remaining / c.item.unitPrice) / c.batch) * c.batch;
          if (qty < c.minOrder) continue;
          cost = qty * c.item.unitPrice;
        }
        result.push({ item: c.item, qty, cost, reason: "🔥 Best seller" });
        remaining -= cost;
      }

      // --- Tier 3: Sisanya → proporsional berdasarkan combinedScore ---
      if (remaining > 0 && tier3.length > 0) {
        const tier3TotalCost = tier3.reduce((s, c) => s + c.idealCost, 0);
        const ratio = Math.min(1, remaining / tier3TotalCost);

        for (const c of tier3) {
          if (remaining <= 0) break;
          const scaledQty = Math.ceil(c.idealQty * ratio);
          let qty = Math.max(c.minOrder, Math.ceil(scaledQty / c.batch) * c.batch);
          let cost = qty * c.item.unitPrice;
          if (cost > remaining) {
            qty = Math.floor(Math.floor(remaining / c.item.unitPrice) / c.batch) * c.batch;
            if (qty < c.minOrder) continue;
            cost = qty * c.item.unitPrice;
          }
          result.push({ item: c.item, qty, cost, reason: "📦 Restock" });
          remaining -= cost;
        }
      }
    }

    return { items: result, totalCost: budgetAmount - remaining, remaining };
  }, [analyses, budgetAmount, budgetDays]);

  const usedPct = budgetAmount > 0 ? Math.round((recommendations.totalCost / budgetAmount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Budget Restock Planner</h3>
              <p className="text-xs text-muted-foreground">Masukkan budget & target hari, dapatkan saran restock optimal</p>
            </div>
          </div>

          {/* Budget Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget Tersedia</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">Rp</span>
              <Input
                type="number"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(Number(e.target.value) || 0)}
                className="pl-10 text-lg font-bold h-12"
                placeholder="2000000"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {BUDGET_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setBudgetAmount(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    budgetAmount === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {(p / 1000000).toFixed(p >= 1000000 && p % 1000000 === 0 ? 0 : 1)}jt
                </button>
              ))}
            </div>
          </div>

          {/* Days Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Stok (Hari)</label>
            <div className="flex gap-2">
              {DAYS_PRESETS.map(d => (
                <button
                  key={d}
                  onClick={() => setBudgetDays(d)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    budgetDays === d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d} hari
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result Summary */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-primary/8 border border-primary/15 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Terpakai</p>
          <p className="text-base md:text-lg font-extrabold text-primary">{formatRp(recommendations.totalCost)}</p>
          <p className="text-[10px] text-muted-foreground">{usedPct}% budget</p>
        </div>
        <div className="rounded-xl bg-success/8 border border-success/15 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sisa Budget</p>
          <p className="text-base md:text-lg font-extrabold text-success">{formatRp(recommendations.remaining)}</p>
          <p className="text-[10px] text-muted-foreground">{100 - usedPct}%</p>
        </div>
        <div className="rounded-xl bg-muted/60 border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Produk</p>
          <p className="text-base md:text-lg font-extrabold">{recommendations.items.length}</p>
          <p className="text-[10px] text-muted-foreground">item restock</p>
        </div>
      </div>

      {/* Budget usage bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(usedPct, 100)}%` }}
        />
      </div>

      {/* Recommendation Table */}
      {recommendations.items.length > 0 ? (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Saran Restock — {budgetDays} Hari</span>
            <span className="text-xs text-muted-foreground ml-auto">Urut prioritas tertinggi</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="w-8 text-[10px] font-semibold uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">Kode</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">Alasan</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">Stok</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">Sisa Hari</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">Beli</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">Biaya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.items.map((r, i) => (
                  <TableRow
                    key={r.item.productId}
                    className={`${r.item.daysOfStock <= RULES.CRITICAL_DAYS ? "bg-destructive/[0.04]" : i % 2 === 0 ? "" : "bg-muted/15"} ${r.item.currentStock === 0 ? "border-l-[3px] border-l-destructive" : ""}`}
                  >
                    <TableCell className="text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">{r.item.kode}</span>
                        {r.item.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{r.reason}</span>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${r.item.currentStock === 0 ? "text-destructive font-bold" : ""}`}>
                      {r.item.currentStock}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono font-bold text-sm ${
                        r.item.daysOfStock <= 2 ? "text-destructive" :
                        r.item.daysOfStock <= 4 ? "text-warning" :
                        "text-foreground"
                      }`}>
                        {formatDaysLeft(r.item.daysOfStock)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                        {r.qty}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatRp(r.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">
              {budgetAmount === 0 ? "Masukkan budget untuk melihat saran" : "Tidak ada produk yang perlu restock untuk periode ini"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

const Analisa = () => {
  const { products, stockOutData, isLoading } = useSalesAnalysis();
  const [filter, setFilter] = useState<FilterChip>("ALL");
  const [budgetAmount, setBudgetAmount] = useState<number>(2000000);
  const [budgetDays, setBudgetDays] = useState<number>(3);

  const analyses = useMemo(() => {
    if (!products.length) return [];
    return analyzeAllProducts(products, stockOutData);
  }, [products, stockOutData]);

  const counts = useMemo(() => getStatusCounts(analyses), [analyses]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return analyses;
    return analyses.filter((a) => a.dosStatus === filter);
  }, [analyses, filter]);

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
      salesMap[s.product_id].days.add(s.created_at.slice(0, 10));
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
  const budgetEstimates = useMemo(() => calcBudgetEstimates(products, stockOutData), [products, stockOutData]);
  const stats = useMemo(() => calcStats(products, stockOutData), [products, stockOutData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const predCritical = predictions.filter(p => p.urgency === "critical");
  const predWarning = predictions.filter(p => p.urgency === "warning");
  const predAttention = predictions.filter(p => p.urgency === "attention");
  const predSafe = predictions.filter(p => p.urgency === "safe");

  const totalTW = trendItems.reduce((s, t) => s + t.thisWeek, 0);
  const totalLW = trendItems.reduce((s, t) => s + t.lastWeek, 0);
  const overallChange = totalLW > 0 ? ((totalTW - totalLW) / totalLW * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto w-full overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🔴 ACTION SUMMARY BAR — STICKY */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-3 -mx-4 px-4 md:-mx-6 md:px-6 pt-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Command Center</h1>
            <p className="text-[11px] text-muted-foreground">
              {analyses.length} SKU · WMA {RULES.WMA_PERIOD1_DAYS}d · cycle {RULES.CYCLE_DAYS}d
            </p>
          </div>
          {needsReorder > 0 && (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs font-semibold px-2.5 py-1">
              {needsReorder} perlu restock
            </Badge>
          )}
        </div>

        {/* 4-Card Action Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Card 1 — CRITICAL */}
          <div
            className="relative overflow-hidden rounded-xl bg-destructive/8 border border-destructive/20 p-3 cursor-pointer transition-all hover:shadow-md hover:border-destructive/40 group"
            onClick={() => setFilter(filter === "CRITICAL" ? "ALL" : "CRITICAL")}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-[10px] font-medium text-destructive/80 uppercase tracking-wider">Harus Restock</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-destructive">{criticalCount}</p>
            <p className="text-[10px] text-muted-foreground">produk kritis</p>
          </div>

          {/* Card 2 — SEGERA HABIS */}
          <div
            className="relative overflow-hidden rounded-xl bg-warning/8 border border-warning/20 p-3 cursor-pointer transition-all hover:shadow-md hover:border-warning/40"
            onClick={() => setFilter(filter === "WARNING" ? "ALL" : "WARNING")}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-warning/5 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-warning" />
              <span className="text-[10px] font-medium text-warning/80 uppercase tracking-wider">Segera Habis</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-warning">{warningCount}</p>
            <p className="text-[10px] text-muted-foreground">&lt;4 hari tersisa</p>
          </div>

          {/* Card 3 — BARANG KOSONG */}
          <div
            className="relative overflow-hidden rounded-xl bg-destructive/5 border border-destructive/15 p-3 cursor-pointer transition-all hover:shadow-md hover:border-destructive/30"
            onClick={() => setFilter(filter === "CRITICAL" ? "ALL" : "CRITICAL")}
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/3 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-1">
              <PackageX className="h-4 w-4 text-destructive/70" />
              <span className="text-[10px] font-medium text-destructive/60 uppercase tracking-wider">Stok Kosong</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-foreground">{zeroStockCount}</p>
            <p className="text-[10px] text-muted-foreground">SKU habis</p>
          </div>

          {/* Card 4 — ESTIMASI MODAL */}
          <div className="relative overflow-hidden rounded-xl bg-muted/60 border border-border p-3">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/3 rounded-full -translate-y-4 translate-x-4" />
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Modal Restock</span>
            </div>
            <p className="text-lg md:text-xl font-extrabold text-foreground leading-tight">{formatRp(totalRestockCost)}</p>
            <p className="text-[10px] text-muted-foreground">estimasi {filter !== "ALL" ? "filter" : "total"}</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 🎯 QUICK FILTER CHIPS */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_CHIPS.map((chip) => {
          const isActive = filter === chip.key;
          const count = chip.key === "ALL"
            ? analyses.length
            : counts[chip.key.toLowerCase() as keyof typeof counts];
          return (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? `${chip.activeClass} shadow-sm`
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="text-sm">{chip.icon}</span>
              {chip.label}
              <span className={`ml-0.5 text-[10px] ${isActive ? "opacity-90" : "opacity-60"}`}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT — TABS */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Tabs defaultValue="restock" className="w-full">
        {/* Simplified tab bar — reduced visual weight for secondary tabs */}
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0">
          <TabsTrigger value="restock" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5 font-semibold">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Restock
            {needsReorder > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-4 min-w-[18px] px-1 text-[9px] rounded-full">
                {needsReorder}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="penjualan" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />Penjualan
          </TabsTrigger>
          <TabsTrigger value="profit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />Profit
          </TabsTrigger>
          <TabsTrigger value="toko" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5">
            <Store className="h-3.5 w-3.5 mr-1.5" />Toko
          </TabsTrigger>
          <TabsTrigger value="dead" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5">
            <Skull className="h-3.5 w-3.5 mr-1.5" />Dead Stock
          </TabsTrigger>
          <TabsTrigger value="budget" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5 font-semibold">
            <Calculator className="h-3.5 w-3.5 mr-1.5" />Budget
          </TabsTrigger>
          <TabsTrigger value="ringkasan" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4 py-2.5">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Ringkasan
          </TabsTrigger>
        </TabsList>

        {/* ══════════ RESTOCK ══════════ */}
        <TabsContent value="restock" className="space-y-4 mt-4">
          {/* Quick info */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Ditampilkan: <strong className="text-foreground">{filtered.length}</strong></span>
            <span className="text-border">·</span>
            <span>Perlu reorder: <strong className="text-foreground">{needsReorder}</strong></span>
            {filter !== "ALL" && (
              <>
                <span className="text-border">·</span>
                <button onClick={() => setFilter("ALL")} className="text-primary hover:underline font-medium">
                  Reset filter
                </button>
              </>
            )}
          </div>

          {/* Restock Table — Desktop Only */}
          <div className="hidden md:block">
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-8 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kode</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stok</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vel/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sisa Hari</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rekomendasi</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Biaya</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((a, i) => {
                      const badge = STATUS_BADGE[a.dosStatus];
                      const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
                      const isCriticalRow = a.daysOfStock <= RULES.CRITICAL_DAYS;
                      const isZeroStock = a.currentStock === 0;
                      return (
                        <TableRow
                          key={a.productId}
                          className={`
                            transition-colors
                            ${isCriticalRow ? "bg-destructive/[0.04]" : i % 2 === 0 ? "bg-transparent" : "bg-muted/15"}
                            ${isZeroStock ? "border-l-[3px] border-l-destructive" : ""}
                          `}
                        >
                          <TableCell className="text-muted-foreground text-xs font-mono">{i + 1}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${badge.className}`}>
                              {a.dosStatus === "CRITICAL" && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-sm">{a.kode}</span>
                              {a.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                              {a.isStockOut && <span className="text-xs">🚨</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{a.nama}</div>
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${isZeroStock ? "text-destructive font-bold" : ""}`}>
                            {a.currentStock}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{velPerCycle.toFixed(0)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono font-bold text-base ${
                              a.daysOfStock <= 2 ? "text-destructive" :
                              a.daysOfStock <= 4 ? "text-warning" :
                              a.daysOfStock <= 7 ? "text-amber-500" :
                              "text-success"
                            }`}>
                              {formatDaysLeft(a.daysOfStock)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {a.targetStock}
                          </TableCell>
                          <TableCell className="text-right">
                            {a.recommendedQty > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[44px] px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                                {a.recommendedQty}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {a.cost > 0 ? formatRp(a.cost) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-16">
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
          <div className="md:hidden space-y-2.5">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">Tidak ada produk dalam kategori ini</p>
              </div>
            ) : (
              filtered.map((a) => {
                const badge = STATUS_BADGE[a.dosStatus];
                const isZeroStock = a.currentStock === 0;
                const ringClass =
                  a.dosStatus === "CRITICAL" ? "ring-1 ring-destructive/30" :
                  a.dosStatus === "WARNING" ? "ring-1 ring-warning/30" :
                  a.dosStatus === "ATTENTION" ? "ring-1 ring-amber-500/20" : "";

                return (
                  <div
                    key={a.productId}
                    className={`rounded-2xl border bg-card shadow-sm p-4 transition-transform active:scale-[0.99] w-full ${ringClass}`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sm truncate">{a.kode}</span>
                        {a.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning shrink-0" />}
                        {a.isStockOut && <span className="text-xs shrink-0">🚨</span>}
                        <Badge variant="outline" className={`text-[9px] font-semibold shrink-0 ${badge.className}`}>
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className={`font-mono font-extrabold text-lg leading-none ${
                          a.daysOfStock <= 2 ? "text-destructive" :
                          a.daysOfStock <= 4 ? "text-warning" :
                          a.daysOfStock <= 7 ? "text-amber-500" :
                          "text-success"
                        }`}>
                          {formatDaysLeft(a.daysOfStock)}
                        </span>
                        <p className="text-[9px] text-muted-foreground">sisa</p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border mb-3" />

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Stok</p>
                        <p className={`font-mono font-bold text-sm ${isZeroStock ? "text-destructive" : ""}`}>
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
                        <p className="font-mono text-xs font-semibold">
                          {a.cost > 0 ? formatRp(a.cost) : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Prediksi */}
          <Card className="border-0 shadow-sm p-5 space-y-4">
            <SectionHeader icon={Clock} title="Prediksi Kehabisan Stok" subtitle="Berdasarkan velocity saat ini" />
            {[
              { items: predCritical, label: `Kritis — ≤${RULES.CRITICAL_DAYS} hari`, color: "text-destructive", dot: "bg-destructive" },
              { items: predWarning, label: `Warning — ${RULES.CRITICAL_DAYS + 1}-${RULES.WARNING_DAYS} hari`, color: "text-warning", dot: "bg-warning" },
              { items: predAttention, label: `Perhatian — ${RULES.WARNING_DAYS + 1}-${RULES.ATTENTION_DAYS} hari`, color: "text-amber-500", dot: "bg-amber-500" },
            ].map(({ items, label, color, dot }) => items.length > 0 && (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <h4 className={`text-xs font-semibold ${color}`}>{label} ({items.length})</h4>
                </div>
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
              </div>
            ))}
            <p className="text-xs text-muted-foreground">🟢 Aman ({`>${RULES.ATTENTION_DAYS} hari`}): {predSafe.length} item</p>
          </Card>

          {/* Low Stock */}
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={ArrowDown} title="10 Stok Paling Sedikit" />
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
                      <TableRow key={l.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
          </Card>
        </TabsContent>

        {/* ══════════ PENJUALAN ══════════ */}
        <TabsContent value="penjualan" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={Trophy} title={`${RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris`} subtitle="30 hari terakhir" />
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
                      <TableRow key={t.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
            <p className="text-[11px] text-muted-foreground">⚠️ = data &lt; 7 hari (mungkin belum akurat)</p>
          </Card>

          <Card className="border-0 shadow-sm p-5 space-y-3">
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
                      <TableRow key={t.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
          </Card>
        </TabsContent>

        {/* ══════════ PROFIT ══════════ */}
        <TabsContent value="profit" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={DollarSign} title="Barang Paling Untung" subtitle="30 hari terakhir" />
            {profitItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data profit. Pastikan data harga sudah diisi.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <div className="px-3 py-2 rounded-lg bg-success/10 text-xs">
                    <span className="text-muted-foreground">Total Untung: </span>
                    <span className="font-semibold text-success">{formatRp(profitItems.reduce((s, p) => s + p.totalProfit, 0))}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                    <span className="text-muted-foreground">Produk: </span>
                    <span className="font-semibold">{profitItems.length}</span>
                  </div>
                </div>
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
                          <TableRow key={p.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ TOKO ══════════ */}
        <TabsContent value="toko" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
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
                          <TableRow key={t.nama} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ DEAD STOCK ══════════ */}
        <TabsContent value="dead" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
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
                        <TableRow key={d.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
                <p className="text-xs text-muted-foreground">💡 Saran: jual obral atau kasih promo untuk barang-barang ini</p>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ BUDGET PLANNER ══════════ */}
        <TabsContent value="budget" className="space-y-4 mt-4">
          <BudgetPlanner
            analyses={analyses}
            budgetAmount={budgetAmount}
            setBudgetAmount={setBudgetAmount}
            budgetDays={budgetDays}
            setBudgetDays={setBudgetDays}
          />
        </TabsContent>

        {/* ══════════ RINGKASAN ══════════ */}
        <TabsContent value="ringkasan" className="space-y-5 mt-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: "📦", label: "Jenis Barang", value: String(stats.totalSKU), color: "" },
              { icon: "🧵", label: "Total Stok", value: `${stats.totalStock.toLocaleString("id-ID")} pcs`, color: "" },
              { icon: "💵", label: "Nilai Barang", value: formatRp(stats.totalValue), color: "" },
              { icon: "🔴", label: "Habis", value: String(stats.outOfStock), color: "text-destructive" },
              { icon: "⚠️", label: "Mau Habis", value: String(stats.criticalCount), color: "text-warning" },
              { icon: "🔥", label: "Laris", value: String(stats.bestSellerCount), color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{s.icon}</span>
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={DollarSign} title="Estimasi Budget Restock" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {budgetEstimates.map((e) => {
                const label = e.days === 4 ? "1 siklus" : e.days === 7 ? "1 minggu" : e.days === 14 ? "2 minggu" : e.days === 21 ? "3 minggu" : "1 bulan";
                return (
                  <div key={e.days} className="p-4 rounded-xl bg-muted/30 space-y-1">
                    <p className="text-xs text-muted-foreground">{e.days} hari · {label}</p>
                    <p className="text-lg font-bold">{formatRp(e.cost)}</p>
                    <p className="text-[11px] text-muted-foreground">{e.items} item · {e.qty} pcs</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="border-0 shadow-sm">
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
      </Tabs>
    </div>
  );
};

export default Analisa;
