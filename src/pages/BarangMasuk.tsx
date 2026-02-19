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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PackagePlus, Plus, Trash2, Send } from "lucide-react";
import { formatDate, formatNumber, TUMPUKAN_OPTIONS } from "@/lib/formatters";

interface LineItem {
  kode: string;
  qty: number;
  tumpukan: string;
  productName?: string;
  productId?: string;
}

const BarangMasuk = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<LineItem[]>([{ kode: "", qty: 1, tumpukan: "" }]);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      }
      return updated;
    });
  };

  const addLine = () => setItems((prev) => [...prev, { kode: "", qty: 1, tumpukan: "" }]);
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
        await supabase.from("stock_in").insert({
          product_id: item.productId!,
          qty: item.qty,
          tumpukan: item.tumpukan || null,
          catatan: catatan || null,
          user_id: user!.id,
        });
        // Update stock
        const { data: existing } = await supabase
          .from("stock")
          .select("*")
          .eq("product_id", item.productId!)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("stock")
            .update({ jumlah: existing.jumlah + item.qty, tumpukan: item.tumpukan || existing.tumpukan })
            .eq("id", existing.id);
        } else {
          await supabase.from("stock").insert({
            product_id: item.productId!,
            jumlah: item.qty,
            tumpukan: item.tumpukan || null,
          });
        }
      }
      toast({ title: "Berhasil", description: `${validItems.length} item masuk tercatat` });
      setItems([{ kode: "", qty: 1, tumpukan: "" }]);
      setCatatan("");
      queryClient.invalidateQueries({ queryKey: ["stock_in_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <PackagePlus className="h-6 w-6 text-success" />
        <div>
          <h1 className="text-2xl font-bold">Barang Masuk</h1>
          <p className="text-muted-foreground text-sm">Catat barang masuk ke gudang</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Input Barang Masuk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-end border-b border-border pb-3">
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Kode Produk</Label>
                <Input
                  placeholder="Kode..."
                  value={item.kode}
                  onChange={(e) => updateItem(i, "kode", e.target.value.toUpperCase())}
                  list="product-codes"
                />
                {item.productName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.productName}</p>
                )}
                {item.kode && !item.productId && (
                  <p className="text-xs text-destructive mt-0.5">Produk tidak ditemukan</p>
                )}
              </div>
              <div className="w-20">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => updateItem(i, "qty", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="w-24">
                <Label className="text-xs">Tumpukan</Label>
                <Select value={item.tumpukan} onValueChange={(v) => updateItem(i, "tumpukan", v)}>
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    {TUMPUKAN_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <datalist id="product-codes">
            {products?.map((p) => <option key={p.id} value={p.kode} />)}
          </datalist>
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>
          <div>
            <Label className="text-xs">Catatan (opsional)</Label>
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} />
          </div>
          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            <Send className="h-4 w-4 mr-2" /> {submitting ? "Menyimpan..." : "Simpan Barang Masuk"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Riwayat Barang Masuk</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableCell className="font-mono text-sm">{h.products?.kode}</TableCell>
                    <TableCell className="text-sm">{h.products?.nama}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(h.qty)}</TableCell>
                    <TableCell>{h.tumpukan || "-"}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default BarangMasuk;
