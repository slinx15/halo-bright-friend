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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PackageMinus, Send, Clock, Store, Hash, ChevronDown } from "lucide-react";
import { formatDate, formatNumber, formatRupiah } from "@/lib/formatters";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { BulkKeluarInput, type BulkKeluarItem } from "@/components/keluar/BulkKeluarInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { TransactionSkeleton } from "@/components/LoadingSkeletons";
import { PageHeader } from "@/components/PageHeader";

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
  const isMobile = useIsMobile();

  // Single mode state
  const [kode, setKode] = useState("");
  const [qtyPesan, setQtyPesan] = useState(0);
  const [qtyKirim, setQtyKirim] = useState(0);
  const [hargaType, setHargaType] = useState("normal");
  const [catatan, setCatatan] = useState("");
  const [toko, setToko] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bulk mode state
  const [bulkToko, setBulkToko] = useState("");
  const [bulkCatatan, setBulkCatatan] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const matched = products?.find((p) => p.kode.toUpperCase() === kode.toUpperCase());
  const hargaSatuan = matched?.prices
    ? hargaType === "grosir" ? matched.prices.harga_grosir : matched.prices.harga_normal
    : 0;
  const totalHarga = hargaSatuan * qtyKirim;
  const stokTersedia = matched?.stock?.jumlah ?? 0;
  const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];

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
      setKode(""); setQtyPesan(0); setQtyKirim(0); setCatatan(""); setToko("");
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleBulkSubmit = async (items: BulkKeluarItem[]) => {
    setBulkSubmitting(true);
    const headers = getAuthHeaders();
    let successCount = 0;
    try {
      for (const item of items) {
        const product = item.product!;
        const stok = product.stock?.jumlah ?? 0;
        const stacks = (product.stock?.tumpukan_detail as number[]) ?? [];
        const price = product.prices
          ? item.hargaType === "grosir" ? product.prices.harga_grosir : product.prices.harga_normal
          : 0;
        const outRes = await fetch(`${SUPABASE_URL}/rest/v1/stock_out`, {
          method: "POST", headers,
          body: JSON.stringify({
            product_id: product.id, qty_pesan: item.qtyPesan, qty_kirim: item.qtyKirim,
            harga_type: item.hargaType, harga_satuan: price, total_harga: price * item.qtyKirim,
            catatan: bulkCatatan || null, toko: bulkToko.trim() || "", user_id: user!.id,
          }),
        });
        if (!outRes.ok) throw new Error(await outRes.text());
        const newStacks = deductFromStacks(stacks, item.qtyKirim);
        const stockRes = await fetch(
          `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${product.id}`,
          { method: "PATCH", headers, body: JSON.stringify({ jumlah: stok - item.qtyKirim, tumpukan_detail: newStacks }) }
        );
        if (!stockRes.ok) throw new Error(await stockRes.text());
        successCount++;
      }
      toast({ title: "Berhasil", description: `${successCount} item berhasil disimpan` });
      setBulkToko(""); setBulkCatatan("");
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: `${successCount} tersimpan, gagal: ${err.message}`, variant: "destructive" });
    }
    setBulkSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <PageHeader
        icon={PackageMinus}
        iconColor="text-destructive"
        iconBg="bg-destructive/10"
        title="Barang Keluar"
        subtitle="Catat penjualan / pengiriman"
      />

      <Tabs defaultValue="bulk" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 rounded-xl h-11">
          <TabsTrigger value="single" className="rounded-lg font-semibold">Satuan</TabsTrigger>
          <TabsTrigger value="bulk" className="rounded-lg font-semibold">Input Cepat</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card className="boss-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Input Barang Keluar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Kode Produk</Label>
                  <Input placeholder="Kode..." value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} list="product-codes-out" className="rounded-lg mt-1" />
                  <datalist id="product-codes-out">
                    {products?.map((p) => <option key={p.id} value={p.kode} />)}
                  </datalist>
                  {matched && <p className="text-xs text-success mt-1 font-medium">✓ {matched.nama} — Stok: <span className="font-bold tabular-nums">{stokTersedia}</span></p>}
                  {kode && !matched && <p className="text-xs text-destructive mt-1 font-medium">✗ Produk tidak ditemukan</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Tipe Harga</Label>
                  <Select value={hargaType} onValueChange={setHargaType}>
                    <SelectTrigger className="rounded-lg mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal {matched?.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                      <SelectItem value="grosir">Grosir {matched?.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Qty Pesan</Label>
                  <Input type="number" min={0} value={qtyPesan} onChange={(e) => setQtyPesan(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Qty Kirim</Label>
                  <Input type="number" min={0} value={qtyKirim} onChange={(e) => setQtyKirim(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                </div>
              </div>

              {matched && currentStacks.length > 0 && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-medium">Tumpukan sekarang:</span>
                    <TumpukanBadges stacks={currentStacks} kode={matched.kode} compact />
                  </div>
                  {qtyKirim > 0 && qtyKirim <= stokTersedia && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-foreground font-bold">Setelah keluar:</span>
                      <TumpukanBadges stacks={previewStacks} kode={matched.kode} compact />
                      <Badge variant="secondary" className="text-[10px] rounded-full px-2">= {previewStacks.reduce((s, v) => s + v, 0)}</Badge>
                    </div>
                  )}
                  {qtyKirim > stokTersedia && <p className="text-xs text-destructive font-bold">⚠️ Stok tidak cukup!</p>}
                </div>
              )}

              {matched && qtyKirim > 0 && qtyKirim <= stokTersedia && (
                <div className="bg-muted/40 p-3.5 rounded-xl text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Harga Satuan</span><span className="font-semibold tabular-nums">{formatRupiah(hargaSatuan)}</span></div>
                  <div className="flex justify-between"><span className="font-medium">Total</span><span className="font-extrabold text-primary tabular-nums">{formatRupiah(totalHarga)}</span></div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</Label>
                  <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</Label>
                  <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} className="rounded-lg mt-1" />
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={submitting || !matched} className="w-full rounded-xl h-12 text-base font-bold press-scale shadow-md hover:shadow-lg">
                <Send className="h-5 w-5 mr-2" /> {submitting ? "Menyimpan..." : "Simpan Barang Keluar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk">
          <BulkKeluarInput
            products={products ?? []}
            onSubmit={handleBulkSubmit}
            submitting={bulkSubmitting}
            toko={bulkToko}
            setToko={setBulkToko}
            catatan={bulkCatatan}
            setCatatan={setBulkCatatan}
          />
        </TabsContent>
      </Tabs>

      {/* Riwayat */}
      <Card className="boss-card">
        <Collapsible>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Barang Keluar
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2">{history.length}</Badge>
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
                    <div className="py-8 text-center">
                      <PackageMinus className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Belum ada riwayat</p>
                    </div>
                  ) : history.map((h: any) => (
                    <div key={h.id} className="rounded-xl border border-border/60 p-3.5 space-y-2 press-scale">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-sm">{h.products?.kode}</span>
                          <span className="text-xs text-muted-foreground truncate">{h.products?.nama}</span>
                        </div>
                        <Badge className="rounded-full text-xs font-extrabold px-2.5 bg-destructive/15 text-destructive border-0">
                          -{formatNumber(h.qty_kirim)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pesan</span>
                          <span className="font-semibold tabular-nums">{formatNumber(h.qty_pesan)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-bold text-primary tabular-nums">{formatRupiah(h.total_harga)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Harga</span>
                          <span className="capitalize font-medium">{h.harga_type}</span>
                        </div>
                        {h.toko && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Store className="h-3 w-3" /> {h.toko}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                        <Clock className="h-3 w-3" /> {formatDate(h.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
                          <TableCell className="font-mono font-semibold text-sm">{h.products?.kode}</TableCell>
                          <TableCell className="text-sm">{h.products?.nama}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{h.toko || "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(h.qty_pesan)}</TableCell>
                          <TableCell className="text-right">
                            <Badge className="rounded-full bg-destructive/15 text-destructive border-0 font-bold">-{formatNumber(h.qty_kirim)}</Badge>
                          </TableCell>
                          <TableCell className="capitalize text-xs">{h.harga_type}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums">{formatRupiah(h.total_harga)}</TableCell>
                        </TableRow>
                      ))}
                      {(!history || history.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Belum ada riwayat</TableCell>
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

export default BarangKeluar;
