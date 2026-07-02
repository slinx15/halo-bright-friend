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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Boxes,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  FileEdit,
  PackageMinus,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { OcrUpload } from "@/components/OcrUpload";
import { BarangKeluarHistory } from "@/components/keluar/BarangKeluarHistory";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import {
  getTodayStockOutSummary,
  useStockOutHistory,
  type StockOutHistoryEntry,
} from "@/hooks/useStockOutHistory";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [globalToko, setGlobalToko] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const [hargaDialogOpen, setHargaDialogOpen] = useState(false);
  const [customWarnaHarga, setCustomWarnaHarga] = useState<number>(0);
  const [customWhtHarga, setCustomWhtHarga] = useState<number>(0);
  const [customBlckHarga, setCustomBlckHarga] = useState<number>(0);

  const validItemsForHarga = useMemo(() => items.filter((item) => item.productId), [items]);
  const warnaItems = useMemo(
    () =>
      validItemsForHarga.filter((item) => {
        const kode = (item.productKode || item.kode).toUpperCase();
        return !kode.includes("WHT") && !kode.includes("BLCK") && !kode.includes("BLK");
      }),
    [validItemsForHarga],
  );
  const whtItems = useMemo(
    () => validItemsForHarga.filter((item) => (item.productKode || item.kode).toUpperCase().includes("WHT")),
    [validItemsForHarga],
  );
  const blckItems = useMemo(
    () =>
      validItemsForHarga.filter((item) => {
        const kode = (item.productKode || item.kode).toUpperCase();
        return kode.includes("BLCK") || kode.includes("BLK");
      }),
    [validItemsForHarga],
  );

  const getBulkPriceLabel = useCallback(
    (itemList: LineItem[], priceKey: "harga_normal" | "harga_grosir" | "harga_grosir2") => {
      const prices = itemList
        .map((item) => products?.find((product) => product.id === item.productId)?.prices?.[priceKey] ?? 0)
        .filter((price) => price > 0);
      if (prices.length === 0) return "";
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max
        ? ` (${formatRupiah(min)})`
        : ` (${formatRupiah(min)} - ${formatRupiah(max)})`;
    },
    [products],
  );

  const applyBulkHarga = useCallback(
    (filter: (kode: string) => boolean, type: HargaType, customHarga?: number) => {
      setItems((prev) =>
        prev.map((item) => {
          if (!item.productId) return item;
          const kode = (item.productKode || item.kode).toUpperCase();
          if (!filter(kode)) return item;
          if (type === "custom" && customHarga && customHarga > 0) {
            return { ...item, hargaType: "custom", customHarga };
          }
          if (type !== "custom") {
            return { ...item, hargaType: type };
          }
          return item;
        }),
      );
    },
    [],
  );

  const findProduct = (input: string) => findProductMatch(products, { kode: input }) || undefined;

  const updateItem = <K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) => {
    setItems((prev) => {
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

  const addLine = () => setItems((prev) => [...prev, createEmptyLineItem()]);
  const removeLine = (index: number) => setItems((prev) => prev.filter((_, idx) => idx !== index));

  const getMatchedProduct = (item: LineItem) => products?.find((product) => product.id === item.productId);

  const getPrice = (item: LineItem) => {
    const product = getMatchedProduct(item);
    if (!product?.prices) return 0;
    if (item.hargaType === "custom") return item.customHarga ?? 0;
    if (item.hargaType === "grosir2") return product.prices.harga_grosir2;
    if (item.hargaType === "grosir") return product.prices.harga_grosir;
    return product.prices.harga_normal;
  };

  const todaySummary = useMemo(() => getTodayStockOutSummary(history), [history]);

  const handleSubmit = async () => {
    const validItems = items.filter((item) => item.productId && item.qtyKirim > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }

    const missingFields: string[] = [];
    const tokoFilled = globalToko.trim() || validItems.every((item) => item.toko.trim());
    if (!tokoFilled) missingFields.push("Nama Toko");
    if (!tanggal) missingFields.push("Tanggal");
    if (validItems.some((item) => getPrice(item) <= 0)) missingFields.push("Harga (ada item dengan harga Rp 0)");

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

        const createdAt = tanggal
          ? new Date(
              tanggal.getFullYear(),
              tanggal.getMonth(),
              tanggal.getDate(),
              12,
              0,
              0,
            ).toISOString()
          : undefined;

        const result = await registerStockOut({
          productId: product.id,
          qtyPesan: item.qtyPesan,
          qtyKirim: item.qtyKirim,
          hargaType: item.hargaType === "custom" ? "custom" : item.hargaType,
          hargaSatuan: getPrice(item),
          catatan,
          toko: item.toko.trim() || globalToko.trim() || "",
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
      const hasPendingItems = remainingItems.some(
        (item) => item.kode.trim() || item.productId || item.qtyPesan > 0 || item.qtyKirim > 0 || item.toko.trim(),
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
      const found = findProductMatch(products, {
        productId: item.productId,
        kode: item.kode,
        kategori: item.kategori,
      });

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

    setItems((prev) => {
      const existing = prev.filter((item) => item.kode.trim());
      return [...existing, ...newItems];
    });
  };

  const handleDeleteTransaction = async (item: StockOutHistoryEntry) => {
    setDeletingId(item.id);
    try {
      await deleteStockOutTransaction(item.id);
      toast({
        title: "Berhasil",
        description: `Transaksi ${item.products?.kode} dihapus, stok dikembalikan +${item.qty_kirim}`,
      });
      logActivity("stock_out_delete", `Hapus transaksi ${item.products?.kode} x${item.qty_kirim}`, {
        kode: item.products?.kode,
        qty: item.qty_kirim,
      });
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Gagal menghapus transaksi"),
        variant: "destructive",
      });
    }
    setDeletingId(null);
  };

  const validCount = items.filter((item) => item.productId && item.qtyKirim > 0).length;
  const totalQty = items
    .filter((item) => item.productId && item.qtyKirim > 0)
    .reduce((sum, item) => sum + item.qtyKirim, 0);
  const totalRevenue = items
    .filter((item) => item.productId && item.qtyKirim > 0)
    .reduce((sum, item) => sum + getPrice(item) * item.qtyKirim, 0);
  const selectedDateLabel = tanggal ? format(tanggal, "dd MMM yyyy", { locale: localeId }) : "Hari ini";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6 [&>*]:animate-fade-in [&>*]:[animation-fill-mode:both] [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms]">
      <section className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-border/70 bg-card/95 px-4 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-2xl bg-destructive/10 p-3 shadow-sm">
            <PackageMinus className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight text-foreground sm:text-xl">
              Barang Keluar
            </h1>
            <p className="text-sm text-muted-foreground">Catat penjualan dan pengiriman dengan stok tetap terjaga</p>
          </div>
        </div>
        <div className="shrink-0">
          <OcrUpload mode="keluar" onResult={handleOcrResult} />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border/70 bg-card/95 p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-destructive/15 bg-destructive/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-destructive/80">Transaksi</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-destructive tabular-nums">{todaySummary.count}</p>
            <p className="mt-1 text-[11px] text-destructive/75">Hari ini</p>
          </div>
          <div className="rounded-2xl border border-warning/15 bg-warning/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">Qty</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-foreground tabular-nums">{formatNumber(todaySummary.qty)}</p>
            <p className="mt-1 text-[11px] text-foreground/60">Keluar hari ini</p>
          </div>
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Omzet</p>
            <p className="mt-1 truncate text-xl font-extrabold leading-none text-primary tabular-nums">
              {formatRupiah(todaySummary.revenue)}
            </p>
            <p className="mt-1 text-[11px] text-primary/75">Total hari ini</p>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden rounded-[1.6rem] border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <PackageMinus className="h-4 w-4 text-destructive" />
            Input Barang Keluar
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</Label>
              <Input
                value={globalToko}
                onChange={(event) => setGlobalToko(event.target.value)}
                placeholder="Nama toko atau pelanggan..."
                className="mt-1 rounded-xl border-border/70 bg-card"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Tanggal</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "mt-1 w-full justify-start rounded-xl border-border/70 bg-card text-left font-normal",
                      !tanggal && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDateLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={tanggal}
                    onSelect={setTanggal}
                    initialFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
              {tanggal && (
                <button onClick={() => setTanggal(undefined)} className="mt-0.5 text-[10px] text-primary hover:underline">
                  Reset ke hari ini
                </button>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</Label>
              <Textarea
                value={catatan}
                onChange={(event) => setCatatan(event.target.value)}
                placeholder="Catatan..."
                rows={1}
                className="mt-1 rounded-xl border-border/70 bg-card"
              />
            </div>
          </div>

          {validItemsForHarga.length > 0 && (
            <Dialog open={hargaDialogOpen} onOpenChange={setHargaDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="min-h-[44px] w-full rounded-2xl gap-2 font-semibold">
                  <SlidersHorizontal className="h-4 w-4" />
                  Atur Harga Sekaligus
                  <Badge variant="secondary" className="ml-auto rounded-full text-[10px]">
                    {validItemsForHarga.length} item
                  </Badge>
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
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Warna ({warnaItems.length} item)</label>
                      <Select
                        onValueChange={(value) => {
                          const filter = (kode: string) => !kode.includes("WHT") && !kode.includes("BLCK") && !kode.includes("BLK");
                          if (value === "custom") {
                            if (customWarnaHarga > 0) applyBulkHarga(filter, "custom", customWarnaHarga);
                          } else {
                            applyBulkHarga(filter, value as HargaType);
                          }
                        }}
                      >
                        <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(warnaItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(warnaItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="grosir2">Grosir 2{getBulkPriceLabel(warnaItems, "harga_grosir2")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-9 flex-1 text-sm"
                          placeholder="Custom /pcs"
                          value={customWarnaHarga || ""}
                          onChange={(event) => setCustomWarnaHarga(parseInt(event.target.value, 10) || 0)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 shrink-0 text-xs"
                          disabled={!customWarnaHarga}
                          onClick={() => {
                            const filter = (kode: string) => !kode.includes("WHT") && !kode.includes("BLCK") && !kode.includes("BLK");
                            applyBulkHarga(filter, "custom", customWarnaHarga);
                          }}
                        >
                          Terapkan
                        </Button>
                      </div>
                    </div>
                  )}

                  {whtItems.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">WHT ({whtItems.length} item)</label>
                      <Select
                        onValueChange={(value) => {
                          const filter = (kode: string) => kode.includes("WHT");
                          if (value === "custom") {
                            if (customWhtHarga > 0) applyBulkHarga(filter, "custom", customWhtHarga);
                          } else {
                            applyBulkHarga(filter, value as HargaType);
                          }
                        }}
                      >
                        <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(whtItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(whtItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-9 flex-1 text-sm"
                          placeholder="Custom /pcs"
                          value={customWhtHarga || ""}
                          onChange={(event) => setCustomWhtHarga(parseInt(event.target.value, 10) || 0)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 shrink-0 text-xs"
                          disabled={!customWhtHarga}
                          onClick={() => applyBulkHarga((kode) => kode.includes("WHT"), "custom", customWhtHarga)}
                        >
                          Terapkan
                        </Button>
                      </div>
                    </div>
                  )}

                  {blckItems.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">BLCK ({blckItems.length} item)</label>
                      <Select
                        onValueChange={(value) => {
                          const filter = (kode: string) => kode.includes("BLCK") || kode.includes("BLK");
                          if (value === "custom") {
                            if (customBlckHarga > 0) applyBulkHarga(filter, "custom", customBlckHarga);
                          } else {
                            applyBulkHarga(filter, value as HargaType);
                          }
                        }}
                      >
                        <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal{getBulkPriceLabel(blckItems, "harga_normal")}</SelectItem>
                          <SelectItem value="grosir">Grosir{getBulkPriceLabel(blckItems, "harga_grosir")}</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-9 flex-1 text-sm"
                          placeholder="Custom /pcs"
                          value={customBlckHarga || ""}
                          onChange={(event) => setCustomBlckHarga(parseInt(event.target.value, 10) || 0)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 shrink-0 text-xs"
                          disabled={!customBlckHarga}
                          onClick={() => applyBulkHarga((kode) => kode.includes("BLCK") || kode.includes("BLK"), "custom", customBlckHarga)}
                        >
                          Terapkan
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button className="w-full rounded-xl" onClick={() => setHargaDialogOpen(false)}>
                    Selesai
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {items.map((item, index) => {
            const matched = getMatchedProduct(item);
            const stok = matched?.stock?.jumlah ?? 0;
            const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];
            const overStock = !!matched && item.qtyKirim > stok;
            const total = getPrice(item) * item.qtyKirim;
            const unitLabel = matched?.kategori === "18 Gram" ? "pack" : "pcs";

            return (
              <div
                key={index}
                className={cn(
                  "space-y-2.5 rounded-[1.2rem] border p-3.5 transition-all duration-200",
                  !item.productId && item.kode
                    ? "border-destructive/25 bg-destructive/[0.04]"
                    : overStock
                      ? "border-warning/25 bg-warning/[0.05]"
                      : item.productId
                        ? "border-primary/20 bg-primary/[0.035]"
                        : "border-border/60 bg-background/55 hover:border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder="Ketik kode produk..."
                      value={item.kode}
                      onChange={(event) => updateItem(index, "kode", event.target.value.toUpperCase())}
                      list="product-codes-out"
                      className="rounded-xl border-border/70 bg-card font-mono"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                      className="h-10 w-10 shrink-0 rounded-xl text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {matched && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <p className="flex min-w-0 items-center gap-1 truncate font-medium text-primary">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      {matched.nama}
                      {matched.kategori && matched.kategori !== "2 Ons" && (
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[9px]">
                          {matched.kategori}
                        </Badge>
                      )}
                    </p>
                    <span className={cn("font-bold tabular-nums", overStock ? "text-destructive" : "text-muted-foreground")}>
                      Stok: {formatNumber(stok)}
                    </span>
                  </div>
                )}

                {item.kode && !item.productId && (
                  <p className="text-xs font-medium text-destructive">Produk tidak ditemukan</p>
                )}

                {matched && (
                  <div className="grid grid-cols-[84px_84px_minmax(0,1fr)] items-end gap-2">
                    <div>
                      <label className="text-[9px] font-semibold uppercase text-muted-foreground">Pesan</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="mt-0.5 h-9 rounded-xl text-center text-sm font-bold"
                        value={item.qtyPesan === 0 ? "" : item.qtyPesan}
                        onChange={(event) => updateItem(index, "qtyPesan", event.target.value === "" ? 0 : parseInt(event.target.value, 10) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold uppercase text-muted-foreground">
                        Kirim ({unitLabel})
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="mt-0.5 h-9 rounded-xl text-center text-sm font-bold"
                        value={item.qtyKirim === 0 ? "" : item.qtyKirim}
                        onChange={(event) => updateItem(index, "qtyKirim", event.target.value === "" ? 0 : parseInt(event.target.value, 10) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold uppercase text-muted-foreground">Harga</label>
                      <Select value={item.hargaType} onValueChange={(value) => updateItem(index, "hargaType", value as HargaType)}>
                        <SelectTrigger className="mt-0.5 h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal {matched.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                          <SelectItem value="grosir">Grosir {matched.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                          {matched.prices?.harga_grosir2 ? (
                            <SelectItem value="grosir2">Grosir 2 ({formatRupiah(matched.prices.harga_grosir2)})</SelectItem>
                          ) : null}
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {item.hargaType === "custom" && matched && (
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-[10px] text-muted-foreground">Harga custom:</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-8 flex-1 text-right text-xs font-bold"
                      placeholder="Rp ..."
                      value={item.customHarga === undefined || item.customHarga === 0 ? "" : item.customHarga}
                      onChange={(event) => updateItem(index, "customHarga", event.target.value === "" ? 0 : parseInt(event.target.value, 10) || 0)}
                    />
                  </div>
                )}

                {matched && item.qtyKirim > 0 && !overStock && (
                  <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      {currentStacks.length > 0 ? (
                        <TumpukanBadges stacks={deductFromStacks(currentStacks, item.qtyKirim)} kode={matched.kode} compact />
                      ) : (
                        <span className="text-muted-foreground">Tanpa detail tumpukan</span>
                      )}
                      <span className="ml-auto text-sm font-bold text-primary tabular-nums">
                        {formatRupiah(total)}
                      </span>
                    </div>
                  </div>
                )}

                {overStock && <p className="text-xs font-bold text-destructive">Stok tidak cukup</p>}
              </div>
            );
          })}

          <datalist id="product-codes-out">
            {products?.map((product) => (
              <option key={product.id} value={product.kode} label={`${product.kode} - ${product.nama}`} />
            ))}
          </datalist>

          <Button
            variant="outline"
            size="sm"
            onClick={addLine}
            className="min-h-[44px] rounded-xl transition-all duration-150 active:scale-95"
          >
            <Plus className="mr-1 h-4 w-4" />
            Tambah Baris
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="h-12 w-full rounded-2xl bg-destructive text-base font-bold shadow-md transition-all duration-150 active:scale-[0.98] hover:bg-destructive/90 hover:shadow-lg"
          >
            <Send className="mr-2 h-5 w-5" />
            {submitting ? "Menyimpan..." : `Simpan Barang Keluar${validCount > 0 ? ` (${validCount} item)` : ""}`}
          </Button>
        </CardContent>
      </Card>

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
