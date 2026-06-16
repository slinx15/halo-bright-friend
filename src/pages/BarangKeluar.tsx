import { useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Table imports removed — riwayat sekarang grouped per tanggal (collapsible)
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PackageMinus, Send, CheckCircle2, CalendarIcon, Trash2, Plus, SlidersHorizontal } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { OcrUpload } from "@/components/OcrUpload";
import { BarangKeluarHistory } from "@/components/keluar/BarangKeluarHistory";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";
// useIsMobile no longer needed — riwayat tampilan unified (grouped per tanggal)
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { getTodayStockOutSummary, useStockOutHistory, type StockOutHistoryEntry } from "@/hooks/useStockOutHistory";
import { findProductMatch } from "@/lib/productMatcher";
import { deleteStockOutTransaction, registerStockOut } from "@/lib/stockMutations";

type HargaType = "normal" | "grosir" | "grosir2" | "custom";

interface LineItem {
  kode: string;
  qtyPesan: number;
  qtyKirim: number;
  hargaType: HargaType;
  customHarga?: number;
  toko: string;
  productId?: string;
  productKode?: string;
  productName?: string;
  productKategori?: string | null;
}

interface BarangKeluarOcrItem {
  kode: string;
  kategori?: string;
  productId?: string;
  qty?: number;
  qty_pesan?: number;
  qty_kirim?: number;
  harga_type?: HargaType;
}

function createEmptyLineItem(): LineItem {
  return { kode: "", qtyPesan: 0, qtyKirim: 0, hargaType: "normal", toko: "" };
}

const BarangKeluar = () => {
  const { role } = useAuth();
  const { data: products } = useProducts();
  const { data: history = [], isLoading: historyLoading } = useStockOutHistory();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // isMobile no longer used after riwayat unification
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Multi-row input state
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [globalToko, setGlobalToko] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Set Harga Sekaligus state
  const [hargaDialogOpen, setHargaDialogOpen] = useState(false);
  const [customWarnaHarga, setCustomWarnaHarga] = useState<number>(0);
  const [customWhtHarga, setCustomWhtHarga] = useState<number>(0);
  const [customBlckHarga, setCustomBlckHarga] = useState<number>(0);

  // Categorize items for bulk price setting
  const validItemsForHarga = useMemo(() => items.filter(i => i.productId), [items]);
  const warnaItems = useMemo(() => validItemsForHarga.filter(i => {
    const k = (i.productKode || i.kode).toUpperCase();
    return !k.includes("WHT") && !k.includes("BLCK") && !k.includes("BLK");
  }), [validItemsForHarga]);
  const whtItems = useMemo(() => validItemsForHarga.filter(i => (i.productKode || i.kode).toUpperCase().includes("WHT")), [validItemsForHarga]);
  const blckItems = useMemo(() => validItemsForHarga.filter(i => {
    const k = (i.productKode || i.kode).toUpperCase();
    return k.includes("BLCK") || k.includes("BLK");
  }), [validItemsForHarga]);

  // Helper: format price label for bulk dropdown (single value if uniform, range if varies)
  const getBulkPriceLabel = useCallback((itemList: LineItem[], priceKey: "harga_normal" | "harga_grosir" | "harga_grosir2") => {
    const prices = itemList
      .map(i => products?.find(p => p.id === i.productId)?.prices?.[priceKey] ?? 0)
      .filter(p => p > 0);
    if (prices.length === 0) return "";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return ` (${formatRupiah(min)})`;
    return ` (${formatRupiah(min)} - ${formatRupiah(max)})`;
  }, [products]);

  const applyBulkHarga = useCallback((filter: (k: string) => boolean, type: HargaType, customHarga?: number) => {
    setItems(prev => prev.map(item => {
      if (!item.productId) return item;
      const k = (item.productKode || item.kode).toUpperCase();
      if (!filter(k)) return item;
      if (type === "custom" && customHarga && customHarga > 0) {
        return { ...item, hargaType: "custom", customHarga };
      }
      if (type !== "custom") {
        return { ...item, hargaType: type };
      }
      return item;
    }));
  }, []);

  // Auto-detect: search ALL products by kode (exact, base code, or nama)
  const findProduct = (input: string) => {
    return findProductMatch(products, { kode: input }) || undefined;
  };

  const updateItem = <K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "kode") {
        const found = findProduct(String(value));
        updated[index].productId = found?.id;
        updated[index].productKode = found?.kode;
        updated[index].productName = found?.nama;
        updated[index].productKategori = found?.kategori;
      }
      return updated;
    });
  };

  const addLine = () => setItems(prev => [...prev, createEmptyLineItem()]);
  const removeLine = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const getMatchedProduct = (item: LineItem) => products?.find(p => p.id === item.productId);

  const getPrice = (item: LineItem) => {
    const p = getMatchedProduct(item);
    if (!p?.prices) return 0;
    if (item.hargaType === "custom") return item.customHarga ?? 0;
    if (item.hargaType === "grosir2") return p.prices.harga_grosir2;
    if (item.hargaType === "grosir") return p.prices.harga_grosir;
    return p.prices.harga_normal;
  };

  const getUnitLabel = (item: LineItem) => {
    const p = getMatchedProduct(item);
    return p?.kategori === "18 Gram" ? "pack" : "pcs";
  };

  const todaySummary = useMemo(() => getTodayStockOutSummary(history), [history]);

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.productId && i.qtyKirim > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }

    // Validasi wajib: Toko, Tanggal, Harga
    const missingFields: string[] = [];
    const tokoFilled = globalToko.trim() || validItems.every(i => i.toko.trim());
    if (!tokoFilled) missingFields.push("Nama Toko");
    if (!tanggal) missingFields.push("Tanggal");
    const hasZeroPrice = validItems.some(i => getPrice(i) <= 0);
    if (hasZeroPrice) missingFields.push("Harga (ada item dengan harga Rp 0)");

    if (missingFields.length > 0) {
      toast({
        title: "Data belum lengkap",
        description: `Mohon isi: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    const errors: string[] = [];
    const successfulItems: LineItem[] = [];

    // Track live stock per product for duplicate handling
    const liveStock = new Map<string, { jumlah: number; stacks: number[] }>();

    for (const item of validItems) {
      try {
        const product = getMatchedProduct(item)!;

        if (!liveStock.has(product.id)) {
          liveStock.set(product.id, {
            jumlah: product.stock?.jumlah ?? 0,
            stacks: [...((product.stock?.tumpukan_detail as number[]) ?? [])],
          });
        }
        const currentStock = liveStock.get(product.id)!;

        if (item.qtyKirim > currentStock.jumlah) {
          errors.push(`${product.kode}: Stok tidak cukup (sisa ${currentStock.jumlah})`);
          continue;
        }

        const price = getPrice(item);
        const tokoName = item.toko.trim() || globalToko.trim() || "";
        const createdAt = tanggal
          ? new Date(tanggal.getFullYear(), tanggal.getMonth(), tanggal.getDate(), 12, 0, 0).toISOString()
          : undefined;

        const result = await registerStockOut({
          productId: product.id,
          qtyPesan: item.qtyPesan,
          qtyKirim: item.qtyKirim,
          hargaType: item.hargaType === "custom" ? "custom" : item.hargaType,
          hargaSatuan: price,
          catatan,
          toko: tokoName,
          createdAt,
        });

        const newJumlah = currentStock.jumlah - item.qtyKirim;
        currentStock.jumlah = result.new_jumlah ?? newJumlah;
        currentStock.stacks = Array.isArray(result.new_tumpukan_detail)
          ? result.new_tumpukan_detail
          : deductFromStacks(currentStock.stacks, item.qtyKirim);
        successCount++;
        successfulItems.push(item);
      } catch (error) {
        errors.push(`${item.kode}: ${getErrorMessage(error, "Gagal menyimpan transaksi")}`);
      }
    }

    if (errors.length > 0) {
      const errorPreview = errors.slice(0, 3).join("; ");
      const extraErrorCount = errors.length - Math.min(errors.length, 3);
      toast({
        title: `${successCount} berhasil, ${errors.length} gagal`,
        description: `${errorPreview}${extraErrorCount > 0 ? `; +${extraErrorCount} error lagi` : ""}. Item yang gagal tetap ada di form.`,
        variant: "destructive",
      });
    } else {
      toast({ title: "Berhasil", description: `${successCount} item berhasil disimpan` });
    }

    if (successfulItems.length > 0) {
      const summary = successfulItems.map((item) => `${item.kode} x${item.qtyKirim}`).join(", ");
      logActivity("stock_out", `${errors.length > 0 ? "Barang keluar parsial" : "Barang keluar"}: ${summary}`, {
        toko: globalToko,
        items: successfulItems.map((item) => ({ kode: item.kode, qty: item.qtyKirim })),
      });
    }

    if (successCount > 0) {
      const successfulSet = new Set(successfulItems);
      const remainingItems = items.filter((item) => !successfulSet.has(item));
      const hasPendingItems = remainingItems.some((item) =>
        item.kode.trim() || item.productId || item.qtyPesan > 0 || item.qtyKirim > 0 || item.toko.trim(),
      );

      if (hasPendingItems) {
        setItems(remainingItems);
      } else {
        setItems([createEmptyLineItem()]);
        setGlobalToko("");
        setCatatan("");
        setTanggal(undefined);
      }

      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
    setSubmitting(false);
  };

  const handleOcrResult = (ocrItems: BarangKeluarOcrItem[]) => {
    const newItems: LineItem[] = ocrItems.map((item) => {
      const found = findProductMatch(products, { productId: item.productId, kode: item.kode, kategori: item.kategori });
      return {
        kode: (found?.kode || item.kode || "").toUpperCase(),
        qtyPesan: item.qty_pesan || 0,
        qtyKirim: item.qty_kirim || item.qty || 0,
        hargaType: item.harga_type || "normal",
        toko: "",
        productId: found?.id,
        productKode: found?.kode,
        productName: found?.nama,
        productKategori: found?.kategori,
      };
    });
    setItems(prev => {
      const existing = prev.filter(i => i.kode.trim());
      return [...existing, ...newItems];
    });
  };

  const handleDeleteTransaction = async (item: StockOutHistoryEntry) => {
    setDeletingId(item.id);
    try {
      await deleteStockOutTransaction(item.id);
      toast({ title: "Berhasil", description: `Transaksi ${item.products?.kode} dihapus, stok dikembalikan +${item.qty_kirim}` });
      logActivity("stock_out_delete", `Hapus transaksi ${item.products?.kode} x${item.qty_kirim}`, { kode: item.products?.kode, qty: item.qty_kirim });
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      toast({ title: "Error", description: getErrorMessage(error, "Gagal menghapus transaksi"), variant: "destructive" });
    }
    setDeletingId(null);
  };

  const validCount = items.filter(i => i.productId && i.qtyKirim > 0).length;
  const totalQty = items.filter(i => i.productId && i.qtyKirim > 0).reduce((s, i) => s + i.qtyKirim, 0);
  const totalRevenue = items.filter(i => i.productId && i.qtyKirim > 0).reduce((s, i) => s + getPrice(i) * i.qtyKirim, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-destructive/10 shadow-sm">
            <PackageMinus className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">Barang Keluar</h1>
            <p className="text-muted-foreground text-xs font-medium">Catat penjualan / pengiriman</p>
          </div>
        </div>
        <OcrUpload mode="keluar" onResult={handleOcrResult} />
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-destructive/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-destructive tabular-nums">{todaySummary.count}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Transaksi</p>
        </div>
        <div className="card-premium bg-warning/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(todaySummary.qty)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Qty Hari Ini</p>
        </div>
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-lg font-extrabold text-success tabular-nums truncate">{formatRupiah(todaySummary.revenue)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Omzet Hari Ini</p>
        </div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fokus Input</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Isi toko, tanggal, lalu pastikan qty kirim dan harga sudah sesuai sebelum simpan.</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Item Valid</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{validCount > 0 ? `${validCount} item siap dikirim` : "Belum ada item valid"}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nilai Draft</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{validCount > 0 ? formatRupiah(totalRevenue) : "Belum ada nilai draft"}</p>
        </div>
      </div>

      {/* ── Input Card ── */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-destructive/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <PackageMinus className="h-4 w-4 text-destructive" />
            Input Barang Keluar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Global: Toko + Tanggal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</Label>
              <Input value={globalToko} onChange={e => setGlobalToko(e.target.value)} placeholder="Nama toko atau pelanggan..." className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Tanggal (opsional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-lg mt-1", !tanggal && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {tanggal ? format(tanggal, "dd MMM yyyy", { locale: localeId }) : "Hari ini"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={tanggal} onSelect={setTanggal} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {tanggal && <button onClick={() => setTanggal(undefined)} className="text-[10px] text-primary mt-0.5 hover:underline">Reset ke hari ini</button>}
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</Label>
              <Textarea value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Catatan..." rows={1} className="rounded-lg mt-1" />
            </div>
          </div>

          {/* Set Harga Sekaligus */}
          {validItemsForHarga.length > 0 && (
            <Dialog open={hargaDialogOpen} onOpenChange={setHargaDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full rounded-xl min-h-[40px] gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-4 w-4" />
                  Atur Harga Sekaligus
                  <Badge variant="secondary" className="text-[10px] ml-auto">{validItemsForHarga.length} item</Badge>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <SlidersHorizontal className="h-4 w-4" />
                    Atur Harga Sekaligus
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {warnaItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">🎨 Warna ({warnaItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        const filter = (k: string) => !k.includes("WHT") && !k.includes("BLCK") && !k.includes("BLK");
                        if (v === "custom") {
                          if (customWarnaHarga > 0) applyBulkHarga(filter, "custom", customWarnaHarga);
                        } else {
                          applyBulkHarga(filter, v as HargaType);
                        }
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(warnaItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(warnaItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="grosir2">Grosir 2{getBulkPriceLabel(warnaItems, "harga_grosir2")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input type="text" inputMode="numeric" className="h-9 text-sm flex-1" placeholder="Custom /pcs" value={customWarnaHarga || ""} onChange={(e) => setCustomWarnaHarga(parseInt(e.target.value) || 0)} />
                        <Button size="sm" variant="secondary" className="h-9 text-xs shrink-0" disabled={!customWarnaHarga} onClick={() => {
                          const filter = (k: string) => !k.includes("WHT") && !k.includes("BLCK") && !k.includes("BLK");
                          applyBulkHarga(filter, "custom", customWarnaHarga);
                        }}>Terapkan</Button>
                      </div>
                    </div>
                  )}
                  {whtItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">⬜ WHT ({whtItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        const filter = (k: string) => k.includes("WHT");
                        if (v === "custom") {
                          if (customWhtHarga > 0) applyBulkHarga(filter, "custom", customWhtHarga);
                        } else {
                          applyBulkHarga(filter, v as HargaType);
                        }
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(whtItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(whtItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input type="text" inputMode="numeric" className="h-9 text-sm flex-1" placeholder="Custom /pcs" value={customWhtHarga || ""} onChange={(e) => setCustomWhtHarga(parseInt(e.target.value) || 0)} />
                        <Button size="sm" variant="secondary" className="h-9 text-xs shrink-0" disabled={!customWhtHarga} onClick={() => applyBulkHarga((k) => k.includes("WHT"), "custom", customWhtHarga)}>Terapkan</Button>
                      </div>
                    </div>
                  )}
                  {blckItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">⬛ BLCK ({blckItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        const filter = (k: string) => k.includes("BLCK") || k.includes("BLK");
                        if (v === "custom") {
                          if (customBlckHarga > 0) applyBulkHarga(filter, "custom", customBlckHarga);
                        } else {
                          applyBulkHarga(filter, v as HargaType);
                        }
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(blckItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(blckItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input type="text" inputMode="numeric" className="h-9 text-sm flex-1" placeholder="Custom /pcs" value={customBlckHarga || ""} onChange={(e) => setCustomBlckHarga(parseInt(e.target.value) || 0)} />
                        <Button size="sm" variant="secondary" className="h-9 text-xs shrink-0" disabled={!customBlckHarga} onClick={() => applyBulkHarga((k) => k.includes("BLCK") || k.includes("BLK"), "custom", customBlckHarga)}>Terapkan</Button>
                      </div>
                    </div>
                  )}
                <Button className="w-full rounded-xl" onClick={() => setHargaDialogOpen(false)}>Selesai</Button>
              </div>
            </DialogContent>
          </Dialog>
          )}

          {/* Item rows */}
          {items.map((item, i) => {
            const matched = getMatchedProduct(item);
            const stok = matched?.stock?.jumlah ?? 0;
            const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];
            const overStock = matched && item.qtyKirim > stok;
            const price = getPrice(item);
            const total = price * item.qtyKirim;
            const kategori = matched?.kategori;
            const unitLabel = kategori === "18 Gram" ? "pack" : "pcs";

            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-3 space-y-2 transition-all duration-200",
                  !item.productId && item.kode ? "border-destructive/30 bg-destructive/[0.03]" :
                  overStock ? "border-warning/30 bg-warning/[0.03]" :
                  item.productId ? "border-success/30 bg-success/[0.03] shadow-sm" :
                  "border-border/60 hover:border-border"
                )}
              >
                {/* Row 1: Kode + Delete */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <Input
                      placeholder="Ketik kode produk..."
                      value={item.kode}
                      onChange={e => updateItem(i, "kode", e.target.value.toUpperCase())}
                      list="product-codes-out"
                      className="rounded-lg font-mono"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded-lg h-10 w-10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Product info */}
                {matched && (
                  <div className="flex items-center justify-between text-xs">
                    <p className="text-success font-medium flex items-center gap-1 truncate">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> {matched.nama}
                      {kategori && kategori !== "2 Ons" && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{kategori}</Badge>
                      )}
                    </p>
                    <span className={cn("font-bold tabular-nums", overStock ? "text-destructive" : "text-muted-foreground")}>
                      Stok: {formatNumber(stok)}
                    </span>
                  </div>
                )}
                {item.kode && !item.productId && (
                  <p className="text-xs text-destructive font-medium">Produk tidak ditemukan</p>
                )}

                {/* Row 2: Qty + Harga */}
                {matched && (
                  <div className="flex items-end gap-2">
                    <div className="w-20">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Pesan</label>
                      <Input
                        type="text" inputMode="numeric"
                        className="h-9 text-sm mt-0.5 text-center font-bold"
                        value={item.qtyPesan === 0 ? "" : item.qtyPesan}
                        onChange={e => updateItem(i, "qtyPesan", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Kirim ({unitLabel})</label>
                      <Input
                        type="text" inputMode="numeric"
                        className="h-9 text-sm mt-0.5 text-center font-bold"
                        value={item.qtyKirim === 0 ? "" : item.qtyKirim}
                        onChange={e => updateItem(i, "qtyKirim", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Harga</label>
                      <Select value={item.hargaType} onValueChange={v => updateItem(i, "hargaType", v as HargaType)}>
                        <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal {matched.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                          <SelectItem value="grosir">Grosir {matched.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                          {matched.prices?.harga_grosir2 ? <SelectItem value="grosir2">Grosir 2 ({formatRupiah(matched.prices.harga_grosir2)})</SelectItem> : null}
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Custom harga input */}
                {item.hargaType === "custom" && matched && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground shrink-0">Harga custom:</Label>
                    <Input
                      type="text" inputMode="numeric"
                      className="h-8 text-xs text-right font-bold flex-1"
                      placeholder="Rp ..."
                      value={item.customHarga === undefined || item.customHarga === 0 ? "" : item.customHarga}
                      onChange={e => updateItem(i, "customHarga", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}

                {/* Total + stacks */}
                {matched && item.qtyKirim > 0 && !overStock && (
                  <div className="flex items-center justify-between text-xs">
                    {currentStacks.length > 0 && (
                      <TumpukanBadges stacks={deductFromStacks(currentStacks, item.qtyKirim)} kode={matched.kode} compact />
                    )}
                    <span className="text-sm font-bold text-primary tabular-nums ml-auto">
                      {formatRupiah(total)}
                    </span>
                  </div>
                )}
                {overStock && <p className="text-xs text-destructive font-bold">Stok tidak cukup</p>}
              </div>
            );
          })}

          <datalist id="product-codes-out">
            {products?.map(p => <option key={p.id} value={p.kode} label={`${p.kode} - ${p.nama}`} />)}
          </datalist>

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          {/* Summary */}
          {validCount > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ringkasan draft</span>
                <span className="font-extrabold text-primary tabular-nums">{formatRupiah(totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{validCount} item siap disimpan</span>
                <span>{formatNumber(totalQty)} {items.some(i => getMatchedProduct(i)?.kategori === "18 Gram") ? "unit" : "pcs"}</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-destructive hover:bg-destructive/90"
          >
            <Send className="h-5 w-5 mr-2" />
            {submitting ? "Menyimpan..." : `Simpan Barang Keluar${validCount > 0 ? ` (${validCount} item)` : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* ── Riwayat ── */}
      <BarangKeluarHistory
        history={history}
        isLoading={historyLoading}
        role={role}
        deletingId={deletingId}
        onDeleteTransaction={handleDeleteTransaction}
      />
    </div>
  );
};

export default BarangKeluar;
