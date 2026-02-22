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
import { PackagePlus, Plus, Trash2, Send, Clock, Package, Hash } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { splitIntoStacks, addStacks } from "@/lib/tumpukanUtils";
import { useIsMobile } from "@/hooks/use-mobile";

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

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-success/10">
          <PackagePlus className="h-6 w-6 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Barang Masuk</h1>
          <p className="text-muted-foreground text-sm">Catat barang masuk ke gudang</p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">Input Barang Masuk</CardTitle>
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
        </CardHeader>
        <CardContent className="space-y-4">
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
              <div key={i} className="rounded-xl border border-border/60 p-3.5 space-y-2.5 transition-all duration-150 hover:shadow-sm">
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
                      <p className="text-xs text-success mt-1 font-medium">✓ {item.productName}</p>
                    )}
                    {item.kode && !item.productId && (
                      <p className="text-xs text-destructive mt-1 font-medium">✗ Produk tidak ditemukan</p>
                    )}
                  </div>
                  <div className="w-20">
                    <Label className="text-xs font-semibold text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) => updateItem(i, "qty", parseInt(e.target.value) || 0)}
                      className="rounded-lg mt-1 text-center font-bold"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded-lg">
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

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl transition-all duration-150 active:scale-95">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</Label>
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} className="rounded-lg mt-1" />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg"
          >
            <Send className="h-5 w-5 mr-2" />
            {submitting ? "Menyimpan..." : `Simpan Barang Masuk${validCount > 0 ? ` (${validCount})` : ""}`}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Riwayat Barang Masuk
            </CardTitle>
            {history && history.length > 0 && (
              <Badge variant="secondary" className="text-[10px] rounded-full px-2">
                {history.length} entri
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="space-y-2.5">
              {(!history || history.length === 0) ? (
                <div className="py-8 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Belum ada riwayat barang masuk</p>
                </div>
              ) : (
                history.map((h: any) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-border/60 p-3.5 space-y-1.5 transition-all duration-150 active:scale-[0.98]"
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
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Tumpukan</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{formatDate(h.created_at)}</TableCell>
                      <TableCell className="font-mono font-semibold text-sm">{h.products?.kode}</TableCell>
                      <TableCell className="text-sm">{h.products?.nama}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="rounded-full bg-success/15 text-success border-0 font-bold">
                          +{formatNumber(h.qty)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{h.tumpukan || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.catatan || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {(!history || history.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Belum ada riwayat barang masuk
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BarangMasuk;
