import { useMemo, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Clock, Package, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterStockInHistory, getStockInModalPrice, groupStockInHistoryByDate, type StockInHistoryEntry } from "@/hooks/useStockInHistory";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface BarangMasukHistoryProps {
  history: StockInHistoryEntry[];
  isLoading: boolean;
}

export function BarangMasukHistory({ history, isLoading }: BarangMasukHistoryProps) {
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const filteredHistory = useMemo(
    () => filterStockInHistory(history, historySearch, historyDateFilter),
    [history, historyDateFilter, historySearch],
  );
  const groupedHistory = useMemo(() => groupStockInHistoryByDate(filteredHistory), [filteredHistory]);
  const visibleGroups = groupedHistory.slice(0, 5);
  const hiddenCount = groupedHistory.length - visibleGroups.length;

  return (
    <Card className="card-premium">
      <Collapsible defaultOpen>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left min-h-[44px]">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Barang Masuk
              </CardTitle>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">
                    {history.length}
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari kode, nama..."
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  className="pl-9 rounded-xl h-10"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn("rounded-xl h-10 w-10 shrink-0", historyDateFilter && "border-primary text-primary")}
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
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {historyDateFilter && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs rounded-full">
                  {format(historyDateFilter, "dd MMM yyyy", { locale: localeId })}
                </Badge>
                <button onClick={() => setHistoryDateFilter(undefined)} className="text-[10px] text-primary hover:underline">
                  Reset
                </button>
              </div>
            )}

            {!isLoading && filteredHistory.length !== history.length && (
              <p className="text-xs text-muted-foreground">
                {filteredHistory.length} dari {history.length} entri
              </p>
            )}

            {isLoading && (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground font-medium">Memuat riwayat...</p>
              </div>
            )}

            {!isLoading && filteredHistory.length > 0 && (
              <div className="space-y-3">
                {visibleGroups.map(({ dateKey, qty, cost, count, items }) => {
                  const isOpen = expandedDate === dateKey;

                  return (
                    <div
                      key={dateKey}
                      className="rounded-2xl border-2 border-border/60 bg-card overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <button
                        onClick={() => setExpandedDate(isOpen ? null : dateKey)}
                        className="flex items-center justify-between w-full p-4 text-left min-h-[64px] hover:bg-muted/30 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                            <Package className="h-5 w-5 text-success" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-foreground">
                              {format(new Date(dateKey), "dd MMM yyyy", { locale: localeId })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {count} transaksi · +{formatNumber(qty)} pcs
                            </p>
                            {cost > 0 && (
                              <p className="text-base font-extrabold text-success tabular-nums mt-1">{formatRupiah(cost)}</p>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0", isOpen && "rotate-180")}
                        />
                      </button>

                      {isOpen && (
                        <div className="border-t border-border/40 px-4 pb-3 pt-2.5 space-y-2 animate-fade-in">
                          {items.map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/20 last:border-0">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-mono font-bold text-sm">{entry.products?.kode}</span>
                                <span className="text-xs text-muted-foreground truncate">{entry.products?.nama}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {getStockInModalPrice(entry) > 0 && (
                                  <span className="text-sm font-bold text-success tabular-nums">
                                    {formatRupiah(getStockInModalPrice(entry) * entry.qty)}
                                  </span>
                                )}
                                <Badge variant="secondary" className="rounded-full text-xs font-bold px-2">
                                  +{formatNumber(entry.qty)}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {hiddenCount > 0 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">
                    Menampilkan 5 hari terbaru · {hiddenCount} hari lebih lama disembunyikan
                  </p>
                )}
              </div>
            )}

            {!isLoading && filteredHistory.length === 0 && (
              <div className="py-10 text-center">
                <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-medium">{history.length ? "Tidak ada hasil" : "Belum ada riwayat"}</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
