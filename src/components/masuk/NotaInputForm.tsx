import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { findProductMatch } from "@/lib/productMatcher";
import { cn } from "@/lib/utils";

interface NotaItem {
  kode: string;
  qty: number;
  productId?: string;
  productName?: string;
  productKategori?: string | null;
  isValid?: boolean;
}

interface Nota {
  id: string;
  nomorFaktur: string;
  tanggal: string;
  items: NotaItem[];
  pages: number; // berapa halaman nota ini
}

interface NotaInputFormProps {
  onNotasChange: (notas: Nota[]) => void;
  notas: Nota[];
}

export function NotaInputForm({ onNotasChange, notas }: NotaInputFormProps) {
  const { data: products } = useProducts();
  const [showDialog, setShowDialog] = useState(false);
  const [editingNotaId, setEditingNotaId] = useState<string | null>(null);
  const [nomorFaktur, setNomorFaktur] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [pages, setPages] = useState("1");
  const [items, setItems] = useState<NotaItem[]>([{ kode: "", qty: 0 }]);

  const findProduct = (rawKode: string) => {
    const kode = String(rawKode).toUpperCase().trim();
    if (!products) return null;
    return findProductMatch(products, { kode }) || null;
  };

  const validateItem = (item: NotaItem): NotaItem => {
    const found = findProduct(item.kode);
    return {
      ...item,
      kode: found ? found.kode : item.kode,
      productId: found?.id,
      productName: found?.nama,
      productKategori: found?.kategori,
      isValid: !!found,
    };
  };

  const updateItem = (idx: number, field: keyof NotaItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      
      // Re-validate jika kode berubah
      if (field === "kode") {
        updated[idx] = validateItem(updated[idx]);
      }
      
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { kode: "", qty: 0 }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveNota = () => {
    if (!nomorFaktur.trim() || !tanggal.trim()) {
      alert("Nomor Faktur dan Tanggal harus diisi");
      return;
    }

    const validItems = items.filter((item) => item.kode.trim() && item.qty > 0 && item.isValid);
    if (validItems.length === 0) {
      alert("Minimal ada 1 item valid yang harus diisi");
      return;
    }

    const newNota: Nota = {
      id: editingNotaId || `nota_${Date.now()}`,
      nomorFaktur,
      tanggal,
      items: validItems,
      pages: parseInt(pages, 10) || 1,
    };

    if (editingNotaId) {
      // Update existing
      onNotasChange(
        notas.map((n) => (n.id === editingNotaId ? newNota : n))
      );
    } else {
      // Add new
      onNotasChange([...notas, newNota]);
    }

    // Reset
    setShowDialog(false);
    setEditingNotaId(null);
    setNomorFaktur("");
    setTanggal("");
    setPages("1");
    setItems([{ kode: "", qty: 0 }]);
  };

  const handleEditNota = (nota: Nota) => {
    setEditingNotaId(nota.id);
    setNomorFaktur(nota.nomorFaktur);
    setTanggal(nota.tanggal);
    setPages(String(nota.pages));
    setItems(nota.items);
    setShowDialog(true);
  };

  const handleDeleteNota = (notaId: string) => {
    onNotasChange(notas.filter((n) => n.id !== notaId));
  };

  const totalItemsFromAllNotas = notas.reduce((sum, nota) => sum + nota.items.length, 0);
  const totalQtyFromAllNotas = notas.reduce(
    (sum, nota) => sum + nota.items.reduce((s, item) => s + item.qty, 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border p-3 bg-card">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Nota</p>
          <p className="text-lg font-bold text-foreground">{notas.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Items</p>
          <p className="text-lg font-bold text-foreground">{totalItemsFromAllNotas}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Qty Total</p>
          <p className="text-lg font-bold text-primary">{totalQtyFromAllNotas}</p>
        </div>
      </div>

      {/* List of Notas */}
      {notas.length > 0 && (
        <div className="space-y-2">
          {notas.map((nota) => (
            <Card key={nota.id} className="rounded-xl overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30 flex flex-row items-center justify-between">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm font-bold">
                    Nota: {nota.nomorFaktur}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {nota.tanggal} • {nota.pages} halaman • {nota.items.length} item
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEditNota(nota)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteNota(nota.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="space-y-1">
                  {nota.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-background border border-border/50">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono font-bold text-foreground">{item.kode}</span>
                        {item.productName && (
                          <p className="text-muted-foreground truncate">({item.productName})</p>
                        )}
                      </div>
                      <span className="font-bold text-primary shrink-0 ml-2">{item.qty} pcs</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Button */}
      <Button
        onClick={() => {
          setEditingNotaId(null);
          setNomorFaktur("");
          setTanggal("");
          setPages("1");
          setItems([{ kode: "", qty: 0 }]);
          setShowDialog(true);
        }}
        className="w-full h-11 rounded-xl border-dashed border font-bold gap-2"
        variant="outline"
      >
        <Plus className="h-4 w-4" /> Tambah Nota
      </Button>

      {/* Dialog Input Nota */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingNotaId ? "Edit Nota" : "Input Nota Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nota Header Info */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-muted-foreground">Nomor Faktur</Label>
                <Input
                  value={nomorFaktur}
                  onChange={(e) => setNomorFaktur(e.target.value)}
                  placeholder="INV-001"
                  className="mt-1 h-9 rounded-lg text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">Tanggal</Label>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="mt-1 h-9 rounded-lg text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-muted-foreground">Jumlah Halaman</Label>
                <Select value={pages} onValueChange={setPages}>
                  <SelectTrigger className="mt-1 h-9 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} halaman
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items Input */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground">Detail Barang</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            placeholder="Kode"
                            value={item.kode}
                            onChange={(e) =>
                              updateItem(idx, "kode", e.target.value.toUpperCase())
                            }
                            list="product-codes-nota"
                            className="h-9 rounded-lg text-sm font-mono"
                          />
                          {item.isValid && item.productName && (
                            <p className="text-[10px] text-success mt-0.5 truncate">
                              ✓ {item.productName}
                            </p>
                          )}
                          {item.kode && !item.isValid && (
                            <p className="text-[10px] text-destructive mt-0.5">
                              ✗ Tidak ditemukan
                            </p>
                          )}
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.qty === 0 ? "" : item.qty}
                            onChange={(e) =>
                              updateItem(idx, "qty", parseInt(e.target.value, 10) || 0)
                            }
                            className="h-9 rounded-lg text-sm text-center"
                          />
                        </div>
                      </div>
                    </div>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removeItem(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <datalist id="product-codes-nota">
                {products?.map((p) => (
                  <option key={p.id} value={p.kode} />
                ))}
              </datalist>

              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                className="w-full h-8 text-xs rounded-lg"
              >
                <Plus className="h-3 w-3 mr-1" /> Tambah Item
              </Button>
            </div>

            {/* Validation Summary */}
            <div className="rounded-lg border p-2 bg-muted/30 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Total Item:</span>
                <span className="font-bold">{items.filter(i => i.kode.trim()).length}</span>
              </div>
              <div className="flex justify-between">
                <span>Item Valid:</span>
                <span className={cn(
                  "font-bold",
                  items.filter(i => i.isValid).length > 0 ? "text-success" : "text-destructive"
                )}>
                  {items.filter(i => i.isValid).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Qty:</span>
                <span className="font-bold">{items.reduce((s, i) => s + i.qty, 0)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              <X className="h-4 w-4 mr-1" /> Batal
            </Button>
            <Button onClick={handleSaveNota}>
              <Check className="h-4 w-4 mr-1" /> Simpan Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
