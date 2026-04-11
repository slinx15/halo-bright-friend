import { useState, useMemo, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PackageMinus, Send, Clock, Store, ChevronDown, CheckCircle2, DollarSign, CalendarIcon, Trash2, Search, Plus, SlidersHorizontal } from "lucide-react";
import { formatDate, formatNumber, formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TransactionSkeleton } from "@/components/LoadingSkeletons";
import { getAuthHeaders } from "@/lib/authHeaders";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface LineItem {
  kode: string;
  qtyPesan: number;
  qtyKirim: number;
  hargaType: string;
  customHarga?: number;
  toko: string;
  productId?: string;
  productKode?: string;
  productName?: string;
}

const BarangKeluar = () => {
  const { user, role } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Multi-row input state
  const [items, setItems] = useState<LineItem[]>([{ kode: "", qtyPesan: 0, qtyKirim: 0, hargaType: "normal", toko: "" }]);
  const [globalToko, setGlobalToko] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Search/filter state for history
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);

  // Set Harga Sekaligus state
  const [hargaDialogOpen, setHargaDialogOpen] = useState(false);
  const [customWarnaHarga, setCustomWarnaHarga] = useState<number>(0);
  const [customWhtHarga, setCustomWhtHarga] = useState<number>(0);
  const [customBlckHarga, setCustomBlckHarga] = useState<number>(0);

  // Categorize items for bulk price setting
  const validItemsForHarga = useMemo(() => items.filter(i => i.productId), [items]);
  const warnaItems = useMemo(() => validItemsForHarga.filter(i => {
    const k = (i.productKode || i.kode).toUpperCase();
    return !k.includes("WHT") && !k.includes("BLCK") && !k.includes("BLK");
  }), [validItemsForHarga]);
  const whtItems = useMemo(() => validItemsForHarga.filter(i => (i.productKode || i.kode).toUpperCase().includes("WHT")), [validItemsForHarga]);
  const blckItems = useMemo(() => validItemsForHarga.filter(i => {
    const k = (i.productKode || i.kode).toUpperCase();
    return k.includes("BLCK") || k.includes("BLK");
  }), [validItemsForHarga]);

  const applyBulkHarga = useCallback((filter: (k: string) => boolean, type: string, customHarga?: number) => {
    setItems(prev => prev.map(item => {
      if (!item.productId) return item;
      const k = (item.productKode || item.kode).toUpperCase();
      if (!filter(k)) return item;
      if (type === "custom" && customHarga && customHarga > 0) {
        return { ...item, hargaType: "custom", customHarga };
      }
      if (type !== "custom") {
        return { ...item, hargaType: type };
      }
      return item;
    }));
  }, []);

  // Auto-detect: search ALL products by kode (exact, base code, or nama)
  const findProduct = (input: string) => {
    if (!input.trim() || !products) return undefined;
    const k = input.toUpperCase().trim();
    // Exact kode match
    let found = products.find(p => p.kode.toUpperCase() === k);
    if (found) return found;
    // Match by nama
    found = products.find(p => p.nama.toUpperCase() === k);
    if (found) return found;
    // Base code match: if input matches a base code and there's exactly one in default category (2 Ons)
    const baseMatches = products.filter(p => {
      const base = p.kode.toUpperCase().replace(/\s+(2 ONS|3 ONS|5 ONS|18 GRAM)$/i, "");
      return base === k;
    });
    if (baseMatches.length === 1) return baseMatches[0];
    // Prefer 2 Ons if ambiguous
    const twoOns = baseMatches.find(p => p.kategori === "2 Ons");
    if (twoOns) return twoOns;
    return baseMatches[0];
  };

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "kode") {
        const found = findProduct(String(value));
        updated[index].productId = found?.id;
        updated[index].productKode = found?.kode;
        updated[index].productName = found?.nama;
      }
      return updated;
    });
  };

  const addLine = () => setItems(prev => [...prev, { kode: "", qtyPesan: 0, qtyKirim: 0, hargaType: "normal", toko: "" }]);
  const removeLine = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const getMatchedProduct = (item: LineItem) => products?.find(p => p.id === item.productId);

  const getPrice = (item: LineItem) => {
    const p = getMatchedProduct(item);
    if (!p?.prices) return 0;
    if (item.hargaType === "custom") return item.customHarga ?? 0;
    if (item.hargaType === "grosir2") return p.prices.harga_grosir2;
    if (item.hargaType === "grosir") return p.prices.harga_grosir;
    return p.prices.harga_normal;
  };

  const getUnitLabel = (item: LineItem) => {
    const p = getMatchedProduct(item);
    return p?.kategori === "18 Gram" ? "pack" : "pcs";
  };

  const { data: history } = useQuery({
    queryKey: ["stock_out_history"],
    queryFn: async () => {
      const headers = await getAuthHeaders("return=representation");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=*,products(kode,nama)&order=created_at.desc,id.desc&limit=50`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Today's stats
  const todayLocal = new Date();
  const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
  const todayItems = history?.filter((h: any) => {
    if (!h.created_at) return false;
    const d = new Date(h.created_at);
    const localStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return localStr === todayStr;
  }) ?? [];
  const todayQty = todayItems.reduce((s: number, h: any) => s + (h.qty_kirim ?? 0), 0);
  const todayRevenue = todayItems.reduce((s: number, h: any) => s + (h.total_harga ?? 0), 0);

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    return history.filter((h: any) => {
      const matchSearch = !historySearch ||
        h.products?.kode?.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.products?.nama?.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.toko?.toLowerCase().includes(historySearch.toLowerCase());
      const matchDate = !historyDateFilter || (() => {
        const d = new Date(h.created_at);
        const localStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return localStr === format(historyDateFilter, "yyyy-MM-dd");
      })();
      return matchSearch && matchDate;
    });
  }, [history, historySearch, historyDateFilter]);

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetch(url, options);
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Max retries reached");
  };

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.productId && i.qtyKirim > 0);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const headers = await getAuthHeaders();
    let successCount = 0;
    const errors: string[] = [];

    // Track live stock per product for duplicate handling
    const liveStock = new Map<string, { jumlah: number; stacks: number[] }>();

    for (const item of validItems) {
      try {
        const product = getMatchedProduct(item)!;

        if (!liveStock.has(product.id)) {
          liveStock.set(product.id, {
            jumlah: product.stock?.jumlah ?? 0,
            stacks: [...((product.stock?.tumpukan_detail as number[]) ?? [])],
          });
        }
        const currentStock = liveStock.get(product.id)!;

        if (item.qtyKirim > currentStock.jumlah) {
          errors.push(`${product.kode}: Stok tidak cukup (sisa ${currentStock.jumlah})`);
          continue;
        }

        const price = getPrice(item);
        const tokoName = item.toko.trim() || globalToko.trim() || "";

        const outRes = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/stock_out`, {
          method: "POST", headers,
          body: JSON.stringify({
            product_id: product.id,
            qty_pesan: item.qtyPesan,
            qty_kirim: item.qtyKirim,
            harga_type: item.hargaType === "custom" ? "custom" : item.hargaType,
            harga_satuan: price,
            total_harga: price * item.qtyKirim,
            catatan: catatan || null,
            toko: tokoName,
            user_id: user!.id,
            ...(tanggal ? { created_at: new Date(tanggal.getFullYear(), tanggal.getMonth(), tanggal.getDate(), 12, 0, 0).toISOString() } : {}),
          }),
        });
        if (!outRes.ok) { errors.push(`${product.kode}: ${await outRes.text()}`); continue; }

        const newStacks = deductFromStacks(currentStock.stacks, item.qtyKirim);
        const newJumlah = currentStock.jumlah - item.qtyKirim;

        const stockRes = await fetchWithRetry(
          `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${product.id}`,
          { method: "PATCH", headers, body: JSON.stringify({ jumlah: newJumlah, tumpukan_detail: newStacks }) }
        );
        if (!stockRes.ok) { errors.push(`${product.kode} (stok): ${await stockRes.text()}`); continue; }

        currentStock.jumlah = newJumlah;
        currentStock.stacks = newStacks;
        successCount++;
      } catch (err: any) {
        errors.push(`${item.kode}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      toast({ title: `${successCount} berhasil, ${errors.length} gagal`, description: errors[0], variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: `${successCount} item berhasil disimpan` });
    }
    if (successCount > 0) {
      setItems([{ kode: "", qtyPesan: 0, qtyKirim: 0, hargaType: "normal", toko: "" }]);
      setGlobalToko(""); setCatatan(""); setTanggal(undefined);
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
    setSubmitting(false);
  };

  const handleOcrResult = (ocrItems: any[]) => {
    const newItems: LineItem[] = ocrItems.map((o: any) => {
      const found = findProduct(o.kode || "");
      return {
        kode: (o.kode || "").toUpperCase(),
        qtyPesan: o.qty_pesan || 0,
        qtyKirim: o.qty_kirim || o.qty || 0,
        hargaType: o.harga_type || "normal",
        toko: "",
        productId: found?.id,
        productKode: found?.kode,
        productName: found?.nama,
      };
    });
    setItems(prev => {
      const existing = prev.filter(i => i.kode.trim());
      return [...existing, ...newItems];
    });
  };

  const handleDeleteTransaction = async (item: any) => {
    setDeletingId(item.id);
    try {
      const headers = await getAuthHeaders();
      const stockRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${item.product_id}`,
        { headers: { ...headers, Prefer: "return=representation" } }
      );
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        if (stockData.length > 0) {
          const currentStock = stockData[0].jumlah ?? 0;
          const currentStacks = (stockData[0].tumpukan_detail as number[]) ?? [];
          const restoredStacks = currentStacks.length > 0 ? [...currentStacks, item.qty_kirim] : currentStacks;
          await fetch(
            `${SUPABASE_URL}/rest/v1/stock?product_id=eq.${item.product_id}`,
            { method: "PATCH", headers, body: JSON.stringify({ jumlah: currentStock + item.qty_kirim, tumpukan_detail: restoredStacks }) }
          );
        }
      }
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/stock_out?id=eq.${item.id}`, { method: "DELETE", headers });
      if (!delRes.ok) throw new Error(await delRes.text());
      toast({ title: "Berhasil", description: `Transaksi ${item.products?.kode} dihapus, stok dikembalikan +${item.qty_kirim}` });
      queryClient.invalidateQueries({ queryKey: ["stock_out_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeletingId(null);
  };

  const validCount = items.filter(i => i.productId && i.qtyKirim > 0).length;
  const totalQty = items.filter(i => i.productId && i.qtyKirim > 0).reduce((s, i) => s + i.qtyKirim, 0);
  const totalRevenue = items.filter(i => i.productId && i.qtyKirim > 0).reduce((s, i) => s + getPrice(i) * i.qtyKirim, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*:nth-child(5)]:![animation-delay:200ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Header ── */}
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
        <OcrUpload mode="keluar" onResult={handleOcrResult} />
      </div>

      {/* ── KPI Strip ── */}
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

      {/* ── Input Card ── */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-destructive/5 to-transparent">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <PackageMinus className="h-4 w-4 text-destructive" />
            Input Barang Keluar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Global: Toko + Tanggal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</Label>
              <Input value={globalToko} onChange={e => setGlobalToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
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
              <Textarea value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Catatan..." rows={1} className="rounded-lg mt-1" />
            </div>
          </div>

          {/* Item rows */}
          {items.map((item, i) => {
            const matched = getMatchedProduct(item);
            const stok = matched?.stock?.jumlah ?? 0;
            const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];
            const overStock = matched && item.qtyKirim > stok;
            const price = getPrice(item);
            const total = price * item.qtyKirim;
            const kategori = matched?.kategori;
            const unitLabel = kategori === "18 Gram" ? "pack" : "pcs";

            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-3 space-y-2 transition-all duration-200",
                  !item.productId && item.kode ? "border-destructive/30 bg-destructive/[0.03]" :
                  overStock ? "border-warning/30 bg-warning/[0.03]" :
                  item.productId ? "border-success/30 bg-success/[0.03] shadow-sm" :
                  "border-border/60 hover:border-border"
                )}
              >
                {/* Row 1: Kode + Delete */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <Input
                      placeholder="Ketik kode produk..."
                      value={item.kode}
                      onChange={e => updateItem(i, "kode", e.target.value.toUpperCase())}
                      list="product-codes-out"
                      className="rounded-lg font-mono"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded-lg h-10 w-10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Product info */}
                {matched && (
                  <div className="flex items-center justify-between text-xs">
                    <p className="text-success font-medium flex items-center gap-1 truncate">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> {matched.nama}
                      {kategori && kategori !== "2 Ons" && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">{kategori}</Badge>
                      )}
                    </p>
                    <span className={cn("font-bold tabular-nums", overStock ? "text-destructive" : "text-muted-foreground")}>
                      Stok: {formatNumber(stok)}
                    </span>
                  </div>
                )}
                {item.kode && !item.productId && (
                  <p className="text-xs text-destructive font-medium">✗ Produk tidak ditemukan</p>
                )}

                {/* Row 2: Qty + Harga */}
                {matched && (
                  <div className="flex items-end gap-2">
                    <div className="w-20">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Pesan</label>
                      <Input
                        type="text" inputMode="numeric"
                        className="h-9 text-sm mt-0.5 text-center font-bold"
                        value={item.qtyPesan === 0 ? "" : item.qtyPesan}
                        onChange={e => updateItem(i, "qtyPesan", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Kirim ({unitLabel})</label>
                      <Input
                        type="text" inputMode="numeric"
                        className="h-9 text-sm mt-0.5 text-center font-bold"
                        value={item.qtyKirim === 0 ? "" : item.qtyKirim}
                        onChange={e => updateItem(i, "qtyKirim", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase">Harga</label>
                      <Select value={item.hargaType} onValueChange={v => updateItem(i, "hargaType", v)}>
                        <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal {matched.prices ? `(${formatRupiah(matched.prices.harga_normal)})` : ""}</SelectItem>
                          <SelectItem value="grosir">Grosir {matched.prices ? `(${formatRupiah(matched.prices.harga_grosir)})` : ""}</SelectItem>
                          {matched.prices?.harga_grosir2 ? <SelectItem value="grosir2">Grosir 2 ({formatRupiah(matched.prices.harga_grosir2)})</SelectItem> : null}
                          <SelectItem value="custom">✏️ Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Custom harga input */}
                {item.hargaType === "custom" && matched && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground shrink-0">Harga custom:</Label>
                    <Input
                      type="text" inputMode="numeric"
                      className="h-8 text-xs text-right font-bold flex-1"
                      placeholder="Rp ..."
                      value={item.customHarga === undefined || item.customHarga === 0 ? "" : item.customHarga}
                      onChange={e => updateItem(i, "customHarga", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}

                {/* Total + stacks */}
                {matched && item.qtyKirim > 0 && !overStock && (
                  <div className="flex items-center justify-between text-xs">
                    {currentStacks.length > 0 && (
                      <TumpukanBadges stacks={deductFromStacks(currentStacks, item.qtyKirim)} kode={matched.kode} compact />
                    )}
                    <span className="text-sm font-bold text-primary tabular-nums ml-auto">
                      {formatRupiah(total)}
                    </span>
                  </div>
                )}
                {overStock && <p className="text-xs text-destructive font-bold">⚠️ Stok tidak cukup!</p>}
              </div>
            );
          })}

          <datalist id="product-codes-out">
            {products?.map(p => <option key={p.id} value={p.kode} label={`${p.kode} — ${p.nama}`} />)}
          </datalist>

          <Button variant="outline" size="sm" onClick={addLine} className="rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          {/* Summary */}
          {validCount > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{validCount} item · {formatNumber(totalQty)} {items.some(i => getMatchedProduct(i)?.kategori === "18 Gram") ? "unit" : "pcs"}</span>
                <span className="font-extrabold text-primary tabular-nums">{formatRupiah(totalRevenue)}</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-destructive hover:bg-destructive/90"
          >
            <Send className="h-5 w-5 mr-2" />
            {submitting ? "Menyimpan..." : `Simpan Barang Keluar${validCount > 0 ? ` (${validCount} item)` : ""}`}
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
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari kode, nama, toko..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} className="pl-9 rounded-xl h-10" />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("rounded-xl h-10 w-10 shrink-0", historyDateFilter && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={historyDateFilter} onSelect={setHistoryDateFilter} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              {historyDateFilter && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs rounded-full">{format(historyDateFilter, "dd MMM yyyy", { locale: localeId })}</Badge>
                  <button onClick={() => setHistoryDateFilter(undefined)} className="text-[10px] text-primary hover:underline">Reset</button>
                </div>
              )}
              {filteredHistory.length !== (history?.length ?? 0) && (
                <p className="text-xs text-muted-foreground">{filteredHistory.length} dari {history?.length} transaksi</p>
              )}
              {isMobile ? (
                <div className="space-y-2.5">
                  {filteredHistory.length === 0 ? (
                    <div className="py-10 text-center">
                      <PackageMinus className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">{history?.length ? "Tidak ada hasil" : "Belum ada riwayat"}</p>
                    </div>
                  ) : filteredHistory.map((h: any) => (
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
                        {role === "admin" && <TableHead className="w-10"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHistory.map((h: any, idx: number) => (
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
                          {role === "admin" && (
                            <TableCell>
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
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {filteredHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={role === "admin" ? 9 : 8} className="text-center text-muted-foreground py-10">{history?.length ? "Tidak ada hasil" : "Belum ada riwayat"}</TableCell>
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
