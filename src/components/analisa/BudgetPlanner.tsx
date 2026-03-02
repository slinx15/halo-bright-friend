import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Check, AlertTriangle, Flame, Plus, PackageX } from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import type { ReviewCard, MissedCard, ReviewResult } from "./ReviewResultCards";

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
  priority: number; // lower = more urgent
}

function buildBudgetItems(result: ReviewResult, alreadySent: boolean): BudgetItem[] {
  const items: BudgetItem[] = [];

  // "Tambah" items — cards with verdict "kurang"
  result.cards
    .filter(c => c.verdict === "kurang")
    .forEach(c => {
      const shortfall = Math.max(0, c.ideal_qty - c.qty_boss);
      if (shortfall <= 0) return;
      items.push({
        id: `tambah-${c.kode}`,
        kode: c.kode,
        nama: c.nama,
        dos: c.dos,
        velocity: c.velocity,
        qty: shortfall,
        cost: shortfall * c.harga_modal,
        type: "tambah",
        is_bestseller: c.is_bestseller,
        harga_modal: c.harga_modal,
        priority: c.dos, // lower DOS = higher priority
      });
    });

  // "Missed" items
  result.missed.forEach(m => {
    items.push({
      id: `missed-${m.kode}`,
      kode: m.kode,
      nama: m.nama,
      dos: m.dos,
      velocity: m.velocity,
      qty: m.ideal_qty,
      cost: m.cost,
      type: "missed",
      harga_modal: m.harga_modal,
      priority: m.dos <= 1 ? -1 : m.dos, // stok habis = highest priority
    });
  });

  // Sort by priority (DOS ascending — most urgent first)
  items.sort((a, b) => a.priority - b.priority);
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

interface BudgetPlannerProps {
  result: ReviewResult;
  alreadySent: boolean;
  onSelectedItemsChange?: (items: BudgetItem[]) => void;
}

export type { BudgetItem };

export default function BudgetPlanner({ result, alreadySent, onSelectedItemsChange }: BudgetPlannerProps) {
  const [budgetInput, setBudgetInput] = useState("");
  const budget = parseBudgetInput(budgetInput);
  
  const allItems = useMemo(() => buildBudgetItems(result, alreadySent), [result, alreadySent]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-select items when budget changes
  useEffect(() => {
    if (budget <= 0) {
      setSelectedIds(new Set());
      return;
    }

    const newSelected = new Set<string>();
    let remaining = budget;

    for (const item of allItems) {
      if (item.cost <= remaining) {
        newSelected.add(item.id);
        remaining -= item.cost;
      }
    }
    setSelectedIds(newSelected);
  }, [budget, allItems]);

  // Notify parent of selected items
  useEffect(() => {
    const selected = allItems.filter(i => selectedIds.has(i.id));
    onSelectedItemsChange?.(selected);
  }, [selectedIds, allItems, onSelectedItemsChange]);

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = allItems
    .filter(i => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.cost, 0);

  const totalAll = allItems.reduce((sum, i) => sum + i.cost, 0);
  const selectedCount = selectedIds.size;
  const isOverBudget = budget > 0 && totalSelected > budget;
  const remaining = budget - totalSelected;

  if (allItems.length === 0) return null;

  return (
    <Card className="card-premium overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Budget Planner</h4>
            <p className="text-[10px] text-muted-foreground">
              Masukin sisa budget, AI pilihkan yang paling penting
            </p>
          </div>
        </div>

        {/* Budget Input */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Sisa Budget Tersedia
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
                Total kebutuhan: <span className="font-bold text-foreground">{formatRupiah(totalAll)}</span>
              </span>
              {totalAll <= budget ? (
                <Badge className="bg-success/10 text-success text-[10px]">
                  <Check className="h-3 w-3 mr-0.5" /> Budget cukup semua
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
              {selectedCount} dari {allItems.length} item terpilih
            </p>
          </div>
        )}

        {/* Item List with checkboxes */}
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
          {allItems.map((item, idx) => {
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
      </CardContent>
    </Card>
  );
}
