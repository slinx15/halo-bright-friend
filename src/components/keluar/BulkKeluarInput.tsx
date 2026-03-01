import { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Send, PackageMinus, AlertTriangle, CheckCircle2, Trash2, Plus } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import type { ProductWithDetails } from "@/hooks/useProducts";

export interface BulkKeluarItem {
  kode: string;
  qtyPesan: number;
  qtyKirim: number;
  hargaType: "normal" | "grosir";
  // resolved
  product?: ProductWithDetails;
  isValid: boolean;
}

interface BulkKeluarInputProps {
  products: ProductWithDetails[];
  onSubmit: (items: BulkKeluarItem[]) => Promise<void>;
  submitting: boolean;
  toko: string;
  setToko: (v: string) => void;
  catatan: string;
  setCatatan: (v: string) => void;
}

export interface BulkKeluarInputHandle {
  handleOcrResult: (items: any[]) => void;
}

export const BulkKeluarInput = forwardRef<BulkKeluarInputHandle, BulkKeluarInputProps>(function BulkKeluarInput({ products, onSubmit, submitting, toko, setToko, catatan, setCatatan }, ref) {
  const [items, setItems] = useState<BulkKeluarItem[]>([]);

  const findProduct = (kode: string) =>
    products.find((p) => p.kode.toUpperCase() === kode.toUpperCase());

  const resolveItem = (kode: string, partial: Partial<BulkKeluarItem> = {}): BulkKeluarItem => {
    const product = findProduct(kode);
    return {
      kode: product ? product.kode : kode.toUpperCase(),
      qtyPesan: partial.qtyPesan ?? 0,
      qtyKirim: partial.qtyKirim ?? 0,
      hargaType: (partial.hargaType as "normal" | "grosir") ?? "normal",
      product,
      isValid: !!product,
    };
  };

  // OCR result handler
  const handleOcrResult = useCallback((ocrItems: any[]) => {
    const newItems = ocrItems.map((item) =>
      resolveItem(item.kode || "", {
        qtyPesan: item.qty_pesan || 0,
        qtyKirim: item.qty_kirim || item.qty || 0,
        hargaType: item.harga_type || "normal",
      })
    );
    setItems((prev) => [...prev, ...newItems]);
  }, [products]);

  useImperativeHandle(ref, () => ({ handleOcrResult }), [handleOcrResult]);

  const addEmptyRow = () => {
    setItems((prev) => [...prev, resolveItem("")]);
  };

  const updateItem = (idx: number, field: keyof BulkKeluarItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      if (field === "kode") {
        updated[idx] = resolveItem(value, updated[idx]);
      } else {
        updated[idx] = { ...updated[idx], [field]: value };
      }
      return updated;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const validItems = items.filter((i) => i.isValid);
  const submitItems = validItems.filter((i) => i.qtyKirim > 0);
  const invalidItems = items.filter((i) => !i.isValid && i.kode);
  const overStockItems = submitItems.filter((i) => i.qtyKirim > (i.product?.stock?.jumlah ?? 0));

  const canSubmit = submitItems.length > 0 && overStockItems.length === 0;

  const totalRevenue = submitItems.reduce((sum, item) => {
    const price = item.product?.prices
      ? item.hargaType === "grosir" ? item.product.prices.harga_grosir : item.product.prices.harga_normal
      : 0;
    return sum + price * item.qtyKirim;
  }, 0);

  const handleSubmit = async () => {
    await onSubmit(submitItems);
    setItems([]);
  };

  return (
    <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-destructive/5 to-transparent">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <PackageMinus className="h-4 w-4 text-destructive" />
          Input Cepat Barang Keluar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Toko & catatan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</label>
            <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</label>
            <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." className="rounded-lg mt-1" />
          </div>
        </div>

        {/* Item table */}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right w-16">Stok</TableHead>
                  <TableHead className="w-20">Pesan</TableHead>
                  <TableHead className="w-20">Kirim</TableHead>
                  <TableHead className="w-28">Harga</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const stok = item.product?.stock?.jumlah ?? 0;
                  const price = item.product?.prices
                    ? item.hargaType === "grosir" ? item.product.prices.harga_grosir : item.product.prices.harga_normal
                    : 0;
                  const total = price * item.qtyKirim;
                  const overStock = item.isValid && item.qtyKirim > stok;

                  return (
                    <TableRow key={idx} className={!item.isValid && item.kode ? "bg-destructive/5" : overStock ? "bg-warning/5" : ""}>
                      <TableCell>
                        <Input
                          className="h-8 text-sm font-mono"
                          value={item.kode}
                          onChange={(e) => updateItem(idx, "kode", e.target.value)}
                          placeholder="Kode..."
                          list="bulk-keluar-codes"
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.isValid ? (
                          <span className="text-muted-foreground">{item.product?.nama}</span>
                        ) : item.kode ? (
                          <span className="text-destructive text-xs">Tidak ditemukan</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.isValid ? (
                          <span className={overStock ? "text-destructive font-semibold" : ""}>{formatNumber(stok)}</span>
                        ) : "-"}
                      </TableCell>
                       <TableCell className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-10 text-sm w-20 min-w-[5rem] touch-manipulation"
                          value={item.qtyPesan === 0 ? "" : item.qtyPesan}
                          onChange={(e) => updateItem(idx, "qtyPesan", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-10 text-sm w-20 min-w-[5rem] touch-manipulation"
                          value={item.qtyKirim === 0 ? "" : item.qtyKirim}
                          onChange={(e) => updateItem(idx, "qtyKirim", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.hargaType}
                          onValueChange={(v) => updateItem(idx, "hargaType", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="grosir">Grosir</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {item.isValid && item.qtyKirim > 0 ? formatRupiah(total) : "-"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <datalist id="bulk-keluar-codes">
          {products?.map((p) => <option key={p.id} value={p.kode} />)}
        </datalist>

        <Button variant="outline" size="sm" onClick={addEmptyRow} className="w-full rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
          <Plus className="h-4 w-4 mr-1" /> Tambah Baris
        </Button>

        {/* Warnings */}
        {invalidItems.length > 0 && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {invalidItems.length} kode tidak ditemukan
          </div>
        )}
        {overStockItems.length > 0 && (
          <div className="bg-warning/10 text-warning p-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {overStockItems.length} item stok tidak cukup
          </div>
        )}

        {/* Summary */}
        {submitItems.length > 0 && (
          <div className="bg-muted p-3 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {submitItems.length} item akan dikirim
              </Badge>
              {validItems.length > submitItems.length && (
                <span className="text-xs text-muted-foreground">({validItems.length - submitItems.length} dilewati, kirim=0)</span>
              )}
              <span className="text-muted-foreground">
                Total kirim: <strong>{formatNumber(submitItems.reduce((s, i) => s + i.qtyKirim, 0))}</strong> pcs
              </span>
            </div>
            <span className="font-bold text-primary">{formatRupiah(totalRevenue)}</span>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700"
        >
          <Send className="h-5 w-5 mr-2" />
          {submitting ? "Menyimpan..." : `Simpan ${submitItems.length} Barang Keluar`}
        </Button>
      </CardContent>
    </Card>
  );
});
