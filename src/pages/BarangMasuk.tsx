import { useState } from "react";
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
import { PackagePlus, Plus, Trash2, Send, Clock, Package, Hash, ChevronDown, CheckCircle2, Box } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { splitIntoStacks, addStacks } from "@/lib/tumpukanUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TransactionSkeleton } from "@/components/LoadingSkeletons";

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

  const { data: history } = useQuery({
    queryKey: ["stock_in_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_in")
        .select("*, products(kode, nama)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "kode" && products) {
        const found = products.find((p) => p.kode.toUpperCase() === String(value).toUpperCase());
        updated[index].productName = found?.nama;
        updated[index].productId = found?.id;
        updated[index].productKode = found?.kode;
      }
      return updated;
    });
  };

  const addLine = () => setItems((prev) => [...prev, { kode: "", qty: 1 }]);
  const removeLine = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.productId && i.qty > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      for (const item of validItems) {
        const kode = item.productKode || item.kode;
        const newStacks = splitIntoStacks(item.qty, kode);

        await supabase.from("stock_in").insert({
          product_id: item.productId!,
          qty: item.qty,
          tumpukan: newStacks.join(","),
          catatan: catatan || null,
          user_id: user!.id,
        });

        const { data: existing } = await supabase
          .from("stock")
          .select("*")
          .eq("product_id", item.productId!)
          .maybeSingle();

        if (existing) {
          const currentStacks = (existing.tumpukan_detail as number[]) ?? [];
          const merged = addStacks(currentStacks, newStacks);
          await supabase
            .from("stock")
            .update({
              jumlah: existing.jumlah + item.qty,
              tumpukan_detail: merged,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("stock").insert({
            product_id: item.productId!,
            jumlah: item.qty,
            tumpukan_detail: newStacks,
          });
        }
      }
      toast({ title: "Berhasil", description: `${validItems.length} item masuk tercatat` });
      setItems([{ kode: "", qty: 1 }]);
      setCatatan("");
      queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const validCount = items.filter((i) => i.productId && i.qty > 0).length;
  const totalQty = items.filter((i) => i.productId && i.qty > 0).reduce((s, i) => s + i.qty, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Premium Header ── */}
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

      {/* ── Quick KPI Strip ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-success tabular-nums">{items.length}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Baris</p>
        </div>
        <div className="card-premium bg-primary/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-primary tabular-nums">{validCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Valid</p>
        </div>
        <div className="card-premium bg-accent/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(totalQty)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Qty</p>
        </div>
      </div>

      {/* ── Input Card ── */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-success/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Box className="h-4 w-4 text-success" />
            Input Barang Masuk
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
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
                className={`rounded-xl border p-3.5 space-y-2.5 transition-all duration-200 ${
                  item.productId
                    ? "border-success/30 bg-success/[0.03] shadow-sm"
                    : item.kode && !item.productId
                    ? "border-destructive/30 bg-destructive/[0.03]"
                    : "border-border/60 hover:border-border"
                }`}
              >
                <div className="flex gap-2 items-end">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs font-semibold text-muted-foreground">Kode Produk</Label>
                    <Input
                      placeholder="Kode..."
                      value={item.kode}
                      onChange={(e) => updateItem(i, "kode", e.target.value.toUpperCase())}
                      list="product-codes"
                      className="rounded-lg mt-1"
                    />
                    {item.productName && (
                      <p className="text-xs text-success mt-1 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {item.productName}
                      </p>
                    )}
                    {item.kode && !item.productId && (
                      <p className="text-xs text-destructive mt-1 font-medium">✗ Produk tidak ditemukan</p>
                    )}
                  </div>
                  <div className="w-20">
                    <Label className="text-xs font-semibold text-muted-foreground">Qty</Label>
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
                  <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground font-medium">Masuk:</span>
                      <TumpukanBadges stacks={previewNewStacks} kode={item.productKode || item.kode} compact />
                    </div>
                    {currentStacks.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-medium">Sekarang:</span>
                        <TumpukanBadges stacks={currentStacks} kode={item.productKode || item.kode} compact />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-bold">Setelah:</span>
                      <TumpukanBadges stacks={previewMerged} kode={item.productKode || item.kode} compact />
                      <Badge variant="secondary" className="text-[10px] rounded-full px-2">
                        = {previewMerged.reduce((s, v) => s + v, 0)}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <datalist id="product-codes">
            {products?.map((p) => <option key={p.id} value={p.kode} />)}
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
            {submitting ? "Menyimpan..." : `Simpan Barang Masuk${validCount > 0 ? ` (${validCount} item, ${formatNumber(totalQty)} pcs)` : ""}`}
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
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Riwayat Barang Masuk
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">
                      {history.length} entri
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </div>
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {isMobile ? (
                <div className="space-y-2.5">
                  {(!history || history.length === 0) ? (
                    <div className="py-10 text-center">
                      <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">Belum ada riwayat barang masuk</p>
                    </div>
                  ) : (
                    history.map((h: any) => (
                      <div
                        key={h.id}
                        className="rounded-xl border border-border/60 p-3.5 space-y-1.5 transition-all duration-150 active:scale-[0.98] bg-card"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-sm">{h.products?.kode}</span>
                            <span className="text-xs text-muted-foreground truncate">{h.products?.nama}</span>
                          </div>
                          <Badge className="rounded-full text-xs font-extrabold px-2.5 bg-success/15 text-success border-0">
                            +{formatNumber(h.qty)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(h.created_at)}
                          </span>
                          {h.tumpukan && (
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {h.tumpukan}
                            </span>
                          )}
                        </div>
                        {h.catatan && (
                          <p className="text-[11px] text-muted-foreground italic bg-muted/40 rounded-lg px-2 py-1">
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
                        <TableHead className="font-bold">Waktu</TableHead>
                        <TableHead className="font-bold">Kode</TableHead>
                        <TableHead className="font-bold">Nama</TableHead>
                        <TableHead className="text-right font-bold">Qty</TableHead>
                        <TableHead className="font-bold">Tumpukan</TableHead>
                        <TableHead className="font-bold">Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history?.map((h: any, idx: number) => (
                        <TableRow key={h.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                          <TableCell className="font-mono font-bold text-sm">{h.products?.kode}</TableCell>
                          <TableCell className="text-sm">{h.products?.nama}</TableCell>
                          <TableCell className="text-right">
                            <Badge className="rounded-full bg-success/15 text-success border-0 font-bold">
                              +{formatNumber(h.qty)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{h.tumpukan || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{h.catatan || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {(!history || history.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                            Belum ada riwayat barang masuk
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
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
