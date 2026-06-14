import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Calculator,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  Package,
  ShoppingCart,
  Send,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { RULES, isBlackWhiteCode, type ProductAnalysis } from "@/lib/stockAnalyticsEngine";
import { DAYS_PRESETS, buildBudgetEstimateFromAnalyses } from "@/lib/analisaBudget";
import { getErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const BUDGET_PRESETS = [1000000, 2000000, 3000000, 5000000, 10000000];
const PLAN_DAYS_PRESETS = [2, 3, 5, 7];

type RestockPlan = Database["public"]["Tables"]["restock_plans"]["Row"];
type PendingRestockInsert = Database["public"]["Tables"]["pending_restock"]["Insert"];
type PendingRestockItemInsert = Database["public"]["Tables"]["pending_restock_items"]["Insert"];
type PendingRestockRelationRow = Pick<
  Database["public"]["Tables"]["pending_restock_items"]["Row"],
  "kode" | "qty"
>;

interface PendingItem {
  kode: string;
  qty: number;
  orderedAt?: string;
}

interface PendingRestockWithItems {
  id: string;
  status: string;
  ordered_at: string;
  pending_restock_items?: PendingRestockRelationRow[] | null;
}

interface RecItem {
  item: ProductAnalysis;
  qty: number;
  cost: number;
  reason: string;
  pendingQty?: number;
}

interface DayPlan {
  day: number;
  items: RecItem[];
  totalCost: number;
  dailyBudget: number;
  remaining: number;
  locked?: boolean;
}

interface AnalisaBudgetPlannerProps {
  analyses: ProductAnalysis[];
  budgetAmount: number;
  setBudgetAmount: (value: number) => void;
  budgetDays: number;
  setBudgetDays: (value: number) => void;
}

function formatRp(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatDaysLeft(days: number): string {
  if (days >= 999) return "inf";
  if (days < 1) return "< 1hr";
  return `${Math.round(days)}hr`;
}

function formatRupiahInput(value: number): string {
  if (value === 0) return "";
  return value.toLocaleString("id-ID");
}

function parseRupiahInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9]/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}

function usePendingRestock() {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => {
    setVersion((previous) => previous + 1);
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("pending_restock")
          .select("id, status, ordered_at, pending_restock_items(kode, qty)")
          .eq("status", "pending");

        if (error) {
          throw error;
        }

        const rows = (data ?? []) as PendingRestockWithItems[];
        const items: PendingItem[] = [];
        rows.forEach((row) => {
          (row.pending_restock_items ?? []).forEach((item) => {
            items.push({ kode: item.kode, qty: item.qty, orderedAt: row.ordered_at });
          });
        });
        setPendingItems(items);
      } catch {
        setPendingItems([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [version]);

  return { pendingItems, loading, refetch };
}

export function AnalisaBudgetPlanner({
  analyses,
  budgetAmount,
  setBudgetAmount,
  budgetDays,
  setBudgetDays,
}: AnalisaBudgetPlannerProps) {
  const [mode, setMode] = useState<"budget" | "periode">("budget");
  const { pendingItems, refetch: refetchPending } = usePendingRestock();

  const pendingMap = useMemo(() => {
    const map = new Map<string, number>();
    pendingItems.forEach((item) => {
      const key = item.kode.toUpperCase();
      map.set(key, (map.get(key) ?? 0) + item.qty);
    });
    return map;
  }, [pendingItems]);

  const [activePlan, setActivePlan] = useState<RestockPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planBudgetInput, setPlanBudgetInput] = useState("");
  const [planDays, setPlanDays] = useState(3);
  const [planStartDate, setPlanStartDate] = useState<Date>(new Date());
  const [coverageDays, setCoverageDays] = useState(4);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [selectedPeriodeIds, setSelectedPeriodeIds] = useState<Set<string>>(new Set());
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const togglePeriodeItem = useCallback((kode: string) => {
    setSelectedPeriodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(kode)) {
        next.delete(kode);
      } else {
        next.add(kode);
      }
      return next;
    });
  }, []);

  const fetchActivePlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      const { data, error } = await supabase
        .from("restock_plans")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      const plan = data?.[0] ?? null;
      if (!plan) {
        setActivePlan(null);
        return;
      }

      const start = new Date(`${plan.start_date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayNumber = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;

      if (dayNumber > plan.total_days) {
        await supabase.from("restock_plans").update({ status: "completed" }).eq("id", plan.id);
        toast.success("Rencana sebelumnya selesai otomatis");
        setActivePlan(null);
      } else {
        setActivePlan(plan);
      }
    } catch {
      setActivePlan(null);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "periode") {
      return;
    }

    fetchActivePlan();
  }, [fetchActivePlan, mode]);

  async function createPlan() {
    const totalBudget = parseRupiahInput(planBudgetInput);
    if (totalBudget <= 0 || planDays <= 0) {
      return;
    }

    setCreatingPlan(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      const payload: Database["public"]["Tables"]["restock_plans"]["Insert"] = {
        user_id: user.id,
        total_budget: totalBudget,
        total_days: planDays,
        start_date: format(planStartDate, "yyyy-MM-dd"),
        coverage_days: coverageDays,
      };

      const { data, error } = await supabase.from("restock_plans").insert(payload).select().single();
      if (error) {
        throw error;
      }
      setActivePlan(data);
    } catch (error) {
      console.error(error);
    } finally {
      setCreatingPlan(false);
    }
  }

  async function completePlan() {
    if (!activePlan) {
      return;
    }

    await supabase.from("restock_plans").update({ status: "completed" }).eq("id", activePlan.id);
    setActivePlan(null);
  }

  const planInfo = useMemo(() => {
    if (!activePlan) {
      return null;
    }

    const start = new Date(`${activePlan.start_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNumber = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    const isExpired = dayNumber > activePlan.total_days;
    const remainingDays = Math.max(1, activePlan.total_days - dayNumber + 1);

    const priceMap = new Map<string, number>();
    analyses.forEach((analysis) => {
      priceMap.set(analysis.kode.toUpperCase(), analysis.unitPrice);
    });

    let spentSoFar = 0;
    pendingItems.forEach((item) => {
      if (!item.orderedAt) {
        return;
      }

      const orderedAt = new Date(item.orderedAt);
      orderedAt.setHours(0, 0, 0, 0);
      if (orderedAt >= start) {
        spentSoFar += item.qty * (priceMap.get(item.kode.toUpperCase()) ?? 0);
      }
    });

    const budgetRemaining = Math.max(0, activePlan.total_budget - spentSoFar);
    const todayBudget = Math.round(budgetRemaining / remainingDays);

    return { dayNumber, isExpired, remainingDays, spentSoFar, budgetRemaining, todayBudget };
  }, [activePlan, analyses, pendingItems]);

  const budgetRecommendations = useMemo(
    () => buildBudgetEstimateFromAnalyses(analyses, budgetDays, budgetAmount),
    [analyses, budgetAmount, budgetDays],
  );

  const periodePerDay = useMemo((): DayPlan[] => {
    if (!planInfo || !activePlan || planInfo.isExpired) {
      return [];
    }

    const dailyBudget = planInfo.todayBudget;
    const currentDay = planInfo.dayNumber || 1;
    const targetCoverageDays = activePlan.coverage_days || 4;

    const days: DayPlan[] = [];
    const sorted = [...analyses]
      .filter((analysis) => analysis.velocity > 0)
      .sort((left, right) => right.combinedScore - left.combinedScore);

    type Candidate = {
      item: ProductAnalysis;
      idealQty: number;
      idealCost: number;
      reason: string;
      batch: number;
      minOrder: number;
    };

    const candidates: Candidate[] = [];

    for (const item of sorted) {
      const pendingQty = pendingMap.get(item.kode.toUpperCase()) || 0;
      const deficit = Math.ceil(item.velocity * targetCoverageDays) - item.currentStock - pendingQty;
      if (deficit <= 0) {
        continue;
      }

      const isBlackWhite = isBlackWhiteCode(item.kode);
      const batch = isBlackWhite ? RULES.BATCH_BW : RULES.BATCH;
      const minOrder = isBlackWhite ? RULES.BATCH_BW : RULES.MIN_ORDER_PER_CODE;
      const todayDeficit = Math.ceil(deficit / planInfo.remainingDays);
      const qty = Math.max(minOrder, Math.ceil(todayDeficit / batch) * batch);
      const cost = qty * item.unitPrice;

      const reason = item.isStockOut
        ? "Stok kosong"
        : item.daysOfStock <= RULES.CRITICAL_DAYS
          ? "Kritis"
          : item.daysOfStock <= RULES.WARNING_DAYS
            ? "Segera habis"
            : "Perlu restock";

      candidates.push({ item, idealQty: qty, idealCost: cost, reason, batch, minOrder });
    }

    const dayItems: RecItem[] = [];
    let remaining = dailyBudget;
    const totalIdealCost = candidates.reduce((sum, candidate) => sum + candidate.idealCost, 0);

    if (totalIdealCost <= dailyBudget) {
      for (const candidate of candidates) {
        const pendingQty = pendingMap.get(candidate.item.kode.toUpperCase()) || 0;
        dayItems.push({
          item: candidate.item,
          qty: candidate.idealQty,
          cost: candidate.idealCost,
          reason: candidate.reason,
          pendingQty: pendingQty || undefined,
        });
        remaining -= candidate.idealCost;
      }
    } else {
      const tier1 = candidates.filter((candidate) => candidate.item.isStockOut || candidate.item.daysOfStock <= RULES.CRITICAL_DAYS);
      const tier2 = candidates.filter((candidate) => !tier1.includes(candidate) && candidate.item.isBestSeller);
      const tier3 = candidates.filter((candidate) => !tier1.includes(candidate) && !tier2.includes(candidate));

      for (const tier of [tier1, tier2, tier3]) {
        for (const candidate of tier) {
          if (remaining <= 0) {
            break;
          }

          let qty = candidate.idealQty;
          let cost = candidate.idealCost;
          if (cost > remaining) {
            qty = Math.floor(Math.floor(remaining / candidate.item.unitPrice) / candidate.batch) * candidate.batch;
            if (qty < candidate.minOrder) {
              continue;
            }
            cost = qty * candidate.item.unitPrice;
          }

          const pendingQty = pendingMap.get(candidate.item.kode.toUpperCase()) || 0;
          dayItems.push({
            item: candidate.item,
            qty,
            cost,
            reason: candidate.reason,
            pendingQty: pendingQty || undefined,
          });
          remaining -= cost;
        }
      }
    }

    days.push({
      day: currentDay,
      items: dayItems,
      totalCost: dailyBudget - remaining,
      dailyBudget,
      remaining,
    });

    for (let index = 1; index < planInfo.remainingDays; index += 1) {
      days.push({
        day: currentDay + index,
        items: [],
        totalCost: 0,
        dailyBudget,
        remaining: dailyBudget,
        locked: true,
      });
    }

    return days;
  }, [activePlan, analyses, pendingMap, planInfo]);

  const periodeRecommendations = useMemo(() => {
    if (periodePerDay.length === 0) {
      return { items: [] as RecItem[], totalCost: 0, remaining: 0 };
    }

    const today = periodePerDay[0];
    return {
      items: today.items,
      totalCost: today.totalCost,
      remaining: today.remaining,
    };
  }, [periodePerDay]);

  async function submitSelectedItems() {
    const selectedItems = periodeRecommendations.items.filter((item) => selectedPeriodeIds.has(item.item.kode));
    if (selectedItems.length === 0) {
      toast.error("Pilih minimal 1 item");
      return;
    }

    setSubmittingOrder(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Belum login");
        return;
      }

      const dayNum = planInfo?.dayNumber || 1;
      const restockPayload: PendingRestockInsert = {
        user_id: user.id,
        notes: `Periode Hari ${dayNum}`,
      };

      const { data: restock, error: restockError } = await supabase
        .from("pending_restock")
        .insert(restockPayload)
        .select()
        .single();

      if (restockError || !restock) {
        throw restockError;
      }

      const itemsToInsert: PendingRestockItemInsert[] = selectedItems.map((item) => ({
        restock_id: restock.id,
        kode: item.item.kode,
        qty: item.qty,
        product_id: item.item.productId,
      }));

      const { error } = await supabase.from("pending_restock_items").insert(itemsToInsert);
      if (error) {
        throw error;
      }

      toast.success(`${selectedItems.length} item berhasil dipesan untuk Hari ${dayNum}`);
      setSelectedPeriodeIds(new Set());
      refetchPending();
    } catch (error) {
      console.error(error);
      toast.error(`Gagal menyimpan: ${getErrorMessage(error, "Error")}`);
    } finally {
      setSubmittingOrder(false);
    }
  }

  const usedPct = mode === "budget" && budgetAmount > 0
    ? Math.round((budgetRecommendations.cost / budgetAmount) * 100)
    : 0;

  return (
    <div className="space-y-4">
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
                    onChange={(event) => setBudgetAmount(parseRupiahInput(event.target.value))}
                    className="pl-10 text-lg font-bold h-12"
                    placeholder="2,000,000"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {BUDGET_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setBudgetAmount(preset)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        budgetAmount === preset
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {(preset / 1000000).toFixed(preset >= 1000000 && preset % 1000000 === 0 ? 0 : 1)}jt
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Stok (Hari)</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_PRESETS.map((days) => (
                    <button
                      key={days}
                      onClick={() => setBudgetDays(days)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        budgetDays === days
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {days} hari
                    </button>
                  ))}
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={!DAYS_PRESETS.includes(budgetDays) && budgetDays > 0 ? budgetDays : ""}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^0-9]/g, "");
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

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-primary/8 border border-primary/15 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Terpakai</p>
              <p className="text-base font-extrabold text-primary tabular-nums truncate">{formatRp(budgetRecommendations.cost)}</p>
              <p className="text-[10px] text-muted-foreground">{usedPct}% budget</p>
            </div>
            <div className="rounded-xl bg-success/8 border border-success/15 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sisa</p>
              <p className="text-base font-extrabold text-success tabular-nums truncate">{formatRp(budgetRecommendations.remaining)}</p>
              <p className="text-[10px] text-muted-foreground">{100 - usedPct}%</p>
            </div>
            <div className="rounded-xl bg-muted/60 border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Produk</p>
              <p className="text-base font-extrabold">{budgetRecommendations.items}</p>
              <p className="text-[10px] text-muted-foreground">item restock</p>
            </div>
          </div>

          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(usedPct, 100)}%` }} />
          </div>

          {budgetRecommendations.details.length > 0 ? (
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Saran Restock - {budgetDays} Hari</span>
                <span className="text-xs text-muted-foreground ml-auto">Urut prioritas</span>
              </div>
              <div className="p-3 space-y-2">
                {budgetRecommendations.details.map((detail, index) => (
                  <div
                    key={detail.productId}
                    className={`rounded-xl border p-3 space-y-1.5 ${
                      detail.stok === 0 ? "border-l-[3px] border-l-destructive border-border/60" :
                      detail.daysLeft <= RULES.CRITICAL_DAYS ? "border-l-[3px] border-l-destructive/60 border-border/60" :
                      "border-border/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
                        <span className="font-bold text-sm">{detail.kode}</span>
                        {detail.isBestSeller && <Flame className="h-3.5 w-3.5 text-warning" />}
                      </div>
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                        {detail.qty}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Stok</span>
                        <p className={`font-semibold tabular-nums ${detail.stok === 0 ? "text-destructive" : ""}`}>{detail.stok}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sisa</span>
                        <p className={`font-bold tabular-nums ${
                          detail.daysLeft <= 2 ? "text-destructive" : detail.daysLeft <= 4 ? "text-warning" : ""
                        }`}>{formatDaysLeft(detail.daysLeft)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Biaya</span>
                        <p className="font-semibold tabular-nums">{formatRp(detail.cost)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{detail.reason}</p>
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
                      onChange={(event) => setPlanBudgetInput(formatRupiahInput(parseRupiahInput(event.target.value)))}
                      className="pl-10 text-lg font-bold h-12"
                      placeholder="9,000,000"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[3000000, 5000000, 9000000, 15000000].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setPlanBudgetInput(formatRupiahInput(preset))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          parseRupiahInput(planBudgetInput) === preset
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {(preset / 1000000).toFixed(0)}jt
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Jumlah Hari Cicilan</label>
                  <div className="flex gap-2">
                    {PLAN_DAYS_PRESETS.map((days) => (
                      <button
                        key={days}
                        onClick={() => setPlanDays(days)}
                        className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 ${
                          planDays === days
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {days} Hari
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stok untuk Berapa Hari?</label>
                  <p className="text-[10px] text-muted-foreground -mt-1">Dihitung dari hari terakhir cicilan. Stok harus cukup sampai bisa belanja lagi.</p>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5].map((days) => (
                      <button
                        key={days}
                        onClick={() => setCoverageDays(days)}
                        className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 ${
                          coverageDays === days
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {days} Hari
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tanggal Mulai</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm font-medium text-left flex items-center gap-2 hover:bg-muted/50 transition-colors">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {format(planStartDate, "EEEE, d MMM yyyy", { locale: idLocale })}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={planStartDate}
                        onSelect={(date) => date && setPlanStartDate(date)}
                        disabled={(date) => date > new Date() || date < subDays(new Date(), 14)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {planStartDate.toDateString() !== new Date().toDateString() && (
                    <p className="text-[10px] text-primary flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      Rencana dimulai dari {format(planStartDate, "d MMM")} - hari ini = Hari {Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(planStartDate).setHours(0, 0, 0, 0)) / 86400000) + 1}
                    </p>
                  )}
                </div>

                {parseRupiahInput(planBudgetInput) > 0 && planDays > 0 && (() => {
                  const todayMs = new Date().setHours(0, 0, 0, 0);
                  const startMs = new Date(planStartDate).setHours(0, 0, 0, 0);
                  const currentDay = Math.floor((todayMs - startMs) / 86400000) + 1;
                  const isBackdated = startMs < todayMs;
                  const isPlanExpired = currentDay > planDays;

                  return (
                    <div className={`rounded-xl border p-3 space-y-1 ${isPlanExpired ? "bg-destructive/5 border-destructive/30" : "bg-muted/40 border-border/50"}`}>
                      <p className="text-xs text-muted-foreground">Preview rencana:</p>
                      <p className="text-sm font-bold">
                        {formatRp(Math.round(parseRupiahInput(planBudgetInput) / planDays))}/hari x {planDays} hari
                      </p>
                      <p className="text-[10px] text-muted-foreground">Target: stok cukup {coverageDays} hari setelah cicilan selesai</p>
                      {isBackdated && !isPlanExpired && (
                        <p className="text-[10px] text-primary font-medium">
                          Hari ini = Hari {currentDay} dari {planDays} - sisa {planDays - currentDay + 1} hari
                        </p>
                      )}
                      {isPlanExpired && (
                        <p className="text-[10px] text-destructive font-medium">
                          Rencana sudah lewat. Hari {currentDay} lebih besar dari {planDays} hari. Ubah tanggal mulai atau jumlah hari.
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">Setiap hari buka, sistem recalculate berdasarkan stok terkini</p>
                    </div>
                  );
                })()}

                <button
                  onClick={createPlan}
                  disabled={creatingPlan || parseRupiahInput(planBudgetInput) <= 0 || (Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(planStartDate).setHours(0, 0, 0, 0)) / 86400000) + 1 > planDays)}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {creatingPlan ? <Activity className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Mulai Rencana Cicilan
                </button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className={`border-0 shadow-sm overflow-hidden ${planInfo?.isExpired ? "opacity-60" : ""}`}>
                <div className={`px-4 py-3 ${planInfo?.isExpired ? "bg-muted/50" : "bg-primary/5"} border-b`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {planInfo?.isExpired ? "Rencana Selesai" : `Hari ${planInfo?.dayNumber} dari ${activePlan.total_days}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Mulai {new Date(`${activePlan.start_date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })} - Target {activePlan.coverage_days || 4} hari stok
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
                  <div className="flex gap-1">
                    {Array.from({ length: activePlan.total_days }, (_, index) => (
                      <div
                        key={index}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          index + 1 < (planInfo?.dayNumber || 1) ? "bg-success" :
                          index + 1 === (planInfo?.dayNumber || 1) ? "bg-primary animate-pulse" :
                          "bg-muted"
                        }`}
                      />
                    ))}
                  </div>

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

              {activePlan && pendingItems.length > 0 && (() => {
                const planStart = new Date(`${activePlan.start_date}T00:00:00`);
                const dayGroups = new Map<number, { kode: string; qty: number }[]>();

                pendingItems.forEach((item) => {
                  if (!item.orderedAt) {
                    return;
                  }

                  const orderedAt = new Date(item.orderedAt);
                  orderedAt.setHours(0, 0, 0, 0);
                  if (orderedAt >= planStart) {
                    const dayNum = Math.floor((orderedAt.getTime() - planStart.getTime()) / 86400000) + 1;
                    if (dayNum <= activePlan.total_days) {
                      if (!dayGroups.has(dayNum)) {
                        dayGroups.set(dayNum, []);
                      }
                      dayGroups.get(dayNum)?.push({ kode: item.kode, qty: item.qty });
                    }
                  }
                });

                if (dayGroups.size === 0) {
                  return null;
                }

                const sortedDays = [...dayGroups.keys()].sort((left, right) => left - right);

                return (
                  <Card className="border-0 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b">
                      <p className="text-xs font-bold flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        Pesanan Tercatat
                      </p>
                    </div>
                    <CardContent className="p-3 space-y-2">
                      {sortedDays.map((dayNum) => {
                        const items = dayGroups.get(dayNum) ?? [];
                        const dayDate = new Date(planStart.getTime() + (dayNum - 1) * 86400000);
                        const dayCost = items.reduce((sum, item) => {
                          const analysis = analyses.find((entry) => entry.kode.toUpperCase() === item.kode.toUpperCase());
                          return sum + item.qty * (analysis?.unitPrice || 0);
                        }, 0);

                        return (
                          <div key={dayNum} className="rounded-lg border bg-muted/20 overflow-hidden">
                            <div className="px-3 py-1.5 bg-muted/40 flex items-center justify-between">
                              <p className="text-[10px] font-bold">
                                Hari {dayNum} - {format(dayDate, "d MMM", { locale: idLocale })}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-medium">{formatRp(dayCost)}</p>
                            </div>
                            <div className="px-3 py-1.5 space-y-0.5">
                              {items.map((item, index) => (
                                <div key={`${item.kode}-${index}`} className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono text-muted-foreground">{item.kode}</span>
                                  <span className="font-bold tabular-nums">{item.qty} pcs</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              {!planInfo?.isExpired && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-primary/5 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold">Belanja Hari {planInfo?.dayNumber}</span>
                      <Badge className="bg-primary/10 text-primary text-[10px]">
                        {periodeRecommendations.items.length} item
                      </Badge>
                    </div>
                    {periodeRecommendations.items.length > 0 && (
                      <button
                        onClick={() => {
                          if (selectedPeriodeIds.size === periodeRecommendations.items.length) {
                            setSelectedPeriodeIds(new Set());
                          } else {
                            setSelectedPeriodeIds(new Set(periodeRecommendations.items.map((item) => item.item.kode)));
                          }
                        }}
                        className="text-[10px] font-semibold text-primary hover:underline"
                      >
                        {selectedPeriodeIds.size === periodeRecommendations.items.length ? "Batal Semua" : "Pilih Semua"}
                      </button>
                    )}
                  </div>

                  {periodeRecommendations.items.length > 0 ? (
                    <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
                      {periodeRecommendations.items.map((item, index) => {
                        const isSelected = selectedPeriodeIds.has(item.item.kode);
                        const isCritical = item.item.isStockOut || item.item.daysOfStock <= RULES.CRITICAL_DAYS;

                        return (
                          <button
                            key={item.item.productId}
                            type="button"
                            onClick={() => togglePeriodeItem(item.item.kode)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.98] ${
                              isSelected
                                ? isCritical
                                  ? "bg-destructive/5 border-2 border-destructive/30"
                                  : "bg-primary/5 border-2 border-primary/40"
                                : "bg-card border-2 border-transparent hover:border-border"
                            }`}
                          >
                            <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                            }`}>
                              {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-xs">{item.item.kode}</span>
                                {item.item.isBestSeller && <Flame className="h-3 w-3 text-warning" />}
                                {item.pendingQty && (
                                  <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" /> +{item.pendingQty} pending
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                                <span>Stok: <strong className={item.item.currentStock === 0 ? "text-destructive" : "text-foreground"}>{item.item.currentStock}</strong></span>
                                <span>Sisa: <strong className={`${
                                  item.item.daysOfStock <= 2 ? "text-destructive" : item.item.daysOfStock <= 4 ? "text-warning" : "text-foreground"
                                }`}>{formatDaysLeft(item.item.daysOfStock)}</strong></span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold tabular-nums">{item.qty}</p>
                              <p className="text-[10px] text-muted-foreground tabular-nums">{formatRp(item.cost)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <CardContent className="py-8 text-center">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success opacity-50" />
                      <p className="text-sm text-muted-foreground">Semua stok tercukupi hari ini</p>
                    </CardContent>
                  )}

                  {(() => {
                    const selectedItems = periodeRecommendations.items.filter((item) => selectedPeriodeIds.has(item.item.kode));
                    const selectedCost = selectedItems.reduce((sum, item) => sum + item.cost, 0);
                    const selectedCount = selectedItems.length;

                    return selectedCount > 0 ? (
                      <div className="p-3 pt-0 space-y-3">
                        <div className="rounded-xl bg-muted/40 border border-border/50 p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{selectedCount} dari {periodeRecommendations.items.length} item</span>
                            <span className="font-bold text-primary text-sm tabular-nums">{formatRp(selectedCost)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${Math.min(100, (selectedCost / (planInfo?.todayBudget || 1)) * 100)}%` }}
                            />
                          </div>
                          {planInfo && selectedCost > planInfo.todayBudget && (
                            <p className="text-[10px] text-warning flex items-center gap-1 mt-1.5">
                              <AlertTriangle className="h-3 w-3" />
                              Over budget hari ini ({formatRp(selectedCost - planInfo.todayBudget)} lebih)
                            </p>
                          )}
                        </div>
                        <button
                          onClick={submitSelectedItems}
                          disabled={submittingOrder}
                          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {submittingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {submittingOrder ? "Menyimpan..." : `Pesan ${selectedCount} Item`}
                        </button>
                      </div>
                    ) : null;
                  })()}
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
