import { useMemo, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  CalendarIcon,
  ChevronDown,
  Clock,
  PackageMinus,
  Search,
  Store,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { filterStockOutHistory, groupStockOutHistoryByDate, type StockOutHistoryEntry } from "@/hooks/useStockOutHistory";

interface BarangKeluarHistoryProps {
  deletingId: string | null;
  history: StockOutHistoryEntry[];
  isLoading: boolean;
  onDeleteTransaction: (item: StockOutHistoryEntry) => void | Promise<void>;
  role: string | null;
}

export function BarangKeluarHistory({
  deletingId,
  history,
  isLoading,
  onDeleteTransaction,
  role,
}: BarangKeluarHistoryProps) {
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const filteredHistory = useMemo(
    () => filterStockOutHistory(history, historySearch, historyDateFilter),
    [history, historyDateFilter, historySearch],
  );
  const groupedHistory = useMemo(() => groupStockOutHistoryByDate(filteredHistory), [filteredHistory]);
  const visibleGroups = groupedHistory.slice(0, 5);
  const hiddenCount = groupedHistory.length - visibleGroups.length;

  return (
    <Card className="overflow-hidden rounded-[1.6rem] border-border/70 bg-card shadow-sm">
      <Collapsible defaultOpen>
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(180deg,hsl(var(--muted)/0.45),transparent)] pb-4">
          <CollapsibleTrigger asChild>
            <button className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Riwayat Barang Keluar
                </CardTitle>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  Pantau pengiriman harian, omzet, dan transaksi toko
                </p>
              </div>

              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <Badge variant="secondary" className="rounded-full px-2.5 text-[10px] font-bold">
                    {history.length} transaksi
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            <div className="rounded-[1.25rem] border border-border/70 bg-background/70 p-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari kode, nama, atau toko..."
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    className="h-11 rounded-xl border-none bg-transparent pl-9 shadow-none"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "h-11 w-11 shrink-0 rounded-xl border-border/70 bg-card",
                        historyDateFilter && "border-primary text-primary",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={historyDateFilter}
                      onSelect={setHistoryDateFilter}
                      initialFocus
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {historyDateFilter && (
                <div className="mt-2 flex items-center gap-2 px-1">
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    {format(historyDateFilter, "dd MMM yyyy", { locale: localeId })}
                  </Badge>
                  <button
                    onClick={() => setHistoryDateFilter(undefined)}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {!isLoading && filteredHistory.length !== history.length && (
              <p className="text-xs text-muted-foreground">
                Menampilkan {filteredHistory.length} dari {history.length} transaksi
              </p>
            )}

            {isLoading && (
              <div className="rounded-[1.25rem] border border-border/60 bg-background/60 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">Memuat riwayat...</p>
              </div>
            )}

            {!isLoading && filteredHistory.length > 0 && (
              <div className="space-y-3">
                {visibleGroups.map(({ dateKey, qty, revenue, count, items }) => {
                  const isOpen = expandedDate === dateKey;

                  return (
                    <section
                      key={dateKey}
                      className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-background/60"
                    >
                      <button
                        onClick={() => setExpandedDate(isOpen ? null : dateKey)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/20"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10">
                            <PackageMinus className="h-5 w-5 text-destructive" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-foreground">
                                {format(new Date(dateKey), "dd MMM yyyy", { locale: localeId })}
                              </p>
                              <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-semibold">
                                {count} transaksi
                              </Badge>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>Keluar -{formatNumber(qty)} pcs</span>
                              <span className="font-semibold text-primary">{formatRupiah(revenue)}</span>
                            </div>
                          </div>
                        </div>

                        <ChevronDown
                          className={cn(
                            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>

                      {isOpen && (
                        <div className="border-t border-border/50 bg-card/60 px-3 pb-3 pt-2.5">
                          <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:grid">
                            <span>Produk</span>
                            <span>Toko</span>
                            <span>Nilai</span>
                            <span>Qty</span>
                          </div>

                          <div className="space-y-2">
                            {items.map((entry) => (
                              <div
                                key={entry.id}
                                className="grid items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,140px)_auto_auto]"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] font-bold text-foreground">
                                      {entry.products?.kode}
                                    </span>
                                    <span className="truncate text-sm font-medium text-foreground">
                                      {entry.products?.nama}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex justify-between gap-2 sm:block sm:min-w-0 sm:text-left">
                                  <span className="text-[11px] text-muted-foreground sm:hidden">Toko</span>
                                  <span className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                                    <Store className="h-3 w-3 shrink-0" />
                                    {entry.toko || "-"}
                                  </span>
                                </div>

                                <div className="flex justify-between gap-2 sm:block sm:text-right">
                                  <span className="text-[11px] text-muted-foreground sm:hidden">Nilai</span>
                                  <span className="text-sm font-bold text-foreground tabular-nums">
                                    {formatRupiah(entry.total_harga)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-2 sm:justify-end">
                                  <span className="text-[11px] text-muted-foreground sm:hidden">Qty</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="rounded-full px-2.5 text-[11px] font-bold">
                                      -{formatNumber(entry.qty_kirim)}
                                    </Badge>
                                    {role === "admin" && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            disabled={deletingId === entry.id}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Hapus Transaksi?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              {entry.products?.kode} - {formatNumber(entry.qty_kirim)} pcs ({formatRupiah(entry.total_harga)}). Stok akan dikembalikan.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                            <AlertDialogAction
                                              className="bg-destructive hover:bg-destructive/90"
                                              onClick={() => onDeleteTransaction(entry)}
                                            >
                                              Hapus
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}

                {hiddenCount > 0 && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    Menampilkan 5 hari terbaru, {hiddenCount} hari lebih lama disembunyikan
                  </p>
                )}
              </div>
            )}

            {!isLoading && filteredHistory.length === 0 && (
              <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/60 py-10 text-center">
                <PackageMinus className="mx-auto mb-3 h-12 w-12 text-muted-foreground/20" />
                <p className="text-sm font-medium text-muted-foreground">
                  {history.length ? "Tidak ada hasil" : "Belum ada riwayat"}
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
