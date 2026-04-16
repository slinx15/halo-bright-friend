import { useState, useMemo } from "react";
import { formatRupiah } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PackagePlus, Plus, Trash2, Send, Clock, Package, Hash, ChevronDown, CheckCircle2, Box, Search, CalendarIcon } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { splitIntoStacks, addStacks } from "@/lib/tumpukanUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TransactionSkeleton } from "@/components/LoadingSkeletons";
import { logActivity } from "@/lib/activityLogger";

interface LineItem {
  kode: string;
  qty: number;
  productName?: string;
  productId?: string;
  productKode?: string;
}

const BarangMasuk = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<LineItem[]>([{ kode: "", qty: 1 }]);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const { data: history } = useQuery({
    queryKey: ["stock_in_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_in")
        .select("*, products(kode, nama, prices(harga_modal))")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "kode" && products) {
        const input = String(value).toUpperCase();
        // First try exact match by kode (e.g. "BLCK 5 Ons")
        let found = products.find((p) => p.kode.toUpperCase() === input);
        // Then try by nama
        if (!found) {
          found = products.find((p) => p.nama.toUpperCase() === input);
        }
        // Fallback: match by kode only if there's exactly one product with that kode
        if (!found) {
          const byKode = products.filter((p) => p.kode.toUpperCase() === input);
          found = byKode.length === 1 ? byKode[0] : undefined;
        }
        updated[index].productName = found?.nama;
        updated[index].productId = found?.id;
        updated[index].productKode = found?.kode;
      }
      return updated;
    });
  };

  const addLine = () => setItems((prev) => [...prev, { kode: "", qty: 1 }]);
  const removeLine = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const retryOp = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Unreachable");
  };

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.productId && i.qty > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    let successCount = 0;
    const errors: string[] = [];

    for (const item of validItems) {
      try {
        const kode = item.productKode || item.kode;
        const newStacks = splitIntoStacks(item.qty, kode);

        await retryOp(() => Promise.resolve(supabase.from("stock_in").insert({
          product_id: item.productId!,
          qty: item.qty,
          tumpukan: newStacks.join(","),
          catatan: catatan || null,
          user_id: user!.id,
        }).then(r => { if (r.error) throw r.error; return r; })));

        const { data: existing } = await retryOp(() => Promise.resolve(supabase
          .from("stock")
          .select("*")
          .eq("product_id", item.productId!)
          .maybeSingle()
          .then(r => { if (r.error) throw r.error; return r; })));

        if (existing) {
          const currentStacks = (existing.tumpukan_detail as number[]) ?? [];
          const merged = addStacks(currentStacks, newStacks);
          await retryOp(() => Promise.resolve(supabase
            .from("stock")
            .update({
              jumlah: existing.jumlah + item.qty,
              tumpukan_detail: merged,
            })
            .eq("id", existing.id)
            .then(r => { if (r.error) throw r.error; return r; })));
        } else {
          await retryOp(() => Promise.resolve(supabase.from("stock").insert({
            product_id: item.productId!,
            jumlah: item.qty,
            tumpukan_detail: newStacks,
          }).then(r => { if (r.error) throw r.error; return r; })));
        }
        successCount++;
      } catch (itemErr: any) {
        errors.push(`${item.kode}: ${itemErr.message}`);
      }
    }

    if (errors.length > 0) {
      toast({ title: `${successCount} berhasil, ${errors.length} gagal`, description: errors.join("; "), variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `${validItems.length} item masuk tercatat` });
      const summary = validItems.map(i => `${i.productKode || i.kode} x${i.qty}`).join(", ");
      logActivity("stock_in", `Barang masuk: ${summary}`, { items: validItems.map(i => ({ kode: i.productKode || i.kode, qty: i.qty })) });
    }
    setItems([{ kode: "", qty: 1 }]);
    setCatatan("");
    queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setSubmitting(false);
  };

  const validCount = items.filter((i) => i.productId && i.qty > 0).length;
  const totalQty = items.filter((i) => i.productId && i.qty > 0).reduce((s, i) => s + i.qty, 0);

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    return history.filter((h: any) => {
      const matchSearch = !historySearch || 
        h.products?.kode?.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.products?.nama?.toLowerCase().includes(historySearch.toLowerCase());
      const wibDate = h.created_at ? (() => { const u = new Date(h.created_at); return format(new Date(u.getTime() + 7*60*60*1000), "yyyy-MM-dd"); })() : "";
      const matchDate = !historyDateFilter || wibDate === format(historyDateFilter, "yyyy-MM-dd");
      return matchSearch && matchDate;
    });
  }, [history, historySearch, historyDateFilter]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-success/10 shadow-sm">
            <PackagePlus className="h-6 w-6 text-success" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">Barang Masuk</h1>
            <p className="text-muted-foreground text-xs font-medium">Catat barang masuk ke gudang</p>
          </div>
        </div>
        <OcrUpload
          mode="masuk"
          onResult={(ocrItems) => {
            const newItems: LineItem[] = ocrItems.map((o: any) => {
              const found = products?.find((p) => p.kode.toUpperCase() === (o.kode || "").toUpperCase());
              return {
                kode: (o.kode || "").toUpperCase(),
                qty: o.qty || 1,
                productName: found?.nama || o.nama,
                productId: found?.id,
                productKode: found?.kode,
              };
            });
            setItems(newItems.length > 0 ? newItems : [{ kode: "", qty: 1 }]);
            if (ocrItems[0]?.catatan) setCatatan(ocrItems[0].catatan);
          }}
        />
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-success tabular-nums">{items.length}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Baris</p>
        </div>
        <div className="card-premium bg-primary/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-primary tabular-nums">{validCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Valid</p>
        </div>
        <div className="card-premium bg-muted/30 p-3 text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(totalQty)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</p>
        </div>
      </div>

      {/* ── Input Card ── */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-success/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-success" />
            Input Barang Masuk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {items.map((item, i) => {
            const matchedProduct = products?.find((p) => p.id === item.productId);
            const currentStacks = (matchedProduct?.stock?.tumpukan_detail as number[]) ?? [];
            const previewNewStacks = item.productId && item.qty > 0
              ? splitIntoStacks(item.qty, item.productKode || item.kode)
              : [];
            const previewMerged = item.productId && item.qty > 0
              ? addStacks(currentStacks, previewNewStacks)
              : currentStacks;

            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-3 space-y-2 transition-all duration-200",
                  item.productId
                    ? "border-success/30 bg-success/[0.03] shadow-sm"
                    : item.kode && !item.productId
                    ? "border-destructive/30 bg-destructive/[0.03]"
                    : "border-border/60 hover:border-border"
                )}
              >
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <Input
                      placeholder="Ketik kode produk..."
                      value={item.kode}
                      onChange={(e) => updateItem(i, "kode", e.target.value.toUpperCase())}
                      list="product-codes"
                      className="rounded-lg font-mono"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.qty === 0 ? "" : item.qty}
                      onChange={(e) => updateItem(i, "qty", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="rounded-lg text-center font-bold text-base"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded-lg h-10 w-10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* Product info */}
                {item.productName && (
                  <p className="text-xs text-success font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0" /> {item.productName}
                    {matchedProduct?.kategori && matchedProduct.kategori !== "2 Ons" && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{matchedProduct.kategori}</Badge>
                    )}
                  </p>
                )}
                {item.kode && !item.productId && (
                  <p className="text-xs text-destructive font-medium">✗ Produk tidak ditemukan</p>
                )}
                {/* Stack preview */}
                {item.productId && item.qty > 0 && (
                  <div className="bg-muted/30 rounded-md p-2 space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium">Masuk:</span>
                      <TumpukanBadges stacks={previewNewStacks} kode={item.productKode || item.kode} compact />
                    </div>
                    {currentStacks.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground font-medium">Sekarang:</span>
                        <TumpukanBadges stacks={currentStacks} kode={item.productKode || item.kode} compact />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-foreground font-semibold">Setelah:</span>
                      <TumpukanBadges stacks={previewMerged} kode={item.productKode || item.kode} compact />
                      <Badge variant="secondary" className="text-[9px] rounded-full px-1.5">
                        = {previewMerged.reduce((s, v) => s + v, 0)}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <datalist id="product-codes">
            {products?.map((p) => <option key={p.id} value={p.nama} label={`${p.kode} — ${p.nama}`} />)}
          </datalist>

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</Label>
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} className="rounded-lg mt-1" />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-success hover:bg-success/90"
          >
            <Send className="h-5 w-5 mr-2" />
            {submitting ? "Menyimpan..." : `Simpan Barang Masuk${validCount > 0 ? ` (${validCount} item)` : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* ── Riwayat ── */}
      <Card className="card-premium">
        <Collapsible defaultOpen>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left min-h-[44px]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Barang Masuk
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">{history.length}</Badge>
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
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-9 rounded-xl h-10"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("rounded-xl h-10 w-10 shrink-0", historyDateFilter && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={historyDateFilter} onSelect={setHistoryDateFilter} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              {historyDateFilter && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs rounded-full">{format(historyDateFilter, "dd MMM yyyy", { locale: localeId })}</Badge>
                  <button onClick={() => setHistoryDateFilter(undefined)} className="text-[10px] text-primary hover:underline">Reset</button>
                </div>
              )}
              {filteredHistory.length !== (history?.length ?? 0) && (
                <p className="text-xs text-muted-foreground">{filteredHistory.length} dari {history?.length} entri</p>
              )}

              {/* ── Grouped by Date ── */}
              {filteredHistory.length > 0 && (() => {
                const grouped: Record<string, { qty: number; cost: number; count: number; items: any[] }> = {};
                filteredHistory.forEach((h: any) => {
                  const utc = new Date(h.created_at);
                  const wib = new Date(utc.getTime() + 7 * 60 * 60 * 1000);
                  const dateKey = h.created_at ? format(wib, "yyyy-MM-dd") : "unknown";
                  const modal = h.products?.prices?.[0]?.harga_modal || h.products?.prices?.harga_modal || 0;
                  if (!grouped[dateKey]) grouped[dateKey] = { qty: 0, cost: 0, count: 0, items: [] };
                  grouped[dateKey].qty += (h.qty || 0);
                  grouped[dateKey].cost += modal * (h.qty || 0);
                  grouped[dateKey].count += 1;
                  grouped[dateKey].items.push(h);
                });
                const sortedDates = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
                return (
                  <div className="space-y-2">
                    {sortedDates.map(([date, { qty, cost, count, items: dateItems }]) => {
                      const isOpen = expandedDate === date;
                      return (
                        <div key={date} className="rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200">
                          <button
                            onClick={() => setExpandedDate(isOpen ? null : date)}
                            className="flex items-center justify-between w-full p-3.5 text-left min-h-[44px] hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                                <Package className="h-4 w-4 text-success" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">{format(new Date(date), "dd MMM yyyy", { locale: localeId })}</p>
                                <p className="text-[10px] text-muted-foreground">{count} transaksi{cost > 0 ? ` · ${formatRupiah(cost)}` : ""}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="rounded-full text-xs font-extrabold px-2.5 bg-success/15 text-success border-0">
                                +{formatNumber(qty)}
                              </Badge>
                              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-border/40 px-3.5 pb-3 pt-2 space-y-2 animate-fade-in">
                              {dateItems.map((h: any) => (
                                <div key={h.id} className="flex items-center justify-between py-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono font-bold text-xs">{h.products?.kode}</span>
                                    <span className="text-[11px] text-muted-foreground truncate">{h.products?.nama}</span>
                                  </div>
                                  <Badge variant="secondary" className="rounded-full text-[11px] font-bold px-2 shrink-0">
                                    +{formatNumber(h.qty)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {filteredHistory.length === 0 && (
                <div className="py-10 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">{history?.length ? "Tidak ada hasil" : "Belum ada riwayat"}</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};

export default BarangMasuk;
