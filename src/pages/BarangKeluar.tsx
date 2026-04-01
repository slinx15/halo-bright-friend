import { useState, useRef } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PackageMinus, Send, Clock, Store, Hash, ChevronDown, Zap, FileText, CheckCircle2, DollarSign, CalendarIcon, Trash2 } from "lucide-react";
import { formatDate, formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { BulkKeluarInput, type BulkKeluarItem, type BulkKeluarInputHandle } from "@/components/keluar/BulkKeluarInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { TransactionSkeleton } from "@/components/LoadingSkeletons";

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
  const { user, role } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bulkRef = useRef<BulkKeluarInputHandle>(null);
  const [activeTab, setActiveTab] = useState("bulk");

  // Single mode state
  const [kode, setKode] = useState("");
  const [qtyPesan, setQtyPesan] = useState(0);
  const [qtyKirim, setQtyKirim] = useState(0);
  const [hargaType, setHargaType] = useState("normal");
  const [catatan, setCatatan] = useState("");
  const [toko, setToko] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Bulk mode state
  const [bulkToko, setBulkToko] = useState("");
  const [bulkCatatan, setBulkCatatan] = useState("");
  const [bulkTanggal, setBulkTanggal] = useState<Date | undefined>(undefined);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const matched = products?.find((p) => p.kode.toUpperCase() === kode.toUpperCase());
  const hargaSatuan = matched?.prices
    ? hargaType === "grosir2" ? matched.prices.harga_grosir2 : hargaType === "grosir" ? matched.prices.harga_grosir : matched.prices.harga_normal
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
        `${SUPABASE_URL}/rest/v1/stock_out?select=*,products(kode,nama)&order=created_at.desc,id.desc&limit=50`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Today's stats from history
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = history?.filter((h: any) => h.created_at?.startsWith(todayStr)) ?? [];
  const todayQty = todayItems.reduce((s: number, h: any) => s + (h.qty_kirim ?? 0), 0);
  const todayRevenue = todayItems.reduce((s: number, h: any) => s + (h.total_harga ?? 0), 0);

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
          ...(tanggal ? { created_at: tanggal.toISOString() } : {}),
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
      setKode(""); setQtyPesan(0); setQtyKirim(0); setCatatan(""); setToko(""); setTanggal(undefined);
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        return res;
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Max retries reached");
  };

  const handleBulkSubmit = async (items: BulkKeluarItem[]) => {
    setBulkSubmitting(true);
    const headers = getAuthHeaders();
    let successCount = 0;
    const errors: string[] = [];
    for (const item of items) {
      try {
        const product = item.product!;
        const stok = product.stock?.jumlah ?? 0;
        const stacks = (product.stock?.tumpukan_detail as number[]) ?? [];
        const price = product.prices
          ? item.hargaType === "grosir2" ? product.prices.harga_grosir2 : item.hargaType === "grosir" ? product.prices.harga_grosir : product.prices.harga_normal
          : 0;
        const outRes = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/stock_out`, {
          method: "POST", headers,
          body: JSON.stringify({
            product_id: product.id, qty_pesan: item.qtyPesan, qty_kirim: item.qtyKirim,
            harga_type: item.hargaType, harga_satuan: price, total_harga: price * item.qtyKirim,
            catatan: bulkCatatan || null, toko: bulkToko.trim() || "", user_id: user!.id,
            ...(bulkTanggal ? { created_at: bulkTanggal.toISOString() } : {}),
          }),
        });
        if (!outRes.ok) {
          errors.push(`${item.kode}: ${await outRes.text()}`);
          continue;
        }
        const newStacks = deductFromStacks(stacks, item.qtyKirim);
        const stockRes = await fetchWithRetry(
          `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${product.id}`,
          { method: "PATCH", headers, body: JSON.stringify({ jumlah: stok - item.qtyKirim, tumpukan_detail: newStacks }) }
        );
        if (!stockRes.ok) {
          errors.push(`${item.kode} (stok): ${await stockRes.text()}`);
          continue;
        }
        successCount++;
      } catch (err: any) {
        errors.push(`${item.kode}: ${err.message}`);
      }
    }
    if (errors.length > 0) {
      toast({ title: "Sebagian Gagal", description: `${successCount} berhasil, ${errors.length} gagal: ${errors[0]}`, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `${successCount} item berhasil disimpan` });
    }
    if (successCount > 0) {
      setBulkToko(""); setBulkCatatan(""); setBulkTanggal(undefined);
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
    setBulkSubmitting(false);
  };

  const handleDeleteTransaction = async (item: any) => {
    setDeletingId(item.id);
    try {
      const headers = getAuthHeaders();
      // Restore stock first
      const stockRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${item.product_id}`,
        { headers: { ...headers, Prefer: "return=representation" } }
      );
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        if (stockData.length > 0) {
          const currentStock = stockData[0].jumlah ?? 0;
          const currentStacks = (stockData[0].tumpukan_detail as number[]) ?? [];
          const restoredStacks = currentStacks.length > 0
            ? [...currentStacks, item.qty_kirim]
            : currentStacks;
          await fetch(
            `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${item.product_id}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                jumlah: currentStock + item.qty_kirim,
                tumpukan_detail: restoredStacks,
              }),
            }
          );
        }
      }
      // Delete the stock_out record
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?id=eq.${item.id}`,
        { method: "DELETE", headers }
      );
      if (!delRes.ok) throw new Error(await delRes.text());
      toast({ title: "Berhasil", description: `Transaksi ${item.products?.kode} dihapus, stok dikembalikan +${item.qty_kirim}` });
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeletingId(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Premium Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-destructive/10 shadow-sm">
            <PackageMinus className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">Barang Keluar</h1>
            <p className="text-muted-foreground text-xs font-medium">Catat penjualan / pengiriman</p>
          </div>
        </div>
        <OcrUpload
          mode="keluar"
          onResult={(items) => {
            setActiveTab("bulk");
            setTimeout(() => bulkRef.current?.handleOcrResult(items), 100);
          }}
        />
      </div>

      {/* ── Quick KPI Strip ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-destructive/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-destructive tabular-nums">{todayItems.length}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Transaksi</p>
        </div>
        <div className="card-premium bg-warning/5 p-3 text-center">
          <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(todayQty)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Qty Hari Ini</p>
        </div>
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-lg font-extrabold text-success tabular-nums truncate">{formatRupiah(todayRevenue)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Omzet Hari Ini</p>
        </div>
      </div>

      {/* ── Tab Input ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 p-1 bg-muted/60">
          <TabsTrigger value="single" className="rounded-lg font-semibold text-sm data-[state=active]:shadow-sm min-h-[40px]">
            <FileText className="h-4 w-4 mr-1.5" /> Satuan
          </TabsTrigger>
          <TabsTrigger value="bulk" className="rounded-lg font-semibold text-sm data-[state=active]:shadow-sm min-h-[40px]">
            <Zap className="h-4 w-4 mr-1.5" /> Input Cepat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card className="card-premium overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-destructive/5 to-transparent">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <PackageMinus className="h-4 w-4 text-destructive" />
                Input Barang Keluar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Kode Produk</Label>
                  <Input placeholder="Kode..." value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} list="product-codes-out" className="rounded-lg mt-1" />
                  <datalist id="product-codes-out">
                    {products?.map((p) => <option key={p.id} value={p.kode} />)}
                  </datalist>
                  {matched && (
                    <p className="text-xs text-success mt-1 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {matched.nama} — Stok: <span className="font-bold tabular-nums">{stokTersedia}</span>
                    </p>
                  )}
                  {kode && !matched && <p className="text-xs text-destructive mt-1 font-medium">✗ Produk tidak ditemukan</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Tipe Harga</Label>
                  <Select value={hargaType} onValueChange={setHargaType}>
                    <SelectTrigger className="rounded-lg mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal {matched?.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                      <SelectItem value="grosir">Grosir {matched?.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                      <SelectItem value="grosir2">Grosir 2 {matched?.prices ? `(${formatRupiah(matched.prices.harga_grosir2)})` : ""}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Qty Pesan</Label>
                  <Input type="text" inputMode="numeric" value={qtyPesan === 0 ? "" : qtyPesan} onChange={(e) => setQtyPesan(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} placeholder="0" className="rounded-lg mt-1 tabular-nums font-bold text-base" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Qty Kirim</Label>
                  <Input type="text" inputMode="numeric" value={qtyKirim === 0 ? "" : qtyKirim} onChange={(e) => setQtyKirim(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} placeholder="0" className="rounded-lg mt-1 tabular-nums font-bold text-base" />
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
                <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Harga Satuan</span>
                    <span className="font-semibold tabular-nums">{formatRupiah(hargaSatuan)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Total</span>
                    <span className="font-extrabold text-primary tabular-nums text-base">{formatRupiah(totalHarga)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</Label>
                  <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
                </div>
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
                disabled={submitting || !matched}
                className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-destructive hover:bg-destructive/90"
              >
                <Send className="h-5 w-5 mr-2" /> {submitting ? "Menyimpan..." : "Simpan Barang Keluar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk">
          <BulkKeluarInput
            ref={bulkRef}
            products={products ?? []}
            onSubmit={handleBulkSubmit}
            submitting={bulkSubmitting}
            toko={bulkToko}
            setToko={setBulkToko}
            catatan={bulkCatatan}
            setCatatan={setBulkCatatan}
            tanggal={bulkTanggal}
            setTanggal={setBulkTanggal}
          />
        </TabsContent>
      </Tabs>

      {/* ── Riwayat ── */}
      <Card className="card-premium">
        <Collapsible defaultOpen>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left min-h-[44px]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Barang Keluar
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">{history.length}</Badge>
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
                      <PackageMinus className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">Belum ada riwayat</p>
                    </div>
                  ) : history.map((h: any) => (
                    <div key={h.id} className="rounded-xl border border-border/60 p-3.5 space-y-2 transition-all duration-150 active:scale-[0.98] bg-card">
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                          <Clock className="h-3 w-3" /> {formatDate(h.created_at)}
                        </div>
                        {role === "admin" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={deletingId === h.id}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Hapus Transaksi?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {h.products?.kode} — {formatNumber(h.qty_kirim)} pcs ({formatRupiah(h.total_harga)}). Stok akan dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDeleteTransaction(h)}>Hapus</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-bold">Waktu</TableHead>
                        <TableHead className="font-bold">Kode</TableHead>
                        <TableHead className="font-bold">Nama</TableHead>
                        <TableHead className="font-bold">Toko</TableHead>
                        <TableHead className="text-right font-bold">Pesan</TableHead>
                        <TableHead className="text-right font-bold">Kirim</TableHead>
                        <TableHead className="font-bold">Harga</TableHead>
                        <TableHead className="text-right font-bold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history?.map((h: any, idx: number) => (
                        <TableRow key={h.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                          <TableCell className="font-mono font-bold text-sm">{h.products?.kode}</TableCell>
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
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-10">Belum ada riwayat</TableCell>
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
