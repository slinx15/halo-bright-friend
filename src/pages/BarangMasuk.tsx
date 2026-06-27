import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  CalendarIcon,
  CheckCircle2,
  PackagePlus,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

import { OcrUpload } from "@/components/OcrUpload";
import { PageHeader } from "@/components/PageHeader";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { BarangMasukHistory } from "@/components/masuk/BarangMasukHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useProducts } from "@/hooks/useProducts";
import { useStockInHistory } from "@/hooks/useStockInHistory";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/formatters";
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
  const selectedDateLabel = tanggal
    ? format(tanggal, "dd MMM yyyy", { locale: localeId })
    : "Hari ini";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6 [&>*]:animate-fade-in [&>*]:[animation-fill-mode:both] [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms]">
      <PageHeader
        icon={PackagePlus}
        iconColor="text-success"
        iconBg="bg-success/10"
        title="Barang Masuk"
        subtitle="Catat stok masuk dengan cepat dan tetap rapi"
        actions={<OcrUpload mode="masuk" onResult={(ocrItems) => handleOcrResult(ocrItems as BarangMasukOcrItem[])} />}
      />

      <section className="rounded-[1.35rem] border border-border/70 bg-card/95 p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-success/15 bg-success/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-success/80">Baris</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-success tabular-nums">{items.length}</p>
            <p className="mt-1 text-[11px] text-success/80">Draft masuk</p>
          </div>
          <div className="rounded-2xl border border-primary/15 bg-primary/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Valid</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-primary tabular-nums">{validCount}</p>
            <p className="mt-1 text-[11px] text-primary/80">Siap simpan</p>
          </div>
          <div className="rounded-2xl border border-warning/15 bg-warning/10 px-3 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">Total</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-foreground tabular-nums">{formatNumber(totalQty)}</p>
            <p className="mt-1 text-[11px] text-foreground/60">Pcs masuk</p>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden rounded-[1.6rem] border-success/15 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(180deg,hsl(var(--success)/0.10),transparent)] pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <PackagePlus className="h-4 w-4 text-success" />
            Input Barang Masuk
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[10px] font-semibold">
              {selectedDateLabel}
            </Badge>
            <span>{validCount > 0 ? `${validCount} item siap disimpan` : "Isi kode dan qty untuk mulai input"}</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
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
                  "space-y-2.5 rounded-[1.35rem] border p-3.5 transition-all duration-200",
                  item.productId
                    ? "border-success/25 bg-success/[0.045]"
                    : item.kode && !item.productId
                      ? "border-destructive/25 bg-destructive/[0.04]"
                      : "border-border/60 bg-background/55 hover:border-border",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Baris {index + 1}
                    </p>
                    {item.productName ? (
                      <p className="truncate text-sm font-semibold text-foreground">{item.productName}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ketik kode produk yang masuk</p>
                    )}
                  </div>
                  {item.productId ? (
                    <Badge className="rounded-full bg-success/15 px-2.5 text-[10px] font-semibold text-success hover:bg-success/15">
                      Valid
                    </Badge>
                  ) : item.kode ? (
                    <Badge className="rounded-full bg-destructive/15 px-2.5 text-[10px] font-semibold text-destructive hover:bg-destructive/15">
                      Tidak cocok
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full px-2.5 text-[10px] font-semibold">
                      Draft
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      placeholder="Ketik kode produk atau nama..."
                      value={item.kode}
                      onChange={(event) => updateItem(index, "kode", event.target.value.toUpperCase())}
                      list="product-codes"
                      className="rounded-xl border-border/70 bg-card font-mono"
                    />
                  </div>
                  <div className="w-20">
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
                      className="rounded-xl border-border/70 bg-card text-center text-base font-bold"
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
                  <div className="space-y-1.5 rounded-2xl border border-success/15 bg-success/[0.05] p-3">
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

          <Button
            variant="outline"
            size="sm"
            onClick={addLine}
            className="min-h-[44px] rounded-2xl transition-all duration-150 active:scale-95"
          >
            <Plus className="mr-1 h-4 w-4" />
            Tambah Baris
          </Button>

          <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ringkasan Draft
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {validCount > 0 ? `${validCount} item valid siap masuk` : "Belum ada item valid"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-muted-foreground">Total pcs</p>
                <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(totalQty)}</p>
              </div>
            </div>
            {(catatan || tanggal) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {tanggal && (
                  <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[10px]">
                    {selectedDateLabel}
                  </Badge>
                )}
                {catatan && <span className="line-clamp-1">Catatan: {catatan}</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Tanggal (opsional)</Label>
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
                <button
                  onClick={() => setTanggal(undefined)}
                  className="mt-0.5 text-[10px] text-primary hover:underline"
                >
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
                rows={2}
                className="mt-1 rounded-xl border-border/70 bg-card"
              />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-success via-emerald-500 to-primary text-base font-bold shadow-md transition-all duration-150 active:scale-[0.98] hover:shadow-lg"
          >
            <Send className="mr-2 h-5 w-5" />
            {submitting ? "Menyimpan..." : `Simpan Barang Masuk${validCount > 0 ? ` (${validCount} item)` : ""}`}
          </Button>
        </CardContent>
      </Card>

      <BarangMasukHistory history={history} isLoading={historyLoading} />
    </div>
  );
};

export default BarangMasuk;
