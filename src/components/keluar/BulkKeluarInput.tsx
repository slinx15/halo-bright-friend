import { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Send, PackageMinus, AlertTriangle, CheckCircle2, Trash2, Plus, CalendarIcon, ChevronDown, SlidersHorizontal, Store, FileText } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { deductFromStacks } from "@/lib/tumpukanUtils";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ProductWithDetails } from "@/hooks/useProducts";

export interface BulkKeluarItem {
  kode: string;
  qtyPesan: number;
  qtyKirim: number;
  hargaType: "normal" | "grosir" | "grosir2";
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
  tanggal?: Date;
  setTanggal?: (v: Date | undefined) => void;
}

export interface BulkKeluarInputHandle {
  handleOcrResult: (items: any[]) => void;
}

export const BulkKeluarInput = forwardRef<BulkKeluarInputHandle, BulkKeluarInputProps>(function BulkKeluarInput({ products, onSubmit, submitting, toko, setToko, catatan, setCatatan, tanggal, setTanggal }, ref) {
  const [items, setItems] = useState<BulkKeluarItem[]>([]);
  const isMobile = useIsMobile();
  const [metaOpen, setMetaOpen] = useState(false);
  const [hargaDialogOpen, setHargaDialogOpen] = useState(false);

  const findProduct = (kode: string) =>
    products.find((p) => p.kode.toUpperCase() === kode.toUpperCase());

  const resolveItem = (kode: string, partial: Partial<BulkKeluarItem> = {}): BulkKeluarItem => {
    const product = findProduct(kode);
    return {
      kode: product ? product.kode : kode.toUpperCase(),
      qtyPesan: partial.qtyPesan ?? 0,
      qtyKirim: partial.qtyKirim ?? 0,
      hargaType: (partial.hargaType as "normal" | "grosir" | "grosir2") ?? "normal",
      product,
      isValid: !!product,
    };
  };

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

  const getPrice = (item: BulkKeluarItem) => {
    const p = item.product?.prices;
    if (!p) return 0;
    if (item.hargaType === "grosir2") return p.harga_grosir2;
    if (item.hargaType === "grosir") return p.harga_grosir;
    return p.harga_normal;
  };

  const priceLabel = (prices: ProductWithDetails["prices"], type: string) => {
    if (!prices) return type === "grosir2" ? "Grosir 2" : type === "grosir" ? "Grosir" : "Normal";
    const val = type === "grosir2" ? prices.harga_grosir2 : type === "grosir" ? prices.harga_grosir : prices.harga_normal;
    const label = type === "grosir2" ? "Grosir 2" : type === "grosir" ? "Grosir" : "Normal";
    return `${label} - ${formatRupiah(val)}`;
  };

  const totalRevenue = submitItems.reduce((sum, item) => {
    return sum + getPrice(item) * item.qtyKirim;
  }, 0);

  const handleSubmit = async () => {
    await onSubmit(submitItems);
    setItems([]);
  };

  // Kategori counts for harga sekaligus
  const warnaItems = items.filter(i => i.isValid && !i.kode.toUpperCase().includes("WHT") && !i.kode.toUpperCase().includes("BLCK") && !i.kode.toUpperCase().includes("BLK"));
  const whtItems = items.filter(i => i.isValid && i.kode.toUpperCase().includes("WHT"));
  const blckItems = items.filter(i => i.isValid && (i.kode.toUpperCase().includes("BLCK") || i.kode.toUpperCase().includes("BLK")));

  const metaSummary = [toko, tanggal ? format(tanggal, "dd/MM", { locale: localeId }) : null, catatan].filter(Boolean).join(" · ");

  const renderCompactMobileCard = (item: BulkKeluarItem, idx: number) => {
    const stok = item.product?.stock?.jumlah ?? 0;
    const price = getPrice(item);
    const total = price * item.qtyKirim;
    const overStock = item.isValid && item.qtyKirim > stok;

    return (
      <div
        key={idx}
        className={cn(
          "rounded-xl border p-2.5 space-y-1.5",
          !item.isValid && item.kode
            ? "border-destructive/30 bg-destructive/5"
            : overStock
              ? "border-warning/30 bg-warning/5"
              : "border-border/50 bg-card"
        )}
      >
        {/* Row 1: Kode + Nama/Stok + Delete */}
        <div className="flex items-center gap-1.5">
          <Input
            className="h-9 text-sm font-mono flex-1 min-w-0"
            value={item.kode}
            onChange={(e) => updateItem(idx, "kode", e.target.value)}
            placeholder="Kode..."
            list="bulk-keluar-codes"
          />
          {item.isValid && (
            <span className={cn("text-[10px] font-semibold whitespace-nowrap", overStock ? "text-destructive" : "text-muted-foreground")}>
              Stok: {formatNumber(stok)}
            </span>
          )}
          <Button variant="ghost" size="icon" className="text-destructive shrink-0 h-8 w-8" onClick={() => removeItem(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {item.isValid && (
          <p className="text-[10px] text-muted-foreground truncate px-0.5">{item.product?.nama}</p>
        )}
        {!item.isValid && item.kode && (
          <p className="text-destructive text-[10px] font-medium px-0.5">✗ Tidak ditemukan</p>
        )}

        {/* Row 2: Pesan + Kirim */}
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[9px] font-semibold text-muted-foreground uppercase">Pesan</label>
            <Input
              type="text" inputMode="numeric"
              className="h-9 text-sm mt-0.5 touch-manipulation"
              value={item.qtyPesan === 0 ? "" : item.qtyPesan}
              onChange={(e) => updateItem(idx, "qtyPesan", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[9px] font-semibold text-muted-foreground uppercase">Kirim</label>
            <Input
              type="text" inputMode="numeric"
              className="h-9 text-sm mt-0.5 touch-manipulation"
              value={item.qtyKirim === 0 ? "" : item.qtyKirim}
              onChange={(e) => updateItem(idx, "qtyKirim", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Row 3: Harga + Total - lebih jelas */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <label className="text-[9px] font-semibold text-muted-foreground uppercase">Harga</label>
            <Select value={item.hargaType} onValueChange={(v) => updateItem(idx, "hargaType", v)}>
              <SelectTrigger className="h-9 text-xs mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">{priceLabel(item.product?.prices, "normal")}</SelectItem>
                <SelectItem value="grosir">{priceLabel(item.product?.prices, "grosir")}</SelectItem>
                {item.product?.prices?.harga_grosir2 ? (
                  <SelectItem value="grosir2">{priceLabel(item.product?.prices, "grosir2")}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="text-right pt-3">
            <span className="text-sm font-bold text-primary tabular-nums">
              {item.isValid && item.qtyKirim > 0 ? formatRupiah(total) : "-"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-destructive/5 to-transparent">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <PackageMinus className="h-4 w-4 text-destructive" />
          Input Cepat Barang Keluar
        </CardTitle>
      </CardHeader>
      <CardContent className={cn("space-y-3 pt-4", isMobile && submitItems.length > 0 && "pb-28")}>
        {/* ── Collapsible Metadata (mobile) / Normal (desktop) ── */}
        {isMobile ? (
          <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full rounded-xl border border-border/60 px-3 py-2.5 text-left min-h-[44px] bg-muted/30 active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2 min-w-0">
                  <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {metaSummary || "Toko, Tanggal, Catatan"}
                  </span>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", metaOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</label>
                <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Tanggal (opsional)</label>
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
                {tanggal && <button onClick={() => setTanggal?.(undefined)} className="text-[10px] text-primary mt-0.5 hover:underline">Reset ke hari ini</button>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</label>
                <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." className="rounded-lg mt-1" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Nama Toko / Pelanggan</label>
              <Input value={toko} onChange={(e) => setToko(e.target.value)} placeholder="Nama toko..." className="rounded-lg mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Tanggal (opsional)</label>
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
              {tanggal && <button onClick={() => setTanggal?.(undefined)} className="text-[10px] text-primary mt-0.5 hover:underline">Reset ke hari ini</button>}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</label>
              <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." className="rounded-lg mt-1" />
            </div>
          </div>
        )}

        {/* ── Set Harga Sekaligus: Popup (mobile) / Inline (desktop) ── */}
        {validItems.length > 0 && (
          isMobile ? (
            <Dialog open={hargaDialogOpen} onOpenChange={setHargaDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full rounded-xl min-h-[40px] gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-4 w-4" />
                  Set Harga Sekaligus
                  <Badge variant="secondary" className="text-[10px] ml-auto">{validItems.length} item</Badge>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <SlidersHorizontal className="h-4 w-4" />
                    Set Harga Sekaligus
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {warnaItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">🎨 Warna ({warnaItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        setItems(prev => prev.map(item => {
                          if (!item.isValid) return item;
                          const k = item.kode.toUpperCase();
                          if (k.includes("WHT") || k.includes("BLCK") || k.includes("BLK")) return item;
                          return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                        }));
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">{priceLabel(warnaItems[0]?.product?.prices, "normal")}</SelectItem>
                          <SelectItem value="grosir">{priceLabel(warnaItems[0]?.product?.prices, "grosir")}</SelectItem>
                          <SelectItem value="grosir2">{priceLabel(warnaItems[0]?.product?.prices, "grosir2")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {whtItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">⬜ WHT ({whtItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        setItems(prev => prev.map(item => {
                          if (!item.isValid || !item.kode.toUpperCase().includes("WHT")) return item;
                          return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                        }));
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">{priceLabel(whtItems[0]?.product?.prices, "normal")}</SelectItem>
                          <SelectItem value="grosir">{priceLabel(whtItems[0]?.product?.prices, "grosir")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {blckItems.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground font-medium">⬛ BLCK ({blckItems.length} item)</label>
                      <Select onValueChange={(v) => {
                        setItems(prev => prev.map(item => {
                          if (!item.isValid) return item;
                          const k = item.kode.toUpperCase();
                          if (!k.includes("BLCK") && !k.includes("BLK")) return item;
                          return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                        }));
                      }}>
                        <SelectTrigger className="h-11 text-sm mt-1"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">{priceLabel(blckItems[0]?.product?.prices, "normal")}</SelectItem>
                          <SelectItem value="grosir">{priceLabel(blckItems[0]?.product?.prices, "grosir")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="w-full rounded-xl" onClick={() => setHargaDialogOpen(false)}>Selesai</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <div className="bg-muted/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Set Harga Sekaligus</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {warnaItems.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">🎨 Warna ({warnaItems.length} item)</label>
                    <Select onValueChange={(v) => {
                      setItems(prev => prev.map(item => {
                        if (!item.isValid) return item;
                        const k = item.kode.toUpperCase();
                        if (k.includes("WHT") || k.includes("BLCK") || k.includes("BLK")) return item;
                        return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                      }));
                    }}>
                      <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="grosir">Grosir</SelectItem>
                        <SelectItem value="grosir2">Grosir 2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {whtItems.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">⬜ WHT ({whtItems.length} item)</label>
                    <Select onValueChange={(v) => {
                      setItems(prev => prev.map(item => {
                        if (!item.isValid || !item.kode.toUpperCase().includes("WHT")) return item;
                        return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                      }));
                    }}>
                      <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="grosir">Grosir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {blckItems.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">⬛ BLCK ({blckItems.length} item)</label>
                    <Select onValueChange={(v) => {
                      setItems(prev => prev.map(item => {
                        if (!item.isValid) return item;
                        const k = item.kode.toUpperCase();
                        if (!k.includes("BLCK") && !k.includes("BLK")) return item;
                        return { ...item, hargaType: v as "normal" | "grosir" | "grosir2" };
                      }));
                    }}>
                      <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue placeholder="Pilih harga..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="grosir">Grosir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* Items - Mobile: Compact Cards, Desktop: Table */}
        {items.length > 0 && (
          isMobile ? (
            <div className="space-y-2">
              {items.map((item, idx) => renderCompactMobileCard(item, idx))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-2 w-28">Kode</th>
                    <th className="text-left py-2 px-2">Nama</th>
                    <th className="text-right py-2 px-2 w-16">Stok</th>
                    <th className="text-left py-2 px-2 w-20">Pesan</th>
                    <th className="text-left py-2 px-2 w-20">Kirim</th>
                    <th className="text-left py-2 px-2 w-28">Harga</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const stok = item.product?.stock?.jumlah ?? 0;
                    const price = getPrice(item);
                    const total = price * item.qtyKirim;
                    const overStock = item.isValid && item.qtyKirim > stok;

                    return (
                      <tr key={idx} className={cn("border-b", !item.isValid && item.kode ? "bg-destructive/5" : overStock ? "bg-warning/5" : "")}>
                        <td className="py-2 px-2">
                          <Input className="h-8 text-sm font-mono" value={item.kode} onChange={(e) => updateItem(idx, "kode", e.target.value)} placeholder="Kode..." list="bulk-keluar-codes" />
                        </td>
                        <td className="py-2 px-2 text-sm">
                          {item.isValid ? <span className="text-muted-foreground">{item.product?.nama}</span> : item.kode ? <span className="text-destructive text-xs">Tidak ditemukan</span> : null}
                        </td>
                        <td className="py-2 px-2 text-right text-sm">
                          {item.isValid ? <span className={overStock ? "text-destructive font-semibold" : ""}>{formatNumber(stok)}</span> : "-"}
                        </td>
                        <td className="py-1 px-1">
                          <Input type="text" inputMode="numeric" className="h-10 text-sm w-20 min-w-[5rem]" value={item.qtyPesan === 0 ? "" : item.qtyPesan} onChange={(e) => updateItem(idx, "qtyPesan", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} placeholder="0" />
                        </td>
                        <td className="py-1 px-1">
                          <Input type="text" inputMode="numeric" className="h-10 text-sm w-20 min-w-[5rem]" value={item.qtyKirim === 0 ? "" : item.qtyKirim} onChange={(e) => updateItem(idx, "qtyKirim", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} placeholder="0" />
                        </td>
                        <td className="py-2 px-2">
                          <Select value={item.hargaType} onValueChange={(v) => updateItem(idx, "hargaType", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">{priceLabel(item.product?.prices, "normal")}</SelectItem>
                              <SelectItem value="grosir">{priceLabel(item.product?.prices, "grosir")}</SelectItem>
                              {item.product?.prices?.harga_grosir2 ? (
                                <SelectItem value="grosir2">{priceLabel(item.product?.prices, "grosir2")}</SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-2 text-right text-sm font-semibold">
                          {item.isValid && item.qtyKirim > 0 ? formatRupiah(total) : "-"}
                        </td>
                        <td className="py-2 px-2">
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        <datalist id="bulk-keluar-codes">
          {products?.map((p) => <option key={p.id} value={p.kode} />)}
        </datalist>

        <Button variant="outline" size="sm" onClick={addEmptyRow} className="w-full rounded-xl transition-all duration-150 active:scale-95 min-h-[44px]">
          <Plus className="h-4 w-4 mr-1" /> Tambah Baris
        </Button>

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

        {/* ── Sticky Submit (mobile) / Normal (desktop) ── */}
        {isMobile && submitItems.length > 0 ? (
          <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-3 pt-2 bg-background/95 backdrop-blur-md border-t border-border/50 safe-bottom">
            <div className="flex items-center justify-between mb-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {submitItems.length} item
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatNumber(submitItems.reduce((s, i) => s + i.qtyKirim, 0))} pcs
                </span>
              </div>
              <span className="font-bold text-primary">{formatRupiah(totalRevenue)}</span>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-destructive hover:bg-destructive/90"
            >
              <Send className="h-5 w-5 mr-2" />
              {submitting ? "Menyimpan..." : `Simpan ${submitItems.length} Barang Keluar`}
            </Button>
          </div>
        ) : (
          <>
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
              className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-destructive hover:bg-destructive/90"
            >
              <Send className="h-5 w-5 mr-2" />
              {submitting ? "Menyimpan..." : `Simpan ${submitItems.length} Barang Keluar`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});
