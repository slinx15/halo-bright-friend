import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PackageMinus, Send } from "lucide-react";
import { formatDate, formatNumber, formatRupiah } from "@/lib/formatters";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getAuthHeaders(prefer = "return=minimal") {
  const storageKey = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
  let token = SUPABASE_KEY;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.access_token || SUPABASE_KEY;
    }
  } catch {}
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${token}`,
    "Prefer": prefer,
  };
}

const BarangKeluar = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [kode, setKode] = useState("");
  const [qtyPesan, setQtyPesan] = useState(0);
  const [qtyKirim, setQtyKirim] = useState(0);
  const [hargaType, setHargaType] = useState("normal");
  const [catatan, setCatatan] = useState("");
  const [toko, setToko] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matched = products?.find((p) => p.kode.toUpperCase() === kode.toUpperCase());
  const hargaSatuan = matched?.prices
    ? hargaType === "grosir" ? matched.prices.harga_grosir : matched.prices.harga_normal
    : 0;
  const totalHarga = hargaSatuan * qtyKirim;
  const stokTersedia = matched?.stock?.jumlah ?? 0;
  const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];

  // Preview deduction
  const previewStacks = qtyKirim > 0 && qtyKirim <= stokTersedia
    ? deductFromStacks(currentStacks, qtyKirim)
    : currentStacks;

  const { data: history } = useQuery({
    queryKey: ["stock_out_history"],
    queryFn: async () => {
      const headers = getAuthHeaders("return=representation");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=*,products(kode,nama)&order=created_at.desc&limit=50`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const handleSubmit = async () => {
    if (!matched) {
      toast({ title: "Error", description: "Produk tidak ditemukan", variant: "destructive" });
      return;
    }
    if (qtyKirim <= 0) {
      toast({ title: "Error", description: "Qty kirim harus > 0", variant: "destructive" });
      return;
    }
    if (qtyKirim > stokTersedia) {
      toast({ title: "Error", description: `Stok tidak cukup (tersedia: ${stokTersedia})`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const headers = getAuthHeaders();

      // Insert stock_out
      const outRes = await fetch(`${SUPABASE_URL}/rest/v1/stock_out`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_id: matched.id,
          qty_pesan: qtyPesan,
          qty_kirim: qtyKirim,
          harga_type: hargaType,
          harga_satuan: hargaSatuan,
          total_harga: totalHarga,
          catatan: catatan || null,
          toko: toko.trim() || "",
          user_id: user!.id,
        }),
      });
      if (!outRes.ok) throw new Error(await outRes.text());

      // Update stock with tumpukan deduction
      const newStacks = deductFromStacks(currentStacks, qtyKirim);
      const stockRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${matched.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            jumlah: stokTersedia - qtyKirim,
            tumpukan_detail: newStacks,
          }),
        }
      );
      if (!stockRes.ok) throw new Error(await stockRes.text());

      toast({ title: "Berhasil", description: `${matched.kode} keluar ${qtyKirim} pcs` });
      setKode("");
      setQtyPesan(0);
      setQtyKirim(0);
      setCatatan("");
      setToko("");
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <PackageMinus className="h-6 w-6 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold">Barang Keluar</h1>
          <p className="text-muted-foreground text-sm">Catat penjualan / pengiriman</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Input Barang Keluar</CardTitle>
            <OcrUpload
              mode="keluar"
              onResult={(ocrItems) => {
                if (ocrItems.length > 0) {
                  const first = ocrItems[0];
                  setKode((first.kode || "").toUpperCase());
                  setQtyPesan(first.qty_pesan || 0);
                  setQtyKirim(first.qty_kirim || 0);
                  if (first.harga_type) setHargaType(first.harga_type);
                  if (first.toko) setToko(first.toko);
                }
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Kode Produk</Label>
              <Input
                placeholder="Kode..."
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                list="product-codes-out"
              />
              <datalist id="product-codes-out">
                {products?.map((p) => <option key={p.id} value={p.kode} />)}
              </datalist>
              {matched && (
                <p className="text-xs text-muted-foreground mt-1">
                  {matched.nama} — Stok: <span className="font-semibold">{stokTersedia}</span>
                </p>
              )}
              {kode && !matched && <p className="text-xs text-destructive mt-1">Produk tidak ditemukan</p>}
            </div>
            <div>
              <Label>Tipe Harga</Label>
              <Select value={hargaType} onValueChange={setHargaType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal {matched?.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                  <SelectItem value="grosir">Grosir {matched?.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qty Pesan</Label>
              <Input type="number" min={0} value={qtyPesan} onChange={(e) => setQtyPesan(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Qty Kirim</Label>
              <Input type="number" min={0} value={qtyKirim} onChange={(e) => setQtyKirim(parseInt(e.target.value) || 0)} />
            </div>
          </div>

          {matched && currentStacks.length > 0 && (
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Tumpukan sekarang:</span>
                <TumpukanBadges stacks={currentStacks} kode={matched.kode} compact />
              </div>
              {qtyKirim > 0 && qtyKirim <= stokTersedia && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-medium">Setelah keluar:</span>
                  <TumpukanBadges stacks={previewStacks} kode={matched.kode} compact />
                  <span className="text-muted-foreground">= {previewStacks.reduce((s, v) => s + v, 0)}</span>
                </div>
              )}
              {qtyKirim > stokTersedia && (
                <p className="text-xs text-destructive font-medium">⚠️ Stok tidak cukup!</p>
              )}
            </div>
          )}

          {matched && qtyKirim > 0 && qtyKirim <= stokTersedia && (
            <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span>Harga Satuan</span><span className="font-semibold">{formatRupiah(hargaSatuan)}</span></div>
              <div className="flex justify-between"><span>Total</span><span className="font-bold text-primary">{formatRupiah(totalHarga)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nama Toko / Pelanggan (opsional)</Label>
              <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." />
            </div>
            <div>
              <Label>Catatan (opsional)</Label>
              <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !matched} className="w-full">
            <Send className="h-4 w-4 mr-2" /> {submitting ? "Menyimpan..." : "Simpan Barang Keluar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Riwayat Barang Keluar</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Toko</TableHead>
                  <TableHead className="text-right">Pesan</TableHead>
                  <TableHead className="text-right">Kirim</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{formatDate(h.created_at)}</TableCell>
                    <TableCell className="font-mono text-sm">{h.products?.kode}</TableCell>
                    <TableCell className="text-sm">{h.products?.nama}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.toko || "-"}</TableCell>
                    <TableCell className="text-right">{formatNumber(h.qty_pesan)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(h.qty_kirim)}</TableCell>
                    <TableCell className="capitalize text-xs">{h.harga_type}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRupiah(h.total_harga)}</TableCell>
                  </TableRow>
                ))}
                {(!history || history.length === 0) && (
                  <TableRow>
                     <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                       Belum ada riwayat barang keluar
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

export default BarangKeluar;
