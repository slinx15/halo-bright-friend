import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  AlertTriangle,
  Boxes,
  CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  FileText,
  Minus,
  PackagePlus,
  Plus,
  Send,
  Trash2,
  XCircle,
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
import { type StockInHistoryEntry, useStockInHistory } from "@/hooks/useStockInHistory";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { createDebtItem, getDebtItems, saveDebtItems } from "@/lib/hutangStore";
import { findProductMatch } from "@/lib/productMatcher";
import {
  buildMissingSummary,
  compareOrderVsArrived,
  parseOrderText,
} from "@/lib/orderMatcher";
import { deleteStockInTransaction, registerStockIn } from "@/lib/stockMutations";
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

interface BonDraft {
  id: string;
  items: LineItem[];
  catatan: string;
  pesananText: string;
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

function createEmptyBon(): BonDraft {
  return {
    id: `bon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    items: [createEmptyLineItem()],
    catatan: "",
    pesananText: "",
  };
}

function getFormDate(tanggal?: Date) {
  const source = tanggal ?? new Date();
  return new Date(source.getFullYear(), source.getMonth(), source.getDate(), 12, 0, 0);
}

function createBarangMasukBonNumber(tanggal: Date | undefined, index: number) {
  const date = getFormDate(tanggal);
  const ymd = format(date, "yyyyMMdd");
  const time = format(new Date(), "HHmmss");
  return `BM-${ymd}-${time}-${index + 1}`;
}

const BarangMasuk = () => {
  const { data: products } = useProducts();
  const { data: history = [], isLoading: historyLoading } = useStockInHistory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [bons, setBons] = useState<BonDraft[]>([createEmptyBon()]);
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------------- Bon-level operations ----------------
  const addBon = () => setBons((prev) => [...prev, createEmptyBon()]);
  const removeBon = (bonId: string) =>
    setBons((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== bonId)));

  const updateBonCatatan = (bonId: string, catatan: string) =>
    setBons((prev) => prev.map((b) => (b.id === bonId ? { ...b, catatan } : b)));

  // ---------------- Item-level operations ----------------
  const updateItem = <K extends keyof LineItem>(
    bonId: string,
    index: number,
    field: K,
    value: LineItem[K],
  ) => {
    setBons((prev) =>
      prev.map((bon) => {
        if (bon.id !== bonId) return bon;
        const updated = [...bon.items];
        updated[index] = { ...updated[index], [field]: value };
        if (field === "kode" && products) {
          const found = findProductMatch(products, { kode: String(value) });
          updated[index].productName = found?.nama;
          updated[index].productId = found?.id;
          updated[index].productKode = found?.kode;
          updated[index].productKategori = found?.kategori;
        }
        return { ...bon, items: updated };
      }),
    );
  };

  const addLine = (bonId: string) =>
    setBons((prev) =>
      prev.map((b) => (b.id === bonId ? { ...b, items: [...b.items, createEmptyLineItem()] } : b)),
    );

  const removeLine = (bonId: string, index: number) =>
    setBons((prev) =>
      prev.map((b) =>
        b.id === bonId ? { ...b, items: b.items.filter((_, i) => i !== index) } : b,
      ),
    );

  // ---------------- OCR handler (merges into a specific bon) ----------------
  const handleOcrResult = (bonId: string, ocrItems: BarangMasukOcrItem[]) => {
    const mapped: LineItem[] = ocrItems.map((item) => {
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

    setBons((prev) =>
      prev.map((bon) => {
        if (bon.id !== bonId) return bon;

        // Remove empty placeholder rows first
        const base = bon.items.filter((it) => it.kode.trim() || it.productId);
        const merged: LineItem[] = [...base];

        for (const incoming of mapped) {
          const key = (incoming.productId || incoming.kode).toUpperCase();
          const existingIdx = merged.findIndex(
            (m) => (m.productId || m.kode).toUpperCase() === key,
          );
          if (existingIdx >= 0) {
            merged[existingIdx] = {
              ...merged[existingIdx],
              qty: merged[existingIdx].qty + incoming.qty,
            };
          } else {
            merged.push(incoming);
          }
        }

        const nextCatatan =
          bon.catatan || (ocrItems[0]?.catatan ? ocrItems[0].catatan : "");
        return {
          ...bon,
          items: merged.length > 0 ? merged : [createEmptyLineItem()],
          catatan: nextCatatan,
        };
      }),
    );

    toast({
      title: "Halaman ditambahkan",
      description: `${mapped.length} item terbaca & digabung ke bon.`,
    });
  };

  // ---------------- Save all bons ----------------
  const handleSubmit = async () => {
    // Collect bons with at least one valid item
    const bonsToSave = bons
      .map((bon) => ({
        bon,
        validItems: bon.items.filter((it) => it.productId && it.qty > 0),
      }))
      .filter((b) => b.validItems.length > 0);

    if (bonsToSave.length === 0) {
      toast({
        title: "Belum ada item",
        description: "Isi minimal 1 item dengan kode valid dan qty > 0.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

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
    const invoiceDate = format(getFormDate(tanggal), "yyyy-MM-dd");

    let bonSuccess = 0;
    let bonFailed = 0;
    const allErrors: string[] = [];
    const remainingBons: BonDraft[] = [];

    for (let bonIndex = 0; bonIndex < bonsToSave.length; bonIndex++) {
      const { bon, validItems } = bonsToSave[bonIndex];
      const successful: LineItem[] = [];
      const failed: LineItem[] = [];

      for (const item of validItems) {
        try {
          const kode = item.productKode || item.kode;
          const newStacks = splitIntoStacks(
            item.qty,
            kode,
            item.productKategori || undefined,
          );
          await registerStockIn({
            productId: item.productId!,
            qty: item.qty,
            tumpukanDetail: newStacks,
            catatan: bon.catatan,
            createdAt,
          });
          successful.push(item);
        } catch (error) {
          failed.push(item);
          allErrors.push(
            `${item.kode}: ${getErrorMessage(error, "Gagal simpan")}`,
          );
        }
      }

      // Create debt entry for successful items of this bon
      if (successful.length > 0) {
        const totalModal = successful.reduce((sum, it) => {
          const product = products?.find((p) => p.id === it.productId);
          return sum + (product?.prices?.harga_modal ?? 0) * it.qty;
        }, 0);
        const summary = successful
          .map((it) => `${it.productKode || it.kode} x${it.qty}`)
          .join(", ");

        if (totalModal > 0) {
          const debt = createDebtItem({
            invoiceNumber: createBarangMasukBonNumber(tanggal, bonIndex),
            amount: totalModal,
            invoiceDate,
            note: `Bon #${bonIndex + 1}: ${summary}${bon.catatan ? ` — ${bon.catatan}` : ""}`,
            sourceType: "manual",
          });
          const current = getDebtItems();
          saveDebtItems([debt, ...current]);
        }

        logActivity("stock_in", `Barang masuk bon #${bonIndex + 1}: ${summary}`, {
          items: successful.map((it) => ({
            kode: it.productKode || it.kode,
            qty: it.qty,
          })),
        });
      }

      if (failed.length > 0) {
        bonFailed++;
        remainingBons.push({ ...bon, items: failed });
      } else if (successful.length > 0) {
        bonSuccess++;
      }
    }

    // Also keep bons that had zero valid items (untouched drafts) so user doesn't lose work
    const untouchedDrafts = bons.filter(
      (b) => !bonsToSave.some((s) => s.bon.id === b.id),
    );
    const finalRemaining = [...remainingBons, ...untouchedDrafts];

    if (bonFailed > 0) {
      toast({
        title: `${bonSuccess} bon berhasil, ${bonFailed} bermasalah`,
        description: allErrors.slice(0, 3).join("; "),
        variant: "destructive",
      });
      setBons(finalRemaining.length > 0 ? finalRemaining : [createEmptyBon()]);
    } else {
      toast({
        title: "Berhasil",
        description: `${bonSuccess} bon tercatat & bon hutang dibuat.`,
      });
      setBons([createEmptyBon()]);
      setTanggal(undefined);
    }

    queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setSubmitting(false);
  };

  const handleDeleteTransaction = async (item: StockInHistoryEntry) => {
    setDeletingId(item.id);
    try {
      await deleteStockInTransaction(item.id);
      toast({
        title: "Berhasil",
        description: `Barang masuk ${item.products?.kode} dibatalkan, stok dikurangi -${item.qty}`,
      });
      logActivity("stock_in", `Batal barang masuk ${item.products?.kode} x${item.qty}`, {
        kode: item.products?.kode,
        qty: item.qty,
      });
      queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Gagal membatalkan barang masuk"),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ---------------- Aggregates ----------------
  const allItems = bons.flatMap((b) => b.items);
  const validCount = allItems.filter((it) => it.productId && it.qty > 0).length;
  const totalQty = allItems
    .filter((it) => it.productId && it.qty > 0)
    .reduce((sum, it) => sum + it.qty, 0);
  const estimatedTotal = allItems
    .filter((it) => it.productId && it.qty > 0)
    .reduce((sum, it) => {
      const product = products?.find((p) => p.id === it.productId);
      return sum + (product?.prices?.harga_modal ?? 0) * it.qty;
    }, 0);
  const selectedDateLabel = tanggal
    ? format(tanggal, "dd MMM yyyy", { locale: localeId })
    : "Hari ini";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-32 md:space-y-5 md:p-6 md:pb-6">
      {/* HEADER */}
      <section className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-success/10 p-1.5">
            <PackagePlus className="h-4 w-4 text-success" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">Barang Masuk</h1>
            <p className="text-xs text-muted-foreground">
              {bons.length} bon · {validCount} item siap
            </p>
          </div>
        </div>
      </section>

      {/* KPI CARDS */}
      <section className="grid grid-cols-3 gap-2.5">
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <FileText className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">
              {bons.length}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-foreground/90">Bon</p>
            <p className="text-[9px] text-muted-foreground">Sesi ini</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">
              {validCount}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-success">Valid</p>
            <p className="text-[9px] text-muted-foreground">Item</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
            <Boxes className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-primary-foreground leading-none">
              {formatNumber(totalQty)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-primary-foreground">Total</p>
            <p className="text-[9px] text-primary-foreground/75">Pcs</p>
          </div>
        </div>
      </section>

      {/* SESSION DATE */}
      <section className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Tanggal Sesi (semua bon)
        </Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 flex-1 justify-start rounded-xl border-border/70 bg-background text-left font-semibold",
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTanggal(undefined)}
              className="h-11 rounded-xl text-xs font-semibold text-muted-foreground"
            >
              Reset
            </Button>
          )}
        </div>
      </section>

      {/* BON LIST */}
      {bons.map((bon, bonIdx) => {
        const bonValid = bon.items.filter((it) => it.productId && it.qty > 0);
        const bonTotalQty = bonValid.reduce((s, it) => s + it.qty, 0);
        const bonTotalModal = bonValid.reduce((s, it) => {
          const product = products?.find((p) => p.id === it.productId);
          return s + (product?.prices?.harga_modal ?? 0) * it.qty;
        }, 0);

        return (
          <Card
            key={bon.id}
            className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-card shadow-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <span className="text-xs font-extrabold">{bonIdx + 1}</span>
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Bon #{bonIdx + 1}</CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {bonValid.length} item · {bonTotalQty} pcs · {formatRupiah(bonTotalModal)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <OcrUpload
                  mode="masuk"
                  onResult={(items) => handleOcrResult(bon.id, items as BarangMasukOcrItem[])}
                />
                {bons.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBon(bon.id)}
                    className="h-9 w-9 rounded-lg text-destructive hover:bg-destructive/10"
                    aria-label="Hapus bon"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 px-3 pb-3 pt-3">
              {bon.items.map((item, index) => {
                const matchedProduct = products?.find((p) => p.id === item.productId);
                const currentStacks = (matchedProduct?.stock?.tumpukan_detail as number[]) ?? [];
                const previewNewStacks =
                  item.productId && item.qty > 0
                    ? splitIntoStacks(
                        item.qty,
                        item.productKode || item.kode,
                        item.productKategori || undefined,
                      )
                    : [];
                const previewMerged =
                  item.productId && item.qty > 0
                    ? addStacks(currentStacks, previewNewStacks)
                    : currentStacks;

                return (
                  <div
                    key={index}
                    className={cn(
                      "space-y-2 rounded-xl border p-2.5 transition-all",
                      item.productId
                        ? "border-success/25 bg-success/[0.045]"
                        : item.kode && !item.productId
                          ? "border-destructive/25 bg-destructive/[0.04]"
                          : "border-border/60 bg-background/55",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          placeholder="Kode..."
                          value={item.kode}
                          onChange={(event) =>
                            updateItem(bon.id, index, "kode", event.target.value.toUpperCase())
                          }
                          list="product-codes"
                          className="h-10 rounded-lg border-border/70 bg-card font-mono text-sm"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateItem(bon.id, index, "qty", Math.max(0, item.qty - 1))
                          }
                          className="h-8 w-8 rounded-md"
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
                              bon.id,
                              index,
                              "qty",
                              event.target.value === ""
                                ? 0
                                : parseInt(event.target.value, 10) || 0,
                            )
                          }
                          placeholder="0"
                          className="h-8 w-10 rounded-md border-0 bg-transparent p-0 text-center text-sm font-bold focus-visible:ring-0"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => updateItem(bon.id, index, "qty", item.qty + 1)}
                          className="h-8 w-8 rounded-md"
                          aria-label="Tambah"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {bon.items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(bon.id, index)}
                          className="h-10 w-10 shrink-0 rounded-lg text-destructive hover:bg-destructive/10"
                          aria-label="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {item.productName && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-success">
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
                      <p className="text-[11px] font-medium text-destructive">
                        Produk tidak ditemukan
                      </p>
                    )}

                    {item.productId && item.qty > 0 && (
                      <div className="space-y-1 rounded-lg border border-success/15 bg-success/[0.05] p-2">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-semibold text-success">Masuk</span>
                          <TumpukanBadges
                            stacks={previewNewStacks}
                            kode={item.productKode || item.kode}
                            compact
                          />
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-semibold text-foreground">Setelah</span>
                          <TumpukanBadges
                            stacks={previewMerged}
                            kode={item.productKode || item.kode}
                            compact
                          />
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-primary px-1.5 text-[9px] text-primary-foreground"
                          >
                            = {previewMerged.reduce((sum, value) => sum + value, 0)}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <Button
                variant="outline"
                onClick={() => addLine(bon.id)}
                className="h-10 w-full rounded-lg border-dashed text-xs font-semibold"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Tambah Baris Manual
              </Button>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-between rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                  >
                    <span>Catatan bon {bon.catatan ? "· terisi" : ""}</span>
                    <ChevronDown className="h-3 w-3 transition-transform data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1.5">
                  <Textarea
                    value={bon.catatan}
                    onChange={(e) => updateBonCatatan(bon.id, e.target.value)}
                    placeholder="Catatan untuk bon ini..."
                    rows={2}
                    className="rounded-lg border-border/70 bg-card text-xs"
                  />
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}

      <datalist id="product-codes">
        {products?.map((product) => (
          <option
            key={product.id}
            value={product.nama}
            label={`${product.kode} - ${product.nama}`}
          />
        ))}
      </datalist>

      {/* ADD BON */}
      <Button
        variant="outline"
        onClick={addBon}
        className="h-12 w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.03] text-sm font-bold text-primary hover:bg-primary/[0.08]"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Tambah Bon Baru
      </Button>

      {/* TOTAL ESTIMATION */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Total Estimasi ({bons.length} Bon)
            </p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
              {formatRupiah(estimatedTotal)}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
          >
            Hutang Ivory
          </Badge>
        </div>
      </div>

      {/* SAVE ALL */}
      <Button
        onClick={handleSubmit}
        disabled={submitting || validCount === 0}
        className={cn(
          "h-14 w-full rounded-2xl text-base font-bold shadow-md transition-all active:scale-[0.98]",
          validCount === 0 || submitting
            ? "bg-muted text-muted-foreground shadow-none hover:bg-muted"
            : "bg-gradient-to-r from-success via-emerald-500 to-primary text-primary-foreground hover:shadow-lg",
        )}
      >
        <Send className="mr-2 h-5 w-5" />
        {submitting
          ? "Menyimpan..."
          : validCount > 0
            ? `Simpan Semua (${bons.length} Bon · ${validCount} Item)`
            : "Belum ada item valid"}
      </Button>

      <BarangMasukHistory
        deletingId={deletingId}
        history={history}
        isLoading={historyLoading}
        onDeleteTransaction={handleDeleteTransaction}
      />
    </div>
  );
};

export default BarangMasuk;
