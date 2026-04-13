import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Check, AlertTriangle, Flame, Plus, PackageX, Clock, CalendarRange, Loader2 } from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { RULES, isBlackWhiteCode } from "@/lib/stockAnalyticsEngine";
import type { ReviewCard, MissedCard, ReviewResult } from "./ReviewResultCards";

// Engine-parity helpers
function getBatchSize(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.BATCH_BW : RULES.BATCH;
}

function getSafetyDays(kode: string): number {
  return isBlackWhiteCode(kode) ? RULES.SAFETY_BW : RULES.SAFETY_STOCK;
}

function roundUpToBatch(qty: number, batch: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / batch) * batch;
}

interface BudgetItem {
  id: string;
  kode: string;
  nama: string;
  dos: number;
  velocity: number;
  qty: number;
  cost: number;
  type: "tambah" | "missed";
  is_bestseller?: boolean;
  harga_modal: number;
  priority: number;
  isPending?: boolean;
  pendingQty?: number;
}

interface PendingItem {
  kode: string;
  qty: number;
}

// Build budget items recalculated for a specific periode (days)
function buildBudgetItemsForPeriode(
  result: ReviewResult,
  periodeDays: number,
  pendingItems: PendingItem[]
): BudgetItem[] {
  const items: BudgetItem[] = [];
  const pendingMap = new Map<string, number>();
  pendingItems.forEach(p => {
    pendingMap.set(p.kode.toUpperCase(), (pendingMap.get(p.kode.toUpperCase()) || 0) + p.qty);
  });

  // Process "tambah" items from cards with verdict "kurang"
  // and also recalculate ALL cards based on periode
  const allCards = result.cards;
  
  allCards.forEach(c => {
    const isBW = isBlackWhiteCode(c.kode);
    const batch = getBatchSize(c.kode);
    const safety = getSafetyDays(c.kode);
    const minOrder = isBW ? batch : RULES.MIN_ORDER_PER_CODE;
    // Engine parity: target = periodeDays + safety + lead time
    const targetDays = periodeDays + safety + RULES.LEAD_TIME_DAYS;
    const targetStock = Math.ceil(c.velocity * targetDays);
    const currentStock = c.stok;
    let shortfall = Math.max(0, targetStock - currentStock);
    
    if (shortfall <= 0) return;

    // Batch rounding (engine parity)
    shortfall = Math.max(minOrder, roundUpToBatch(shortfall, batch));

    const pendingQty = pendingMap.get(c.kode.toUpperCase()) || 0;
    const adjustedShortfall = Math.max(0, shortfall - pendingQty);
    // Re-round after pending deduction
    const finalQty = adjustedShortfall > 0 ? Math.max(minOrder, roundUpToBatch(adjustedShortfall, batch)) : 0;
    
    if (finalQty <= 0 && pendingQty > 0) {
      items.push({
        id: `tambah-${c.kode}`,
        kode: c.kode,
        nama: c.nama,
        dos: c.dos,
        velocity: c.velocity,
        qty: 0,
        cost: 0,
        type: "tambah",
        is_bestseller: c.is_bestseller,
        harga_modal: c.harga_modal,
        priority: c.dos,
        isPending: true,
        pendingQty,
      });
      return;
    }

    if (finalQty <= 0) return;

    items.push({
      id: `tambah-${c.kode}`,
      kode: c.kode,
      nama: c.nama,
      dos: c.dos,
      velocity: c.velocity,
      qty: finalQty,
      cost: finalQty * c.harga_modal,
      type: "tambah",
      is_bestseller: c.is_bestseller,
      harga_modal: c.harga_modal,
      priority: c.dos,
      isPending: pendingQty > 0,
      pendingQty: pendingQty > 0 ? pendingQty : undefined,
    });
  });

  // Missed items — products not in the order but critically low
  result.missed.forEach(m => {
    const isBW = isBlackWhiteCode(m.kode);
    const batch = getBatchSize(m.kode);
    const safety = getSafetyDays(m.kode);
    const minOrder = isBW ? batch : RULES.MIN_ORDER_PER_CODE;
    const targetDays = periodeDays + safety + RULES.LEAD_TIME_DAYS;
    const targetStock = Math.ceil(m.velocity * targetDays);
    const currentStock = m.stok;
    let shortfall = Math.max(0, targetStock - currentStock);
    
    if (shortfall <= 0) return;

    // Batch rounding (engine parity)
    shortfall = Math.max(minOrder, roundUpToBatch(shortfall, batch));

    const pendingQty = pendingMap.get(m.kode.toUpperCase()) || 0;
    const adjustedShortfall = Math.max(0, shortfall - pendingQty);
    const finalQty = adjustedShortfall > 0 ? Math.max(minOrder, roundUpToBatch(adjustedShortfall, batch)) : 0;

    if (finalQty <= 0 && pendingQty > 0) {
      items.push({
        id: `missed-${m.kode}`,
        kode: m.kode,
        nama: m.nama,
        dos: m.dos,
        velocity: m.velocity,
        qty: 0,
        cost: 0,
        type: "missed",
        harga_modal: m.harga_modal,
        priority: m.dos <= 1 ? -1 : m.dos,
        isPending: true,
        pendingQty,
      });
      return;
    }

    if (finalQty <= 0) return;

    items.push({
      id: `missed-${m.kode}`,
      kode: m.kode,
      nama: m.nama,
      dos: m.dos,
      velocity: m.velocity,
      qty: finalQty,
      cost: finalQty * m.harga_modal,
      type: "missed",
      harga_modal: m.harga_modal,
      priority: m.dos <= 1 ? -1 : m.dos,
      isPending: pendingQty > 0,
      pendingQty: pendingQty > 0 ? pendingQty : undefined,
    });
  });

  // Sort: actionable items first (not fully pending), then by priority (DOS ascending)
  items.sort((a, b) => {
    if (a.qty === 0 && b.qty > 0) return 1;
    if (a.qty > 0 && b.qty === 0) return -1;
    return a.priority - b.priority;
  });
  return items;
}

function formatBudgetInput(value: string): string {
  const num = value.replace(/[^\d]/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("id-ID");
}

function parseBudgetInput(formatted: string): number {
  return Number(formatted.replace(/[^\d]/g, "")) || 0;
}

const PERIODE_OPTIONS = [
  { value: 1, label: "1 Hari" },
  { value: 2, label: "2 Hari" },
  { value: 3, label: "3 Hari" },
  { value: 0, label: "Lainnya" },
];

interface BudgetPlannerProps {
  result: ReviewResult;
  alreadySent: boolean;
  onSelectedItemsChange?: (items: BudgetItem[]) => void;
}

export type { BudgetItem };

export default function BudgetPlanner({ result, alreadySent, onSelectedItemsChange }: BudgetPlannerProps) {
  const [budgetInput, setBudgetInput] = useState("");
  const budget = parseBudgetInput(budgetInput);
  
  // Periode state
  const [periodePreset, setPeriodePreset] = useState(2); // default 2 hari
  const [customPeriode, setCustomPeriode] = useState("");
  const periodeDays = periodePreset > 0 ? periodePreset : (parseInt(customPeriode) || 2);

  // Pending restock
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  useEffect(() => {
    async function fetchPending() {
      setPendingLoading(true);
      try {
        const { data, error } = await supabase
          .from("pending_restock")
          .select("id, status, pending_restock_items(kode, qty)")
          .eq("status", "pending");

        if (error) throw error;

        const items: PendingItem[] = [];
        (data || []).forEach((r: any) => {
          (r.pending_restock_items || []).forEach((item: any) => {
            items.push({ kode: item.kode, qty: item.qty });
          });
        });
        setPendingItems(items);
      } catch (err) {
        console.error("Failed to fetch pending restock:", err);
        setPendingItems([]);
      } finally {
        setPendingLoading(false);
      }
    }
    fetchPending();
  }, []);

  const allItems = useMemo(
    () => buildBudgetItemsForPeriode(result, periodeDays, pendingItems),
    [result, periodeDays, pendingItems]
  );

  const actionableItems = allItems.filter(i => i.qty > 0);
  const pendingOnlyItems = allItems.filter(i => i.qty === 0 && i.isPending);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-select items when budget changes
  useEffect(() => {
    if (budget <= 0) {
      setSelectedIds(new Set());
      return;
    }

    const newSelected = new Set<string>();
    let remaining = budget;

    for (const item of actionableItems) {
      if (item.cost <= remaining) {
        newSelected.add(item.id);
        remaining -= item.cost;
      }
    }
    setSelectedIds(newSelected);
  }, [budget, actionableItems]);

  // Notify parent of selected items
  useEffect(() => {
    const selected = actionableItems.filter(i => selectedIds.has(i.id));
    onSelectedItemsChange?.(selected);
  }, [selectedIds, actionableItems, onSelectedItemsChange]);

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = actionableItems
    .filter(i => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.cost, 0);

  const totalAll = actionableItems.reduce((sum, i) => sum + i.cost, 0);
  const selectedCount = selectedIds.size;
  const isOverBudget = budget > 0 && totalSelected > budget;
  const remaining = budget - totalSelected;

  if (allItems.length === 0 && !pendingLoading) return null;

  return (
    <Card className="card-premium overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Budget Restock Planner</h4>
            <p className="text-[10px] text-muted-foreground">
              Pilih periode & budget, AI pilihkan yang paling urgent
            </p>
          </div>
        </div>

        {/* Periode Selector */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <CalendarRange className="h-3 w-3" />
            Periode Restock
          </label>
          <div className="flex gap-1.5">
            {PERIODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setPeriodePreset(opt.value);
                  if (opt.value > 0) setCustomPeriode("");
                }}
                className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all duration-150 active:scale-95 ${
                  periodePreset === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {periodePreset === 0 && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="90"
                value={customPeriode}
                onChange={e => setCustomPeriode(e.target.value)}
                placeholder="2"
                className="w-16 h-9 rounded-lg border border-input bg-background px-2 text-sm font-bold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">hari</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Beli stok untuk <strong>{periodeDays} hari</strong> + safety + lead time berdasarkan kecepatan jual
          </p>
        </div>

        {/* Budget Input */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Budget Hari Ini
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">Rp</span>
            <input
              type="text"
              inputMode="numeric"
              value={budgetInput}
              onChange={e => setBudgetInput(formatBudgetInput(e.target.value))}
              placeholder="0"
              className="w-full h-11 rounded-xl border border-input bg-background pl-10 pr-4 text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {budget > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Total kebutuhan {periodeDays} hari: <span className="font-bold text-foreground">{formatRupiah(totalAll)}</span>
              </span>
              {totalAll <= budget ? (
                <Badge className="bg-success/10 text-success text-[10px]">
                  <Check className="h-3 w-3 mr-0.5" /> Budget cukup
                </Badge>
              ) : (
                <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-0.5" /> Kurang {formatRupiah(totalAll - budget)}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {budget > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Terpakai: <span className="font-bold text-foreground">{formatRupiah(totalSelected)}</span>
              </span>
              <span className={`font-bold ${isOverBudget ? "text-destructive" : remaining > 0 ? "text-success" : "text-foreground"}`}>
                {isOverBudget ? `Over ${formatRupiah(Math.abs(remaining))}` : `Sisa ${formatRupiah(remaining)}`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (totalSelected / budget) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {selectedCount} dari {actionableItems.length} item terpilih
            </p>
          </div>
        )}

        {/* Pending info */}
        {pendingLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Mengecek pesanan pending...
          </div>
        )}

        {pendingOnlyItems.length > 0 && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {pendingOnlyItems.length} item sudah dipesan (pending)
            </p>
            <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500/70 mt-0.5">
              Item ini otomatis di-skip karena sudah masuk pesanan sebelumnya
            </p>
          </div>
        )}

        {/* Item List with checkboxes */}
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
          {actionableItems.map((item, idx) => {
            const isSelected = selectedIds.has(item.id);
            const isMissed = item.type === "missed";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.98] ${
                  isSelected
                    ? isMissed
                      ? "bg-red-50 dark:bg-red-950/20 border-2 border-red-300 dark:border-red-800"
                      : "bg-primary/5 border-2 border-primary/40"
                    : "bg-card border-2 border-transparent hover:border-border"
                }`}
              >
                {/* Priority number */}
                <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0 ${
                  idx < 3 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                }`}>
                  {idx + 1}
                </div>

                {/* Checkbox */}
                <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs">{item.kode}</span>
                    {item.is_bestseller && <Flame className="h-3 w-3 text-amber-500" />}
                    {isMissed && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-destructive">
                        <PackageX className="h-2.5 w-2.5" /> Belum pesan
                      </span>
                    )}
                    {item.isPending && item.pendingQty && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Clock className="h-2.5 w-2.5" /> +{item.pendingQty} pending
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{item.nama}</p>
                </div>

                {/* Qty + Cost */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-0.5 text-xs font-bold">
                    <Plus className="h-3 w-3 text-muted-foreground" />
                    {formatNumber(item.qty)}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{formatRupiah(item.cost)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Pending-only items (collapsed) */}
        {pendingOnlyItems.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest px-1">Sudah Dipesan</p>
            {pendingOnlyItems.map(item => (
              <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/30 opacity-60">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono font-bold text-xs">{item.kode}</span>
                  <p className="text-[10px] text-muted-foreground truncate">{item.nama}</p>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  +{formatNumber(item.pendingQty || 0)} pending
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
