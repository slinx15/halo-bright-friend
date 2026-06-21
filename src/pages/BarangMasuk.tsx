import { useState } from "react";
import { formatRupiah } from "@/lib/formatters";
import { useProducts } from "@/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PackagePlus, Plus, Trash2, Send, CheckCircle2, CalendarIcon } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OcrUpload } from "@/components/OcrUpload";
import { BarangMasukHistory } from "@/components/masuk/BarangMasukHistory";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { splitIntoStacks, addStacks } from "@/lib/tumpukanUtils";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { useStockInHistory } from "@/hooks/useStockInHistory";
import { findProductMatch } from "@/lib/productMatcher";
import { registerStockIn } from "@/lib/stockMutations";

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
  const removeLine = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.productId && i.qty > 0);
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
          ? new Date(tanggal.getFullYear(), tanggal.getMonth(), tanggal.getDate(), 12, 0, 0).toISOString()
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
      const summary = successfulItems.map((item) => `${item.productKode || item.kode} x${item.qty}`).join(", ");
      logActivity("stock_in", `${errors.length > 0 ? "Barang masuk parsial" : "Barang masuk"}: ${summary}`, {
        items: successfulItems.map((item) => ({ kode: item.productKode || item.kode, qty: item.qty })),
      });
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

  const validCount = items.filter((i) => i.productId && i.qty > 0).length;
  const totalQty = items.filter((i) => i.productId && i.qty > 0).reduce((s, i) => s + i.qty, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 sm:items-center">
          <div className="p-3 rounded-2xl bg-success/10 shadow-sm">
            <PackagePlus className="h-6 w-6 text-success" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">Barang Masuk</h1>
            <p className="text-muted-foreground text-xs font-medium">Catat barang masuk ke gudang</p>
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <OcrUpload
            mode="masuk"
            onResult={(ocrItems) => {
              const typedItems = ocrItems as BarangMasukOcrItem[];
              const newItems: LineItem[] = typedItems.map((item) => {
                const found = findProductMatch(products, { productId: item.productId, kode: item.kode, kategori: item.kategori });
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
              if (typedItems[0]?.catatan) setCatatan(typedItems[0].catatan);
            }}
          />
        </div>
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

      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fokus Input</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Isi kode dan qty dulu, lalu cek preview tumpukan sebelum simpan.</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Item Valid</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{validCount > 0 ? `${validCount} item siap disimpan` : "Belum ada item valid"}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Catatan</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{catatan.trim() ? "Catatan sudah diisi" : "Catatan masih kosong"}</p>
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
              ? splitIntoStacks(item.qty, item.productKode || item.kode, item.productKategori || undefined)
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
                      placeholder="Ketik kode produk atau nama..."
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
                  <p className="text-xs text-destructive font-medium">Produk tidak ditemukan</p>
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
            {products?.map((p) => <option key={p.id} value={p.nama} label={`${p.kode} - ${p.nama}`} />)}
          </datalist>

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} className="rounded-lg mt-1" />
            </div>
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
      <BarangMasukHistory
        history={history}
        isLoading={historyLoading}
      />
    </div>
  );
};

export default BarangMasuk;
