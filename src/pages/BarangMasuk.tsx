import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Boxes,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  FileEdit,
  Minus,
  PackagePlus,
  Plus,
  Send,
  Trash2,
} from "lucide-react";



import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { BarangMasukHistory } from "@/components/masuk/BarangMasukHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

import { useProducts } from "@/hooks/useProducts";
import { useStockInHistory } from "@/hooks/useStockInHistory";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { createDebtItem, getDebtItems, saveDebtItems } from "@/lib/hutangStore";
import { findProductMatch } from "@/lib/productMatcher";
import { registerStockIn } from "@/lib/stockMutations";
import { addStacks, splitIntoStacks } from "@/lib/tumpukanUtils";
import { cn } from "@/lib/utils";

interface LineItem {
  kode: string;
  qty: number;
  productName?: string;
  productId?: string;
  productKode?: string;
  productKategori?: string | null;
}

interface BarangMasukOcrItem {
  kode: string;
  qty?: number;
  nama?: string;
  productId?: string;
  kategori?: string;
  catatan?: string;
}

function createEmptyLineItem(): LineItem {
  return { kode: "", qty: 1 };
}

function getFormDate(tanggal?: Date) {
  const source = tanggal ?? new Date();
  return new Date(source.getFullYear(), source.getMonth(), source.getDate(), 12, 0, 0);
}

function createBarangMasukBonNumber(tanggal?: Date) {
  const date = getFormDate(tanggal);
  const ymd = format(date, "yyyyMMdd");
  const time = format(new Date(), "HHmmss");
  return `BM-${ymd}-${time}`;
}

const PENDING_STOCK_IN_BON_KEY = "rrc_ivory_pending_stock_in_bon_id";

function getPendingStockInBonId() {
  return localStorage.getItem(PENDING_STOCK_IN_BON_KEY);
}

function setPendingStockInBonId(id: string) {
  localStorage.setItem(PENDING_STOCK_IN_BON_KEY, id);
}

function clearPendingStockInBonId() {
  localStorage.removeItem(PENDING_STOCK_IN_BON_KEY);
}

const BarangMasuk = () => {
  const { data: products } = useProducts();
  const { data: history = [], isLoading: historyLoading } = useStockInHistory();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [catatan, setCatatan] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = <K extends keyof LineItem>(index: number, field: K, value: LineItem[K]) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === "kode" && products) {
        const found = findProductMatch(products, { kode: String(value) });
        updated[index].productName = found?.nama;
        updated[index].productId = found?.id;
        updated[index].productKode = found?.kode;
        updated[index].productKategori = found?.kategori;
      }

      return updated;
    });
  };

  const addLine = () => setItems((prev) => [...prev, createEmptyLineItem()]);
  const removeLine = (index: number) => setItems((prev) => prev.filter((_, idx) => idx !== index));

  const handleOcrResult = (ocrItems: BarangMasukOcrItem[]) => {
    const newItems: LineItem[] = ocrItems.map((item) => {
      const found = findProductMatch(products, {
        productId: item.productId,
        kode: item.kode,
        kategori: item.kategori,
      });

      return {
        kode: (found?.kode || item.kode || "").toUpperCase(),
        qty: item.qty || 1,
        productName: found?.nama || item.nama,
        productId: found?.id,
        productKode: found?.kode,
        productKategori: found?.kategori,
      };
    });

    setItems(newItems.length > 0 ? newItems : [createEmptyLineItem()]);
    if (ocrItems[0]?.catatan) setCatatan(ocrItems[0].catatan);
  };

  const handleSubmit = async () => {
    const validItems = items.filter((item) => item.productId && item.qty > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    const errors: string[] = [];
    const successfulItems: LineItem[] = [];

    for (const item of validItems) {
      try {
        const kode = item.productKode || item.kode;
        const newStacks = splitIntoStacks(item.qty, kode, item.productKategori || undefined);
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

        await registerStockIn({
          productId: item.productId!,
          qty: item.qty,
          tumpukanDetail: newStacks,
          catatan,
          createdAt,
        });

        successCount++;
        successfulItems.push(item);
      } catch (error) {
        errors.push(`${item.kode}: ${getErrorMessage(error, "Gagal menyimpan barang masuk")}`);
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
      toast({ title: "Berhasil", description: `${validItems.length} item masuk tercatat` });
    }

    if (successfulItems.length > 0) {
      const summary = successfulItems
        .map((item) => `${item.productKode || item.kode} x${item.qty}`)
        .join(", ");

      const totalModal = successfulItems.reduce((sum, item) => {
        const product = products?.find((entry) => entry.id === item.productId);
        return sum + (product?.prices?.harga_modal ?? 0) * item.qty;
      }, 0);

      const successfulSet = new Set(successfulItems);
      const remainingItems = items.filter((item) => !successfulSet.has(item));
      const hasPendingItems = remainingItems.some((item) => item.kode.trim() || item.productId);

      if (totalModal > 0) {
        const invoiceDate = format(getFormDate(tanggal), "yyyy-MM-dd");
        const currentDebts = getDebtItems();
        const pendingBonId = getPendingStockInBonId();
        const pendingBon = pendingBonId
          ? currentDebts.find((item) => item.id === pendingBonId && item.status === "open")
          : undefined;

        if (pendingBon) {
          const updatedDebts = currentDebts.map((item) =>
            item.id === pendingBon.id
              ? {
                  ...item,
                  amount: item.amount + totalModal,
                  note: `${item.note}; tambahan: ${summary}`,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          );
          saveDebtItems(updatedDebts);
        } else {
          const bon = createDebtItem({
            invoiceNumber: createBarangMasukBonNumber(tanggal),
            amount: totalModal,
            invoiceDate,
            note: `Dari barang masuk: ${summary}`,
            sourceType: "manual",
          });
          saveDebtItems([bon, ...currentDebts]);
          if (hasPendingItems) {
            setPendingStockInBonId(bon.id);
          }
        }

        if (!hasPendingItems) {
          clearPendingStockInBonId();
        }
      } else {
        toast({
          title: "Bon hutang belum dibuat",
          description: "Harga modal item belum terbaca",
          variant: "destructive",
        });
      }

      logActivity(
        "stock_in",
        `${errors.length > 0 ? "Barang masuk parsial" : "Barang masuk"}: ${summary}`,
        {
          items: successfulItems.map((item) => ({
            kode: item.productKode || item.kode,
            qty: item.qty,
          })),
        },
      );
    }

    if (successCount > 0) {
      const successfulSet = new Set(successfulItems);
      const remainingItems = items.filter((item) => !successfulSet.has(item));
      const hasPendingItems = remainingItems.some((item) => item.kode.trim() || item.productId);

      if (hasPendingItems) {
        setItems(remainingItems);
      } else {
        setItems([createEmptyLineItem()]);
        setCatatan("");
        setTanggal(undefined);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setSubmitting(false);
  };

  const validCount = items.filter((item) => item.productId && item.qty > 0).length;
  const totalQty = items
    .filter((item) => item.productId && item.qty > 0)
    .reduce((sum, item) => sum + item.qty, 0);
  const estimatedBonTotal = items
    .filter((item) => item.productId && item.qty > 0)
    .reduce((sum, item) => {
      const product = products?.find((entry) => entry.id === item.productId);
      return sum + (product?.prices?.harga_modal ?? 0) * item.qty;
    }, 0);
  const selectedDateLabel = tanggal
    ? format(tanggal, "dd MMM yyyy", { locale: localeId })
    : "Hari ini";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-32 md:space-y-5 md:p-6 md:pb-6 [&>*]:animate-fade-in [&>*]:[animation-fill-mode:both] [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms]">
      {/* HEADER — ringkas, ikon di kiri, tombol Scan Nota compact */}
      <section className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-success/10 p-1.5">
            <PackagePlus className="h-4 w-4 text-success" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">Barang Masuk</h1>
            <p className="text-xs text-muted-foreground">Catat stok masuk dengan cepat</p>
          </div>
        </div>
        <div className="shrink-0">
          <OcrUpload mode="masuk" onResult={(ocrItems) => handleOcrResult(ocrItems as BarangMasukOcrItem[])} />
        </div>
      </section>

      {/* KPI CARDS — Vibrant status cards (horizontal, 3 kolom) */}
      <section className="grid grid-cols-3 gap-2.5">
        {/* Draft */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <FileEdit className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">{items.length}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-foreground/90">Draft</p>
            <p className="text-[9px] text-muted-foreground">Menunggu</p>
          </div>
        </div>

        {/* Siap Simpan */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">{validCount}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-success">Valid</p>
            <p className="text-[9px] text-muted-foreground">Item</p>
          </div>
        </div>

        {/* Total Pcs — filled primary */}
        <div className="flex flex-col items-center justify-between rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
            <Boxes className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-primary-foreground leading-none">{formatNumber(totalQty)}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-primary-foreground">Total</p>
            <p className="text-[9px] text-primary-foreground/75">Pcs</p>
          </div>
        </div>
      </section>


      {/* INPUT FORM */}
      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 px-4 py-3 pb-2">
          <div className="rounded-lg bg-success/10 p-1.5">
            <PackagePlus className="h-4 w-4 text-success" />
          </div>
          <CardTitle className="text-sm font-semibold">Input Barang Masuk</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4 pt-1">
          {items.map((item, index) => {
            const matchedProduct = products?.find((product) => product.id === item.productId);
            const currentStacks = (matchedProduct?.stock?.tumpukan_detail as number[]) ?? [];
            const previewNewStacks =
              item.productId && item.qty > 0
                ? splitIntoStacks(item.qty, item.productKode || item.kode, item.productKategori || undefined)
                : [];
            const previewMerged =
              item.productId && item.qty > 0 ? addStacks(currentStacks, previewNewStacks) : currentStacks;

            return (
              <div
                key={index}
                className={cn(
                  "space-y-2.5 rounded-2xl border p-3 transition-all duration-200",
                  item.productId
                    ? "border-success/25 bg-success/[0.045]"
                    : item.kode && !item.productId
                      ? "border-destructive/25 bg-destructive/[0.04]"
                      : "border-border/60 bg-background/55 hover:border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder="Ketik kode produk..."
                      value={item.kode}
                      onChange={(event) => updateItem(index, "kode", event.target.value.toUpperCase())}
                      list="product-codes"
                      className="h-11 rounded-xl border-border/70 bg-card font-mono"
                    />
                  </div>
                  {/* Qty dengan tombol +/- untuk elderly UX */}
                  <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border/70 bg-card p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => updateItem(index, "qty", Math.max(0, item.qty - 1))}
                      className="h-9 w-9 rounded-lg"
                      aria-label="Kurangi"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.qty === 0 ? "" : item.qty}
                      onChange={(event) =>
                        updateItem(
                          index,
                          "qty",
                          event.target.value === "" ? 0 : parseInt(event.target.value, 10) || 0,
                        )
                      }
                      placeholder="0"
                      className="h-9 w-10 rounded-lg border-0 bg-transparent p-0 text-center text-base font-bold focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => updateItem(index, "qty", item.qty + 1)}
                      className="h-9 w-9 rounded-lg"
                      aria-label="Tambah"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(index)}
                      className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:bg-destructive/10"
                      aria-label="Hapus baris"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {item.productName && (
                  <p className="flex items-center gap-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    {item.productName}
                    {matchedProduct?.kategori && matchedProduct.kategori !== "2 Ons" && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[9px]">
                        {matchedProduct.kategori}
                      </Badge>
                    )}
                  </p>
                )}

                {item.kode && !item.productId && (
                  <p className="text-xs font-medium text-destructive">Produk tidak ditemukan</p>
                )}

                {item.productId && item.qty > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-success/15 bg-success/[0.05] p-2.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-success">Masuk</span>
                      <TumpukanBadges stacks={previewNewStacks} kode={item.productKode || item.kode} compact />
                    </div>
                    {currentStacks.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-medium text-muted-foreground">Sekarang</span>
                        <TumpukanBadges stacks={currentStacks} kode={item.productKode || item.kode} compact />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold text-foreground">Setelah</span>
                      <TumpukanBadges stacks={previewMerged} kode={item.productKode || item.kode} compact />
                      <Badge variant="secondary" className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground">
                        = {previewMerged.reduce((sum, value) => sum + value, 0)}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <datalist id="product-codes">
            {products?.map((product) => (
              <option key={product.id} value={product.nama} label={`${product.kode} - ${product.nama}`} />
            ))}
          </datalist>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estimasi Bon</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{formatRupiah(estimatedBonTotal)}</p>
              </div>
              <Badge variant="secondary" className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                Hutang Ivory
              </Badge>
            </div>
          </div>

          {/* Tombol Tambah Baris full-width, ghost style */}
          <Button
            variant="outline"
            onClick={addLine}
            className="h-11 w-full rounded-xl border-dashed text-sm font-semibold transition-all duration-150 active:scale-[0.98]"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah Baris
          </Button>

          {/* Opsi lanjutan (Tanggal & Catatan) — collapsed by default */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-full justify-between rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                <span>Opsi lanjutan {tanggal ? `· ${selectedDateLabel}` : ""} {catatan ? "· ada catatan" : ""}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Tanggal</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "mt-1 h-11 w-full justify-start rounded-xl border-border/70 bg-card text-left font-normal",
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
                    <button
                      onClick={() => setTanggal(undefined)}
                      className="mt-0.5 text-[10px] text-primary hover:underline"
                    >
                      Reset ke hari ini
                    </button>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Catatan</Label>
                  <Textarea
                    value={catatan}
                    onChange={(event) => setCatatan(event.target.value)}
                    placeholder="Catatan..."
                    rows={2}
                    className="mt-1 rounded-xl border-border/70 bg-card"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Tombol Simpan — disabled state jelas abu-abu */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className={cn(
              "h-12 w-full rounded-2xl text-base font-bold shadow-md transition-all duration-150 active:scale-[0.98]",
              validCount === 0 || submitting
                ? "bg-muted text-muted-foreground shadow-none hover:bg-muted"
                : "bg-gradient-to-r from-success via-emerald-500 to-primary text-primary-foreground hover:shadow-lg",
            )}
          >
            <Send className="mr-2 h-5 w-5" />
            {submitting ? "Menyimpan..." : validCount > 0 ? `Simpan ${validCount} Item + Bon` : "Belum ada item valid"}
          </Button>
        </CardContent>
      </Card>


      <BarangMasukHistory history={history} isLoading={historyLoading} />
    </div>
  );
};

export default BarangMasuk;
