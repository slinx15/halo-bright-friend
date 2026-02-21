import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, Check, X, AlertTriangle, Pencil, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useProductAliases } from "@/hooks/useProductAliases";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OcrUploadProps {
  mode: "masuk" | "keluar" | "opname";
  onResult: (items: any[]) => void;
}

interface OcrItem {
  kode: string;
  qty?: number;
  qty_pesan?: number;
  qty_kirim?: number;
  stok_fisik?: number;
  harga_type?: string;
  toko?: string;
  nama?: string;
  catatan?: string;
  harga_modal?: number;
  // validation
  isValid?: boolean;
  productId?: string;
  productName?: string;
  stokSistem?: number;
}

export function OcrUpload({ mode, onResult }: OcrUploadProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ocrItems, setOcrItems] = useState<OcrItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: products } = useProducts();
  const { data: aliases } = useProductAliases();

  // Find product by kode with fallback chain: exact → strip leading zeros → alias
  const findProduct = (rawKode: string) => {
    const kode = String(rawKode).toUpperCase().trim();
    // 1. Exact match
    let found = products?.find((p) => p.kode.toUpperCase() === kode);
    if (found) return found;
    // 2. Strip leading zeros
    const stripped = kode.replace(/^0+/, "");
    if (stripped && stripped !== kode) {
      found = products?.find((p) => p.kode.toUpperCase() === stripped);
      if (found) return found;
    }
    // 3. Also try adding leading zeros to master code
    found = products?.find((p) => p.kode.toUpperCase().replace(/^0+/, "") === stripped);
    if (found) return found;
    // 4. Alias table lookup
    if (aliases) {
      const aliasEntry = aliases.find((a) => a.alias.toUpperCase() === kode);
      if (aliasEntry) {
        found = products?.find((p) => p.id === aliasEntry.product_id);
        if (found) return found;
      }
    }
    return null;
  };

  const validateItems = (items: any[]): OcrItem[] => {
    return items.map((item) => {
      const kode = String(item.kode || "").toUpperCase().trim();
      const found = findProduct(kode);
      return {
        ...item,
        kode: found ? found.kode : kode, // Use master kode if found
        isValid: !!found,
        productId: found?.id,
        productName: found?.nama,
        stokSistem: found?.stock?.jumlah ?? 0,
      };
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "File harus berupa gambar", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Error", description: "Ukuran file maks 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      console.log("OCR: sending image, base64 length:", base64.length);

      // Use fetch with timeout instead of supabase.functions.invoke
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-nota`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            image_base64: base64,
            mode,
            master_codes: products?.map((p) => p.kode) || [],
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data?.error) {
        toast({ title: "Error OCR", description: data.error, variant: "destructive" });
        return;
      }

      const items = data?.items || [];
      if (items.length === 0) {
        toast({ title: "OCR", description: "Tidak bisa membaca data dari foto. Coba foto yang lebih jelas.", variant: "destructive" });
        return;
      }

      const validated = validateItems(items);
      setOcrItems(validated);
      setShowConfirm(true);
    } catch (err: any) {
      console.error("OCR error:", err);
      if (err.name === "AbortError") {
        toast({ title: "Timeout", description: "Proses terlalu lama. Coba foto yang lebih jelas/kecil.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err.message || "Gagal memproses foto", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800; // max dimension for faster upload
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleConfirm = () => {
    const validItems = ocrItems.filter((i) => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid untuk disimpan", variant: "destructive" });
      return;
    }
    toast({ title: "OCR Berhasil", description: `${validItems.length} item valid diterapkan` });
    onResult(validItems);
    setShowConfirm(false);
    setOcrItems([]);
    setPreview(null);
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setOcrItems([]);
    setPreview(null);
  };

  const updateOcrItem = (idx: number, field: string, value: any) => {
    setOcrItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Re-validate kode if changed
      if (field === "kode") {
        const kode = String(value).toUpperCase().trim();
        const found = findProduct(kode);
        updated[idx].kode = found ? found.kode : kode;
        updated[idx].isValid = !!found;
        updated[idx].productId = found?.id;
        updated[idx].productName = found?.nama;
        updated[idx].stokSistem = found?.stock?.jumlah ?? 0;
      }
      return updated;
    });
  };

  const removeOcrItem = (idx: number) => {
    setOcrItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const validCount = ocrItems.filter((i) => i.isValid).length;
  const invalidCount = ocrItems.filter((i) => !i.isValid).length;

  const modeLabel = { masuk: "nota pembelian", keluar: "nota penjualan", opname: "data stok" };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-1" />
          )}
          {loading ? "Memproses..." : `Scan ${modeLabel[mode]}`}
        </Button>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📷 Hasil Baca Foto
            </DialogTitle>
          </DialogHeader>

          {/* Summary */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="bg-success/10 text-success">
              <Check className="h-3 w-3 mr-1" /> {validCount} valid
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3 w-3 mr-1" /> {invalidCount} tidak ditemukan
              </Badge>
            )}
          </div>

          {invalidCount > 0 && (
            <div className="text-xs text-destructive bg-destructive/5 p-2 rounded">
              ⚠️ Item bertanda merah tidak ada di Master. Edit kode atau hapus item tersebut.
            </div>
          )}

          {/* Items list */}
          <div className="flex-1 min-h-0 max-h-[45vh] overflow-y-auto border rounded-md p-1">
            <div className="space-y-2 pr-1">
              {ocrItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-sm space-y-1 ${
                    item.isValid
                      ? "border-border bg-card"
                      : "border-destructive/30 bg-destructive/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {editingIdx === idx ? (
                        <Input
                          className="h-7 text-sm font-mono w-28"
                          value={item.kode}
                          onChange={(e) => updateOcrItem(idx, "kode", e.target.value)}
                          onBlur={() => setEditingIdx(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingIdx(null)}
                          autoFocus
                          list="ocr-product-codes"
                        />
                      ) : (
                        <span
                          className="font-mono font-semibold cursor-pointer hover:underline"
                          onClick={() => setEditingIdx(idx)}
                        >
                          {item.kode || "(kosong)"}
                        </span>
                      )}
                      {item.isValid ? (
                        <span className="text-xs text-muted-foreground truncate">
                          {item.productName}
                        </span>
                      ) : (
                        <span className="text-xs text-destructive">Tidak ada di Master</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeOcrItem(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Mode-specific fields */}
                  {editingIdx === idx && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      {mode === "masuk" && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Qty:</span>
                          <Input
                            type="number"
                            className="h-7 w-16 text-sm"
                            value={item.qty || 0}
                            onChange={(e) => updateOcrItem(idx, "qty", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      )}
                      {mode === "keluar" && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Pesan:</span>
                            <Input
                              type="number"
                              className="h-7 w-16 text-sm"
                              value={item.qty_pesan || 0}
                              onChange={(e) => updateOcrItem(idx, "qty_pesan", parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Kirim:</span>
                            <Input
                              type="number"
                              className="h-7 w-16 text-sm"
                              value={item.qty_kirim || 0}
                              onChange={(e) => updateOcrItem(idx, "qty_kirim", parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </>
                      )}
                      {mode === "opname" && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Stok Fisik:</span>
                          <Input
                            type="number"
                            className="h-7 w-16 text-sm"
                            value={item.stok_fisik || 0}
                            onChange={(e) => updateOcrItem(idx, "stok_fisik", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {editingIdx !== idx && (
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {mode === "masuk" && <span>Qty: <strong>{item.qty || 0}</strong></span>}
                      {mode === "keluar" && (
                        <>
                          <span>Pesan: <strong>{item.qty_pesan || 0}</strong></span>
                          <span>Kirim: <strong>{item.qty_kirim || 0}</strong></span>
                        </>
                      )}
                      {mode === "opname" && (
                        <>
                          <span>Fisik: <strong>{item.stok_fisik || 0}</strong></span>
                          {item.isValid && (
                            <span>Sistem: <strong>{item.stokSistem || 0}</strong></span>
                          )}
                          {item.isValid && (
                            <span className={(item.stok_fisik || 0) - (item.stokSistem || 0) !== 0 ? "text-destructive font-medium" : "text-success font-medium"}>
                              Selisih: {(item.stok_fisik || 0) - (item.stokSistem || 0) > 0 ? "+" : ""}{(item.stok_fisik || 0) - (item.stokSistem || 0)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <datalist id="ocr-product-codes">
            {products?.map((p) => <option key={p.id} value={p.kode} />)}
          </datalist>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" /> Batal
            </Button>
            <Button onClick={handleConfirm} disabled={validCount === 0}>
              <Check className="h-4 w-4 mr-1" /> Terapkan ({validCount} item)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
