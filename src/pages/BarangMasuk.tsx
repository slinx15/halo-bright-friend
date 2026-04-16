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
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-success/10">
            <PackagePlus className="h-5 w-5 text-success" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Barang Masuk</h1>
            <p className="text-muted-foreground text-[11px]">Catat barang masuk ke gudang</p>
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
      <div className="flex items-center justify-around py-2">
        <div className="text-center">
          <p className="text-2xl font-bold text-success tabular-nums">{items.length}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Baris</p>
        </div>
        <div className="w-px h-8 bg-border/60" />
        <div className="text-center">
          <p className="text-2xl font-bold text-primary tabular-nums">{validCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Valid</p>
        </div>
        <div className="w-px h-8 bg-border/60" />
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatNumber(totalQty)}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Total</p>
        </div>
      </div>

      {/* ── Input Section ── */}
      <div className="space-y-3">
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
                className={`rounded-lg border p-3 space-y-2 transition-colors ${
                  item.productId
                    ? "border-success/30 bg-success/[0.03]"
                    : item.kode && !item.productId
                    ? "border-destructive/30 bg-destructive/[0.03]"
                    : "border-border/50"
                }`}
              >
                <div className="flex gap-2 items-end">
                  <div className="flex-1 min-w-0">
                    <Label className="text-[11px] font-medium text-muted-foreground">Kode Produk</Label>
                    <Input
                      placeholder="Kode..."
                      value={item.kode}
                      onChange={(e) => updateItem(i, "kode", e.target.value.toUpperCase())}
                      list="product-codes"
                      className="rounded-lg mt-1"
                    />
                    {item.productName && (
                      <p className="text-[11px] text-success mt-1 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {item.productName}
                      </p>
                    )}
                    {item.kode && !item.productId && (
                      <p className="text-[11px] text-destructive mt-1 font-medium">✗ Tidak ditemukan</p>
                    )}
                  </div>
                  <div className="w-20">
                    <Label className="text-[11px] font-medium text-muted-foreground">{matchedProduct?.kategori === "18 Gram" ? "Pack" : "Qty"}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.qty === 0 ? "" : item.qty}
                      onChange={(e) => updateItem(i, "qty", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="rounded-lg mt-1 text-center font-bold text-base"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded-lg min-h-[44px] min-w-[44px]">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-lg min-h-[44px] w-full border-dashed">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          <div>
            <Label className="text-[11px] font-medium text-muted-foreground">Catatan (opsional)</Label>
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} className="rounded-lg mt-1" />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="w-full rounded-xl h-11 text-sm font-bold bg-success hover:bg-success/90 shadow-sm"
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Menyimpan..." : `Simpan Barang Masuk${validCount > 0 ? ` (${validCount} item)` : ""}`}
          </Button>
      </div>

      {/* ── Riwayat ── */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-left min-h-[44px] py-2">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Riwayat Barang Masuk
            </h2>
            <div className="flex items-center gap-2">
              {history && history.length > 0 && (
                <Badge variant="secondary" className="text-[10px] rounded-full px-2 font-semibold">
                  {history.length} entri
                </Badge>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 pt-2">
              {/* Search & Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari kode, nama..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-8 rounded-lg h-9 text-sm"
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
                  <Badge variant="secondary" className="text-xs rounded-full">
                    {format(historyDateFilter, "dd MMM yyyy", { locale: localeId })}
                  </Badge>
                  <button onClick={() => setHistoryDateFilter(undefined)} className="text-[10px] text-primary hover:underline">Reset</button>
                </div>
              )}
              {filteredHistory.length !== (history?.length ?? 0) && (
                <p className="text-xs text-muted-foreground">{filteredHistory.length} dari {history?.length} entri</p>
              )}

              {/* ── Rekap Total per Tanggal ── */}
              {filteredHistory.length > 0 && (() => {
                const grouped: Record<string, { qty: number; cost: number; count: number }> = {};
                filteredHistory.forEach((h: any) => {
                  // Convert to WIB (+7) for correct date grouping
                  const utc = new Date(h.created_at);
                  const wib = new Date(utc.getTime() + 7 * 60 * 60 * 1000);
                  const dateKey = h.created_at ? format(wib, "yyyy-MM-dd") : "unknown";
                  const modal = h.products?.prices?.[0]?.harga_modal || h.products?.prices?.harga_modal || 0;
                  const itemCost = modal * (h.qty || 0);
                  if (!grouped[dateKey]) grouped[dateKey] = { qty: 0, cost: 0, count: 0 };
                  grouped[dateKey].qty += (h.qty || 0);
                  grouped[dateKey].cost += itemCost;
                  grouped[dateKey].count += 1;
                });
                const sortedDates = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
                const grandTotalQty = sortedDates.reduce((s, [, v]) => s + v.qty, 0);
                const grandTotalCost = sortedDates.reduce((s, [, v]) => s + v.cost, 0);
                return (
                  <div className="rounded-lg border border-border/60 bg-card p-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-success uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="h-3 w-3" /> Rekap Barang Masuk
                    </p>
                    <div className="space-y-0.5">
                      {sortedDates.map(([date, { qty, cost, count }]) => (
                        <div key={date} className="flex items-center justify-between text-[13px] py-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground font-medium">{format(new Date(date), "dd MMM", { locale: localeId })}</span>
                            <span className="text-muted-foreground text-[10px]">({count}x)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-success tabular-nums">+{formatNumber(qty)}</span>
                            {cost > 0 && (
                              <span className="font-medium text-primary tabular-nums text-[11px] bg-primary/10 px-1.5 py-0.5 rounded">
                                {formatRupiah(cost)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {sortedDates.length > 1 && (
                      <div className="flex items-center justify-between text-[13px] border-t border-border/40 pt-1.5 mt-1">
                        <span className="font-bold text-foreground">Total</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-success tabular-nums">+{formatNumber(grandTotalQty)}</span>
                          {grandTotalCost > 0 && (
                            <span className="font-semibold text-primary tabular-nums text-[11px] bg-primary/10 px-1.5 py-0.5 rounded">
                              {formatRupiah(grandTotalCost)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {grandTotalCost === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">* Harga modal belum diset</p>
                    )}
                  </div>
                );
              })()}

              {isMobile ? (
                <div className="space-y-1.5">
                  {filteredHistory.length === 0 ? (
                    <div className="py-8 text-center">
                      <Package className="h-10 w-10 text-muted-foreground/15 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">{history?.length ? "Tidak ada hasil" : "Belum ada riwayat"}</p>
                    </div>
                  ) : (
                    filteredHistory.map((h: any) => (
                      <div
                        key={h.id}
                        className="rounded-lg border border-border/40 p-2.5 space-y-1 bg-card"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-bold text-[13px]">{h.products?.kode}</span>
                            <span className="text-[11px] text-muted-foreground truncate">{h.products?.nama}</span>
                          </div>
                          <Badge className="rounded-full text-[11px] font-bold px-2 py-0 bg-success/10 text-success border-0">
                            +{formatNumber(h.qty)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDate(h.created_at)}
                          </span>
                          {h.tumpukan && (
                            <span className="flex items-center gap-0.5">
                              <Hash className="h-2.5 w-2.5" />
                              {h.tumpukan}
                            </span>
                          )}
                        </div>
                        {h.catatan && (
                          <p className="text-[10px] text-muted-foreground italic bg-muted/30 rounded px-1.5 py-0.5">
                            {h.catatan}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold text-xs">Waktu</TableHead>
                        <TableHead className="font-semibold text-xs">Kode</TableHead>
                        <TableHead className="font-semibold text-xs">Nama</TableHead>
                        <TableHead className="text-right font-semibold text-xs">Qty</TableHead>
                        <TableHead className="font-semibold text-xs">Tumpukan</TableHead>
                        <TableHead className="font-semibold text-xs">Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((h: any, idx: number) => (
                        <TableRow key={h.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                          <TableCell className="font-mono font-bold text-sm">{h.products?.kode}</TableCell>
                          <TableCell className="text-sm">{h.products?.nama}</TableCell>
                          <TableCell className="text-right">
                            <Badge className="rounded-full bg-success/10 text-success border-0 font-bold text-xs">
                              +{formatNumber(h.qty)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{h.tumpukan || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{h.catatan || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {filteredHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            {history?.length ? "Tidak ada hasil" : "Belum ada riwayat"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BarangMasuk;
