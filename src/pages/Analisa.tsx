import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle, Package, Skull,
  BarChart3, DollarSign, Store, ArrowDown,
  ShoppingCart, Clock, Trophy, Activity,
  AlertCircle, PackageX, Wallet, Flame, TrendingUp, TrendingDown,
  Calculator, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, Palette, Calendar, Users,
  ClipboardList, Plus, Trash2, Send, Loader2
} from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, RULES, type DosStatus, type ProductAnalysis, isBlackWhiteCode } from "@/lib/stockAnalyticsEngine";
import {
  calcTrend, calcDeadStock, calcLowStock,
  calcPredictions, calcProfit, calcTokoAnalysis, calcBudgetEstimates, calcStats,
} from "@/lib/analysisFeatures";
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

const BUDGET_PRESETS = [1000000, 2000000, 3000000, 5000000, 10000000];
const DAYS_PRESETS = [3, 5, 7, 14];
const PLAN_DAYS_PRESETS = [2, 3, 5, 7];

function formatRupiahInput(value: number): string {
  if (value === 0) return "";
  return value.toLocaleString("id-ID");
}

function parseRupiahInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9]/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}

interface PendingItem { kode: string; qty: number; orderedAt?: string; }

interface RestockPlan {
  id: string;
  total_budget: number;
  total_days: number;
  start_date: string;
  status: string;
}

function usePendingRestock() {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("pending_restock")
          .select("id, status, ordered_at, pending_restock_items(kode, qty)")
          .eq("status", "pending");
        const items: PendingItem[] = [];
        (data || []).forEach((r: any) => {
          (r.pending_restock_items || []).forEach((item: any) => {
            items.push({ kode: item.kode, qty: item.qty, orderedAt: r.ordered_at });
          });
        });
        setPendingItems(items);
      } catch { setPendingItems([]); }
      finally { setLoading(false); }
    }
    fetchData();
  }, []);
  return { pendingItems, loading };
}

function BudgetPlanner({
  analyses,
  budgetAmount,
  setBudgetAmount,
  budgetDays,
  setBudgetDays,
  isMobile,
}: {
  analyses: ProductAnalysis[];
  budgetAmount: number;
  setBudgetAmount: (v: number) => void;
  budgetDays: number;
  setBudgetDays: (v: number) => void;
  isMobile: boolean;
}) {
  const [mode, setMode] = useState<"budget" | "periode">("budget");
  const { pendingItems, loading: pendingLoading } = usePendingRestock();

  // Build pending map
  const pendingMap = useMemo(() => {
    const m = new Map<string, number>();
    pendingItems.forEach(p => m.set(p.kode.toUpperCase(), (m.get(p.kode.toUpperCase()) || 0) + p.qty));
    return m;
  }, [pendingItems]);

  // ─── Plan state (Periode Mode) ───
  const [activePlan, setActivePlan] = useState<RestockPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planBudgetInput, setPlanBudgetInput] = useState("");
  const [planDays, setPlanDays] = useState(3);
  const [creatingPlan, setCreatingPlan] = useState(false);

  // ─── Periode: item selection + manual add ───
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); // productId set
  const [manualQtyOverrides, setManualQtyOverrides] = useState<Map<string, number>>(new Map());
  const [manualRows, setManualRows] = useState<{ kode: string; qty: number }[]>([]);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Auto-select all recommendations when they change
  const prevRecRef = useMemo(() => {
    const ids = new Set<string>();
    // Will be populated after periodeRecommendations is computed
    return ids;
  }, []);

  // Build kode→analysis map for manual rows
  const kodeAnalysisMap = useMemo(() => {
    const m = new Map<string, typeof analyses[0]>();
    analyses.forEach(a => m.set(a.kode.toUpperCase(), a));
    return m;
  }, [analyses]);

  const toggleItem = useCallback((productId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const setQtyOverride = useCallback((productId: string, qty: number) => {
    setManualQtyOverrides(prev => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(productId);
      else next.set(productId, qty);
      return next;
    });
  }, []);

  const addManualRow = useCallback(() => {
    setManualRows(prev => [...prev, { kode: "", qty: 0 }]);
  }, []);

  const updateManualRow = useCallback((idx: number, field: "kode" | "qty", value: string | number) => {
    setManualRows(prev => {
      const updated = [...prev];
      if (field === "kode") {
        const matched = kodeAnalysisMap.get((value as string).toUpperCase());
        updated[idx] = { kode: matched ? matched.kode : (value as string).toUpperCase(), qty: updated[idx].qty };
      } else {
        updated[idx] = { ...updated[idx], qty: value as number };
      }
      return updated;
    });
  }, [kodeAnalysisMap]);

  const removeManualRow = useCallback((idx: number) => {
    setManualRows(prev => prev.filter((_, i) => i !== idx));
  }, []);

  async function submitPeriodeOrder(recItems: { item: typeof analyses[0]; qty: number; cost: number }[]) {
    // Gather selected rec items
    const selectedRecs = recItems.filter(r => selectedItems.has(r.item.productId)).map(r => ({
      kode: r.item.kode,
      qty: manualQtyOverrides.get(r.item.productId) || r.qty,
      product_id: r.item.productId,
    }));
    // Gather valid manual rows
    const validManual = manualRows
      .filter(r => r.kode && r.qty > 0 && kodeAnalysisMap.has(r.kode.toUpperCase()))
      .map(r => {
        const a = kodeAnalysisMap.get(r.kode.toUpperCase())!;
        return { kode: a.kode, qty: r.qty, product_id: a.productId };
      });

    const allItems = [...selectedRecs, ...validManual];
    if (allItems.length === 0) { toast.error("Pilih minimal 1 item"); return; }

    setSubmittingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Belum login"); return; }

      const { data: restock, error: e1 } = await supabase
        .from("pending_restock")
        .insert({ user_id: user.id, notes: `Periode Hari ${planInfo?.dayNumber || 1}` })
        .select().single();
      if (e1 || !restock) throw e1;

      const { error: e2 } = await supabase
        .from("pending_restock_items")
        .insert(allItems.map(i => ({ restock_id: restock.id, kode: i.kode, qty: i.qty, product_id: i.product_id })));
      if (e2) throw e2;

      toast.success(`${allItems.length} item berhasil disimpan sebagai pesanan`);
      setSelectedItems(new Set());
      setManualRows([]);
      setManualQtyOverrides(new Map());
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal menyimpan: " + (err?.message || "Error"));
    } finally {
      setSubmittingOrder(false);
    }
  }

  // Fetch active plan when switching to periode mode
  useEffect(() => {
    if (mode !== "periode") return;
    fetchActivePlan();
  }, [mode]);

  async function fetchActivePlan() {
    setPlanLoading(true);
    try {
      const { data } = await (supabase as any).from("restock_plans")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      setActivePlan(data && data.length > 0 ? data[0] : null);
    } catch { setActivePlan(null); }
    finally { setPlanLoading(false); }
  }

  async function createPlan() {
    const totalBudget = parseRupiahInput(planBudgetInput);
    if (totalBudget <= 0 || planDays <= 0) return;
    setCreatingPlan(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await (supabase as any).from("restock_plans").insert({
        user_id: user.id,
        total_budget: totalBudget,
        total_days: planDays,
        start_date: new Date().toISOString().slice(0, 10),
      }).select().single();
      if (!error && data) setActivePlan(data);
    } catch (e) { console.error(e); }
    finally { setCreatingPlan(false); }
  }

  async function completePlan() {
    if (!activePlan) return;
    await (supabase as any).from("restock_plans").update({ status: "completed" }).eq("id", activePlan.id);
    setActivePlan(null);
  }

  // ─── Plan info calculation ───
  const planInfo = useMemo(() => {
    if (!activePlan) return null;
    const start = new Date(activePlan.start_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNumber = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    const isExpired = dayNumber > activePlan.total_days;
    const remainingDays = Math.max(1, activePlan.total_days - dayNumber + 1);

    // Calculate spent from pending items ordered during plan period
    const priceMap = new Map<string, number>();
    analyses.forEach(a => priceMap.set(a.kode.toUpperCase(), a.unitPrice));

    let spentSoFar = 0;
    pendingItems.forEach(p => {
      if (!p.orderedAt) return;
      const d = new Date(p.orderedAt);
      d.setHours(0, 0, 0, 0);
      if (d >= start) {
        spentSoFar += p.qty * (priceMap.get(p.kode.toUpperCase()) || 0);
      }
    });

    const budgetRemaining = Math.max(0, activePlan.total_budget - spentSoFar);
    const todayBudget = Math.round(budgetRemaining / remainingDays);

    return { dayNumber, isExpired, remainingDays, spentSoFar, budgetRemaining, todayBudget };
  }, [activePlan, pendingItems, analyses]);

  // ─── Budget Mode Recommendations ───
  const budgetRecommendations = useMemo(() => {
    const sorted = [...analyses]
      .filter(a => a.velocity > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    type RecItem = { item: ProductAnalysis; qty: number; cost: number; reason: string; pendingQty?: number };
    const result: RecItem[] = [];
    let remaining = budgetAmount;

    const candidates: { item: ProductAnalysis; idealQty: number; idealCost: number; reason: string; batch: number; minOrder: number }[] = [];

    for (const item of sorted) {
      const neededStock = Math.ceil(item.velocity * budgetDays);
      let deficit = neededStock - item.currentStock;
      const pq = pendingMap.get(item.kode.toUpperCase()) || 0;
      deficit -= pq;
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
      for (const c of candidates) {
        const pq = pendingMap.get(c.item.kode.toUpperCase()) || 0;
        result.push({ item: c.item, qty: c.idealQty, cost: c.idealCost, reason: c.reason, pendingQty: pq || undefined });
        remaining -= c.idealCost;
      }
    } else {
      const tier1 = candidates.filter(c => c.item.isStockOut || c.item.daysOfStock <= RULES.CRITICAL_DAYS);
      const tier2 = candidates.filter(c => !tier1.includes(c) && c.item.isBestSeller);
      const tier3 = candidates.filter(c => !tier1.includes(c) && !tier2.includes(c));

      for (const tier of [tier1, tier2, tier3]) {
        for (const c of tier) {
          if (remaining <= 0) break;
          let qty = c.idealQty;
          let cost = c.idealCost;
          if (cost > remaining) {
            qty = Math.floor(Math.floor(remaining / c.item.unitPrice) / c.batch) * c.batch;
            if (qty < c.minOrder) continue;
            cost = qty * c.item.unitPrice;
          }
          const pq = pendingMap.get(c.item.kode.toUpperCase()) || 0;
          result.push({ item: c.item, qty, cost, reason: c.reason, pendingQty: pq || undefined });
          remaining -= cost;
        }
      }
    }

    return { items: result, totalCost: budgetAmount - remaining, remaining };
  }, [analyses, budgetAmount, budgetDays, pendingMap]);

  // ─── Periode Mode: Today's recommendations (dynamic recalculate) ───
  const periodeRecommendations = useMemo(() => {
    if (!planInfo || !activePlan || planInfo.isExpired) return { items: [], totalCost: 0, remaining: 0 };

    const todayBudget = planInfo.todayBudget;
    const targetDays = activePlan.total_days;

    const sorted = [...analyses]
      .filter(a => a.velocity > 0)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    type RecItem = { item: ProductAnalysis; qty: number; cost: number; reason: string; pendingQty?: number };
    const candidates: { item: ProductAnalysis; idealQty: number; idealCost: number; reason: string; batch: number; minOrder: number }[] = [];

    for (const item of sorted) {
      const neededStock = Math.ceil(item.velocity * targetDays);
      let deficit = neededStock - item.currentStock;
      const pq = pendingMap.get(item.kode.toUpperCase()) || 0;
      deficit -= pq;
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

    // Allocate within today's budget using tiered priority
    const result: RecItem[] = [];
    let remaining = todayBudget;

    const totalIdealCost = candidates.reduce((s, c) => s + c.idealCost, 0);

    if (totalIdealCost <= todayBudget) {
      for (const c of candidates) {
        const pq = pendingMap.get(c.item.kode.toUpperCase()) || 0;
        result.push({ item: c.item, qty: c.idealQty, cost: c.idealCost, reason: c.reason, pendingQty: pq || undefined });
        remaining -= c.idealCost;
      }
    } else {
      const tier1 = candidates.filter(c => c.item.isStockOut || c.item.daysOfStock <= RULES.CRITICAL_DAYS);
      const tier2 = candidates.filter(c => !tier1.includes(c) && c.item.isBestSeller);
      const tier3 = candidates.filter(c => !tier1.includes(c) && !tier2.includes(c));

      for (const tier of [tier1, tier2, tier3]) {
        for (const c of tier) {
          if (remaining <= 0) break;
          let qty = c.idealQty;
          let cost = c.idealCost;
          if (cost > remaining) {
            qty = Math.floor(Math.floor(remaining / c.item.unitPrice) / c.batch) * c.batch;
            if (qty < c.minOrder) continue;
            cost = qty * c.item.unitPrice;
          }
          const pq = pendingMap.get(c.item.kode.toUpperCase()) || 0;
          result.push({ item: c.item, qty, cost, reason: c.reason, pendingQty: pq || undefined });
          remaining -= cost;
        }
      }
    }

    return { items: result, totalCost: todayBudget - remaining, remaining };
  }, [analyses, planInfo, activePlan, pendingMap]);

  const usedPct = mode === "budget" && budgetAmount > 0 ? Math.round((budgetRecommendations.totalCost / budgetAmount) * 100) : 0;
  const pendingCount = pendingItems.length;

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Budget Restock Planner</h3>
              <p className="text-xs text-muted-foreground">Pilih mode sesuai kebutuhan</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("budget")}
              className={`p-3 rounded-xl text-left transition-all duration-150 active:scale-[0.97] ${
                mode === "budget"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Wallet className="h-4 w-4 mb-1" />
              <p className="text-xs font-bold">Budget Mode</p>
              <p className="text-[10px] opacity-80">1x pesan, langsung beli</p>
            </button>
            <button
              onClick={() => setMode("periode")}
              className={`p-3 rounded-xl text-left transition-all duration-150 active:scale-[0.97] ${
                mode === "periode"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Clock className="h-4 w-4 mb-1" />
              <p className="text-xs font-bold">Periode Mode</p>
              <p className="text-[10px] opacity-80">Cicil pesanan harian</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ BUDGET MODE ═══ */}
      {mode === "budget" && (
        <>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget Tersedia</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">Rp</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatRupiahInput(budgetAmount)}
                    onChange={(e) => setBudgetAmount(parseRupiahInput(e.target.value))}
                    className="pl-10 text-lg font-bold h-12"
                    placeholder="2,000,000"
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

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Stok (Hari)</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_PRESETS.map(d => (
                    <button
                      key={d}
                      onClick={() => setBudgetDays(d)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        budgetDays === d
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {d} hari
                    </button>
                  ))}
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={!DAYS_PRESETS.includes(budgetDays) && budgetDays > 0 ? budgetDays : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setBudgetDays(raw === "" ? DAYS_PRESETS[0] : Math.min(Number(raw), 90));
                    }}
                    placeholder="Lainnya"
                    className={`w-20 h-10 text-sm font-semibold text-center rounded-xl ${
                      !DAYS_PRESETS.includes(budgetDays) && budgetDays > 0 ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget Summary */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-primary/8 border border-primary/15 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Terpakai</p>
              <p className="text-base font-extrabold text-primary tabular-nums truncate">{formatRp(budgetRecommendations.totalCost)}</p>
              <p className="text-[10px] text-muted-foreground">{usedPct}% budget</p>
            </div>
            <div className="rounded-xl bg-success/8 border border-success/15 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sisa</p>
              <p className="text-base font-extrabold text-success tabular-nums truncate">{formatRp(budgetRecommendations.remaining)}</p>
              <p className="text-[10px] text-muted-foreground">{100 - usedPct}%</p>
            </div>
            <div className="rounded-xl bg-muted/60 border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Produk</p>
              <p className="text-base font-extrabold">{budgetRecommendations.items.length}</p>
              <p className="text-[10px] text-muted-foreground">item restock</p>
            </div>
          </div>

          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(usedPct, 100)}%` }} />
          </div>

          {pendingCount > 0 && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pendingCount} item pending otomatis dikurangi dari kebutuhan
              </p>
            </div>
          )}

          {/* Budget recommendation list */}
          {budgetRecommendations.items.length > 0 ? (
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Saran Restock — {budgetDays} Hari</span>
                <span className="text-xs text-muted-foreground ml-auto">Urut prioritas</span>
              </div>
              <div className="p-3 space-y-2">
                {budgetRecommendations.items.map((r, i) => (
                  <div
                    key={r.item.productId}
                    className={`rounded-xl border p-3 space-y-1.5 ${
                      r.item.currentStock === 0 ? "border-l-[3px] border-l-destructive border-border/60" :
                      r.item.daysOfStock <= RULES.CRITICAL_DAYS ? "border-l-[3px] border-l-destructive/60 border-border/60" :
                      "border-border/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                        <span className="font-bold text-sm">{r.item.kode}</span>
                        {r.item.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                        {r.pendingQty && (
                          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" /> {r.pendingQty} pending
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                        {r.qty}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Stok</span>
                        <p className={`font-semibold tabular-nums ${r.item.currentStock === 0 ? "text-destructive" : ""}`}>{r.item.currentStock}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sisa</span>
                        <p className={`font-bold tabular-nums ${
                          r.item.daysOfStock <= 2 ? "text-destructive" : r.item.daysOfStock <= 4 ? "text-warning" : ""
                        }`}>{formatDaysLeft(r.item.daysOfStock)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Biaya</span>
                        <p className="font-semibold tabular-nums">{formatRp(r.cost)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{r.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-16 text-center">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">
                  {budgetAmount === 0 ? "Masukkan budget untuk melihat saran" : "Tidak ada produk yang perlu restock"}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══ PERIODE MODE ═══ */}
      {mode === "periode" && (
        <>
          {planLoading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Activity className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Memuat rencana...</p>
              </CardContent>
            </Card>
          ) : !activePlan ? (
            /* ── CREATE PLAN FORM ── */
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    Buat Rencana Cicilan
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Budget dipecah rata per hari, AI pilihkan barang paling urgent setiap hari
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Budget</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">Rp</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={planBudgetInput}
                      onChange={(e) => setPlanBudgetInput(formatRupiahInput(parseRupiahInput(e.target.value)))}
                      className="pl-10 text-lg font-bold h-12"
                      placeholder="9,000,000"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[3000000, 5000000, 9000000, 15000000].map(p => (
                      <button
                        key={p}
                        onClick={() => setPlanBudgetInput(formatRupiahInput(p))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          parseRupiahInput(planBudgetInput) === p
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {(p / 1000000).toFixed(0)}jt
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Jumlah Hari Cicilan</label>
                  <div className="flex gap-2">
                    {PLAN_DAYS_PRESETS.map(d => (
                      <button
                        key={d}
                        onClick={() => setPlanDays(d)}
                        className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 ${
                          planDays === d
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {d} Hari
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {parseRupiahInput(planBudgetInput) > 0 && planDays > 0 && (
                  <div className="rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Preview rencana:</p>
                    <p className="text-sm font-bold">
                      {formatRp(Math.round(parseRupiahInput(planBudgetInput) / planDays))}/hari × {planDays} hari
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Setiap hari buka, sistem recalculate berdasarkan stok terkini
                    </p>
                  </div>
                )}

                <button
                  onClick={createPlan}
                  disabled={creatingPlan || parseRupiahInput(planBudgetInput) <= 0}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {creatingPlan ? (
                    <Activity className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  Mulai Rencana Cicilan
                </button>
              </CardContent>
            </Card>
          ) : (
            /* ── ACTIVE PLAN VIEW ── */
            <>
              {/* Plan header */}
              <Card className={`border-0 shadow-sm overflow-hidden ${planInfo?.isExpired ? "opacity-60" : ""}`}>
                <div className={`px-4 py-3 ${planInfo?.isExpired ? "bg-muted/50" : "bg-primary/5"} border-b`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {planInfo?.isExpired
                            ? "Rencana Selesai"
                            : `Hari ${planInfo?.dayNumber} dari ${activePlan.total_days}`
                          }
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Mulai {new Date(activePlan.start_date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={completePlan}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-muted/60 text-muted-foreground hover:bg-muted transition-all"
                    >
                      {planInfo?.isExpired ? "Tutup" : "Selesaikan"}
                    </button>
                  </div>
                </div>
                <CardContent className="p-4 space-y-3">
                  {/* Day progress */}
                  <div className="flex gap-1">
                    {Array.from({ length: activePlan.total_days }, (_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          i + 1 < (planInfo?.dayNumber || 1) ? "bg-success" :
                          i + 1 === (planInfo?.dayNumber || 1) ? "bg-primary animate-pulse" :
                          "bg-muted"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Budget summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                      <p className="text-xs font-extrabold tabular-nums">{formatRp(activePlan.total_budget)}</p>
                    </div>
                    <div className="rounded-lg bg-primary/8 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Hari Ini</p>
                      <p className="text-xs font-extrabold text-primary tabular-nums">{formatRp(planInfo?.todayBudget || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-success/8 p-2.5 text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">Sisa</p>
                      <p className="text-xs font-extrabold text-success tabular-nums">{formatRp(planInfo?.budgetRemaining || 0)}</p>
                    </div>
                  </div>

                  {planInfo && planInfo.spentSoFar > 0 && (
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 px-3 py-2">
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        Sudah terpakai: {formatRp(planInfo.spentSoFar)} dari pesanan sebelumnya
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Today's recommendations — selectable */}
              {!planInfo?.isExpired && (
                <>
                  <Card className="border-0 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">
                        Pesanan Hari {planInfo?.dayNumber || 1}
                      </span>
                      <Badge className="ml-auto bg-primary/10 text-primary text-[10px]">
                        Budget: {formatRp(planInfo?.todayBudget || 0)}
                      </Badge>
                    </div>

                    {periodeRecommendations.items.length > 0 ? (
                      <>
                        {/* Select all toggle */}
                        <div className="px-4 py-2 bg-muted/10 border-b flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={periodeRecommendations.items.every(r => selectedItems.has(r.item.productId))}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedItems(new Set(periodeRecommendations.items.map(r => r.item.productId)));
                                } else {
                                  setSelectedItems(new Set());
                                }
                              }}
                            />
                            <span className="font-medium">Pilih semua saran</span>
                          </label>
                          <span className="text-[10px] text-muted-foreground">
                            {selectedItems.size} dipilih
                          </span>
                        </div>

                        <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
                          {periodeRecommendations.items.map((r, i) => {
                            const isSelected = selectedItems.has(r.item.productId);
                            const overrideQty = manualQtyOverrides.get(r.item.productId);
                            const displayQty = overrideQty || r.qty;
                            const displayCost = displayQty * r.item.unitPrice;

                            return (
                              <div
                                key={r.item.productId}
                                className={`rounded-xl border p-3 space-y-1.5 transition-all cursor-pointer ${
                                  isSelected
                                    ? "border-primary/40 bg-primary/5 shadow-sm"
                                    : "border-border/40 opacity-60"
                                } ${
                                  r.item.currentStock === 0 ? "border-l-[3px] border-l-destructive" :
                                  r.item.daysOfStock <= RULES.CRITICAL_DAYS ? "border-l-[3px] border-l-destructive/60" : ""
                                }`}
                                onClick={() => toggleItem(r.item.productId)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Checkbox checked={isSelected} className="pointer-events-none" />
                                    <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                                    <span className="font-bold text-sm">{r.item.kode}</span>
                                    {r.item.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                                    {r.pendingQty && (
                                      <span className="text-[9px] font-semibold text-success flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" /> {r.pendingQty} pending
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      className="h-8 w-16 text-center text-sm font-bold rounded-lg"
                                      value={overrideQty !== undefined ? overrideQty : r.qty}
                                      onChange={e => {
                                        const v = parseInt(e.target.value) || 0;
                                        setQtyOverride(r.item.productId, v === r.qty ? 0 : v);
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-muted-foreground">Stok</span>
                                    <p className={`font-semibold tabular-nums ${r.item.currentStock === 0 ? "text-destructive" : ""}`}>{r.item.currentStock}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Sisa</span>
                                    <p className={`font-bold tabular-nums ${
                                      r.item.daysOfStock <= 2 ? "text-destructive" : r.item.daysOfStock <= 4 ? "text-warning" : ""
                                    }`}>{formatDaysLeft(r.item.daysOfStock)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Biaya</span>
                                    <p className="font-semibold tabular-nums">{formatRp(displayCost)}</p>
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">{r.reason}</p>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <CardContent className="py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success opacity-50" />
                        <p className="text-sm text-muted-foreground">
                          Semua stok tercukupi dari saran analisa 🎉
                        </p>
                      </CardContent>
                    )}

                    {/* Manual add section */}
                    <div className="px-4 py-3 border-t bg-muted/10 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Plus className="h-3 w-3" />
                        Tambah item manual (di luar saran)
                      </p>
                      {manualRows.map((row, idx) => {
                        const matched = kodeAnalysisMap.get(row.kode.toUpperCase());
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              className="h-8 text-sm font-mono flex-1"
                              value={row.kode}
                              onChange={e => updateManualRow(idx, "kode", e.target.value)}
                              placeholder="Kode produk..."
                              list="periode-manual-codes"
                            />
                            {matched && <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">{matched.kode}</span>}
                            {!matched && row.kode && <span className="text-[10px] text-destructive">✗</span>}
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-8 w-16 text-sm text-center"
                              value={row.qty === 0 ? "" : row.qty}
                              onChange={e => updateManualRow(idx, "qty", parseInt(e.target.value) || 0)}
                              placeholder="Qty"
                            />
                            <button onClick={() => removeManualRow(idx)} className="text-destructive p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        onClick={addManualRow}
                        className="w-full h-9 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Tambah Baris
                      </button>
                    </div>

                    <datalist id="periode-manual-codes">
                      {analyses.map(a => <option key={a.productId} value={a.kode} />)}
                    </datalist>

                    {/* Summary + Submit */}
                    {(() => {
                      const selectedRecs = periodeRecommendations.items
                        .filter(r => selectedItems.has(r.item.productId))
                        .map(r => ({ qty: manualQtyOverrides.get(r.item.productId) || r.qty, cost: (manualQtyOverrides.get(r.item.productId) || r.qty) * r.item.unitPrice }));
                      const validManual = manualRows.filter(r => r.kode && r.qty > 0 && kodeAnalysisMap.has(r.kode.toUpperCase()));
                      const manualCost = validManual.reduce((s, r) => s + r.qty * (kodeAnalysisMap.get(r.kode.toUpperCase())?.unitPrice || 0), 0);
                      const totalItems = selectedRecs.length + validManual.length;
                      const totalCost = selectedRecs.reduce((s, r) => s + r.cost, 0) + manualCost;
                      const totalQty = selectedRecs.reduce((s, r) => s + r.qty, 0) + validManual.reduce((s, r) => s + r.qty, 0);

                      return (
                        <div className="px-4 py-3 border-t space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{totalItems} item · {totalQty} pcs</span>
                            <span className="font-bold text-primary">{formatRp(totalCost)}</span>
                          </div>
                          {planInfo && totalCost > planInfo.todayBudget && (
                            <p className="text-[10px] text-warning flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Melebihi budget hari ini ({formatRp(totalCost - planInfo.todayBudget)} lebih)
                            </p>
                          )}
                          <button
                            onClick={() => submitPeriodeOrder(periodeRecommendations.items)}
                            disabled={submittingOrder || totalItems === 0}
                            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                          >
                            {submittingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {submittingOrder ? "Menyimpan..." : `Pesan ${totalItems} Item`}
                          </button>
                        </div>
                      );
                    })()}
                  </Card>
                </>
              )}

              {planInfo?.isExpired && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-8 text-center space-y-3">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-success" />
                    <div>
                      <p className="text-sm font-bold">Rencana {activePlan.total_days} hari selesai!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Total terpakai: {formatRp(planInfo.spentSoFar)} dari {formatRp(activePlan.total_budget)}
                      </p>
                    </div>
                    <button
                      onClick={completePlan}
                      className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:opacity-90 transition-all"
                    >
                      Buat Rencana Baru
                    </button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}


// ─── Mobile Card Helper for simple ranked lists ───────────
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
  const [restockPage, setRestockPage] = useState(1);
  const [budgetAmount, setBudgetAmount] = useState<number>(2000000);
  const [budgetDays, setBudgetDays] = useState<number>(3);
  const isMobile = useIsMobile();
  const RESTOCK_PAGE_SIZE = 30;

  const analyses = useMemo(() => {
    if (!products.length) return [];
    return analyzeAllProducts(products, stockOutData);
  }, [products, stockOutData]);

  const counts = useMemo(() => getStatusCounts(analyses), [analyses]);

  const filtered = useMemo(() => {
    const base = filter === "ALL" ? analyses : analyses.filter((a) => a.dosStatus === filter);
    return [...base].sort((a, b) => PRIORITY_ORDER[getPriorityLevel(a.dosStatus)] - PRIORITY_ORDER[getPriorityLevel(b.dosStatus)]);
  }, [analyses, filter]);

  const restockTotalPages = Math.max(1, Math.ceil(filtered.length / RESTOCK_PAGE_SIZE));
  const restockCurrentPage = Math.min(restockPage, restockTotalPages);
  const paginatedFiltered = useMemo(() =>
    filtered.slice((restockCurrentPage - 1) * RESTOCK_PAGE_SIZE, restockCurrentPage * RESTOCK_PAGE_SIZE),
    [filtered, restockCurrentPage, RESTOCK_PAGE_SIZE]
  );

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
          <TabsList className="grid grid-cols-5 md:grid-cols-11 w-full bg-transparent h-auto p-0 gap-1">
            {[
              { value: "restock", icon: ShoppingCart, label: "Restock", badge: needsReorder > 0 ? needsReorder : null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "penjualan", icon: Trophy, label: "Penjualan", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "profit", icon: DollarSign, label: "Profit", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "toko", icon: Store, label: "Toko", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "pelanggan", icon: Users, label: "Pelanggan", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "hari", icon: Calendar, label: "Hari", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "tren", icon: Palette, label: "Tren", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "dead", icon: Skull, label: "Dead", badge: null, activeColor: "data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground" },
              { value: "budget", icon: Calculator, label: "Budget", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              
              { value: "ringkasan", icon: BarChart3, label: "Ringkasan", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
              { value: "review", icon: Sparkles, label: "Review", badge: null, activeColor: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`relative rounded-xl ${tab.activeColor} data-[state=active]:shadow-lg data-[state=active]:scale-[1.02] data-[state=inactive]:hover:bg-muted/60 text-[10px] md:text-xs px-1.5 md:px-3 py-2.5 font-semibold gap-1.5 transition-all duration-200 ease-out`}
              >
                <tab.icon className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
                {tab.badge && (
                  <Badge variant="destructive" className="ml-0.5 h-4 min-w-[16px] px-1 text-[9px] rounded-full shrink-0 animate-pulse">
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
                  onClick={() => { setFilter(chip.key); setFilterKey(k => k + 1); setRestockPage(1); }}
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
                      const globalIdx = (restockCurrentPage - 1) * RESTOCK_PAGE_SIZE + i;
                      const badge = STATUS_BADGE[a.dosStatus];
                      const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
                      const priority = getPriorityLevel(a.dosStatus);
                      const isZeroStock = a.currentStock === 0;
                      return (
                        <TableRow
                          key={a.productId}
                          className={`relative ${PRIORITY_ROW_BG[priority]} animate-fade-in`}
                          style={{ animationDelay: `${Math.min(i * 20, 200)}ms`, animationFillMode: "both" }}
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
                const globalIdx = (restockCurrentPage - 1) * RESTOCK_PAGE_SIZE + idx;
                const badge = STATUS_BADGE[a.dosStatus];
                const priority = getPriorityLevel(a.dosStatus);
                const isZeroStock = a.currentStock === 0;
                const ringClass =
                  a.dosStatus === "CRITICAL" ? "border-l-[3px] border-l-destructive border-border/60" :
                  a.dosStatus === "WARNING" ? "border-l-[3px] border-l-warning border-border/60" :
                  a.dosStatus === "ATTENTION" ? "border-l-[3px] border-l-accent border-border/60" : "border-l-[3px] border-l-success border-border/60";

                return (
                  <div
                    key={a.productId}
                    className={`rounded-xl border bg-card p-3.5 transition-all active:scale-[0.99] w-full ${ringClass} ${PRIORITY_ROW_BG[priority]} animate-fade-in`}
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
                  </div>
                );
              })
            )}
          </div>

          {/* Restock Pagination Controls */}
          {restockTotalPages > 1 && (
            <div className="flex items-center justify-between py-3 border-t">
              <p className="text-xs text-muted-foreground">
                {(restockCurrentPage - 1) * RESTOCK_PAGE_SIZE + 1}–{Math.min(restockCurrentPage * RESTOCK_PAGE_SIZE, filtered.length)} dari {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={restockCurrentPage <= 1}
                  onClick={() => setRestockPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-semibold px-2 tabular-nums">
                  {restockCurrentPage}/{restockTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={restockCurrentPage >= restockTotalPages}
                  onClick={() => setRestockPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
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

        {/* ══════════ PENJUALAN ══════════ */}
        <TabsContent value="penjualan" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          {/* Visual Charts */}
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

        {/* ══════════ PROFIT ══════════ */}
        <TabsContent value="profit" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
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

        {/* ══════════ TOKO ══════════ */}
        <TabsContent value="toko" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
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

        {/* ══════════ TREN WARNA ══════════ */}
        <TabsContent value="tren" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <ColorTrendAnalysis products={products} stockOutData={stockOutData} />
          </Suspense>
        </TabsContent>

        {/* ══════════ HARI RAMAI ══════════ */}
        <TabsContent value="hari" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <HariRamaiAnalysis stockOutData={stockOutData} />
          </Suspense>
        </TabsContent>

        {/* ══════════ REPEAT CUSTOMER ══════════ */}
        <TabsContent value="pelanggan" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <RepeatCustomerAnalysis stockOutData={stockOutData} products={products} />
          </Suspense>
        </TabsContent>

        {/* ══════════ DEAD STOCK ══════════ */}
        <TabsContent value="dead" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
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

        {/* ══════════ BUDGET PLANNER ══════════ */}
        <TabsContent value="budget" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <BudgetPlanner
            analyses={analyses}
            budgetAmount={budgetAmount}
            setBudgetAmount={setBudgetAmount}
            budgetDays={budgetDays}
            setBudgetDays={setBudgetDays}
            isMobile={isMobile}
          />
        </TabsContent>




        {/* ══════════ RINGKASAN ══════════ */}
        <TabsContent value="ringkasan" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
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
                return (
                  <div key={e.days} className="p-4 rounded-xl bg-muted/30 space-y-1">
                    <p className="text-xs text-muted-foreground">{e.days} hari · {label}</p>
                    <p className="text-lg font-bold tabular-nums">{formatRp(e.cost)}</p>
                    <p className="text-[11px] text-muted-foreground">{e.items} item · {e.qty} pcs</p>
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
        {/* ══════════ REVIEW AI ══════════ */}
        <TabsContent value="review" className="space-y-4 mt-4 animate-fade-in" style={{ animationFillMode: "both" }}>
          <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <ReviewAI />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analisa;
