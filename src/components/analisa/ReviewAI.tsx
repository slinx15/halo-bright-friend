import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Camera, Loader2, Send, Sparkles, FileText, Trash2,
  CheckCircle2, AlertTriangle, CalendarIcon, X, Package, Plus, Minus, Truck, Clock
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useProductAliases } from "@/hooks/useProductAliases";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ReviewResultCards, type ReviewResult } from "./ReviewResultCards";

interface ReviewItem {
  kode: string;
  qty: number;
  isValid: boolean;
  productName?: string;
}

interface InputRow {
  kode: string;
  qty: string;
}

function parseInput(text: string, products: any[], aliases: any[]): ReviewItem[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: ReviewItem[] = [];

  for (const line of lines) {
    // Pattern 1: KODE QTY (e.g., "110 25", "ABC-123 50")
    const matchKodeFirst = line.match(/^([A-Za-z0-9\-\/\.]+)\s*[=\-:\s]+\s*(\d+)\s*(?:pcs|pc|buah)?$/i);
    // Pattern 2: QTY KODE (e.g., "50 ABC-123") — only when second part has letters
    const matchQtyFirst = line.match(/^(\d+)\s*(?:pcs|pc|buah)?\s+([A-Za-z][A-Za-z0-9\-\/\.]*)\s*$/i);

    const match = matchKodeFirst || matchQtyFirst;
    if (!match) continue;

    let kode: string, qty: number;
    if (matchQtyFirst && !matchKodeFirst) {
      // Only flip when explicitly QTY first + alpha KODE
      qty = parseInt(match[1]);
      kode = match[2].toUpperCase().trim();
    } else {
      // Default: first value is KODE, second is QTY
      kode = match[1].toUpperCase().trim();
      qty = parseInt(match[2]);
    }

    if (qty <= 0) continue;

    const findProduct = (k: string) => {
      let found = products?.find(p => p.kode.toUpperCase() === k);
      if (found) return found;
      const stripped = k.replace(/^0+/, "");
      if (stripped !== k) {
        found = products?.find(p => p.kode.toUpperCase() === stripped);
        if (found) return found;
      }
      found = products?.find(p => p.kode.toUpperCase().replace(/^0+/, "") === stripped);
      if (found) return found;
      if (aliases) {
        const aliasEntry = aliases.find(a => a.alias.toUpperCase() === k || a.alias.toUpperCase() === stripped);
        if (aliasEntry) return products?.find(p => p.id === aliasEntry.product_id);
      }
      return null;
    };

    const product = findProduct(kode);
    items.push({
      kode: product ? product.kode : kode,
      qty,
      isValid: !!product,
      productName: product?.nama,
    });
  }

  return items;
}

export default function ReviewAI() {
  const [rows, setRows] = useState<InputRow[]>([{ kode: "", qty: "" }]);
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ReviewItem[]>([]);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
  const [orderDate, setOrderDate] = useState<Date | undefined>(undefined);
  const [targetDays, setTargetDays] = useState<string>("");
  const [alreadySent, setAlreadySent] = useState(false);
  const [showSentDialog, setShowSentDialog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const { toast } = useToast();
  const { data: products } = useProducts();
  const { data: aliases } = useProductAliases();

  const updateRow = (index: number, field: keyof InputRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, { kode: "", qty: "" }]);

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handlePasteRows = (e: React.ClipboardEvent, index: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return; // single value, let default handle
    e.preventDefault();
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const newRows: InputRow[] = lines.map(line => {
      // Try tab-separated first, then space/dash/colon
      const parts = line.split(/[\t]/).length > 1 ? line.split(/[\t]/) : line.split(/[\s=\-:]+/);
      if (parts.length >= 2) {
        const first = parts[0].trim();
        const second = parts[1].trim();
        // Detect which is kode and which is qty
        if (/^\d+$/.test(first) && /[A-Za-z]/.test(second)) {
          return { kode: second.toUpperCase(), qty: first };
        }
        return { kode: first.toUpperCase(), qty: second.replace(/[^\d]/g, "") };
      }
      return { kode: parts[0]?.toUpperCase() || "", qty: "" };
    });
    setRows(prev => {
      const before = prev.slice(0, index).filter(r => r.kode.trim() || r.qty.trim());
      const after = prev.slice(index + 1).filter(r => r.kode.trim() || r.qty.trim());
      const merged = [...before, ...newRows, ...after];
      return merged.length > 0 ? merged : [{ kode: "", qty: "" }];
    });
    toast({ title: "Paste berhasil", description: `${newRows.length} baris ditambahkan` });
  };

  // Build text from rows for parsing
  const rowsToText = () => rows.filter(r => r.kode.trim() && r.qty.trim()).map(r => `${r.kode} ${r.qty}`).join("\n");

  const handleParse = useCallback(() => {
    const text = rowsToText();
    if (!text.trim()) {
      toast({ title: "Kosong", description: "Isi kode dan qty dulu", variant: "destructive" });
      return;
    }
    const items = parseInput(text, products || [], aliases || []);
    if (items.length === 0) {
      toast({ title: "Format salah", description: "Pastikan kode dan qty sudah diisi", variant: "destructive" });
      return;
    }
    setParsedItems(items);
    setShowParsed(true);
    setReviewResult(null);
  }, [rows, products, aliases, toast]);

  const handleReview = useCallback(async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "Tidak ada item valid", description: "Perbaiki kode produk yang merah dulu", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setReviewResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const body: any = { items: validItems.map(i => ({ kode: i.kode, qty: i.qty })) };
      if (targetDays && parseInt(targetDays) > 0) {
        body.target_days = parseInt(targetDays);
      }
      body.already_sent = alreadySent;
      if (orderDate) {
        body.mode = "topup";
        body.ordered_at = orderDate.toISOString();
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-restock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setReviewResult(data as ReviewResult);
    } catch (err: any) {
      console.error("Review error:", err);
      toast({ title: "Error", description: err.message || "Gagal review", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [parsedItems, orderDate, toast]);

  // OCR handler
  const handleOcrFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Error", description: "File harus gambar", variant: "destructive" }); return; }
    setOcrLoading(true);
    try {
      const img = new Image();
      const base64Promise = new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) { const s = MAX / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      const base64 = await base64Promise;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ image_base64: base64, mode: "review", master_codes: products?.map(p => p.kode) || [] }),
      });

      if (!resp.ok) throw new Error(`OCR failed: ${resp.status}`);
      const data = await resp.json();
      const ocrItems = data?.items || [];

      if (ocrItems.length === 0) {
        toast({ title: "OCR", description: "Tidak bisa membaca data dari foto", variant: "destructive" });
        return;
      }

      const newRows: InputRow[] = ocrItems.map((i: any) => ({ kode: String(i.kode || ""), qty: String(i.qty || i.qty_pesan || 0) }));
      setRows(prev => {
        const existing = prev.filter(r => r.kode.trim() || r.qty.trim());
        return existing.length > 0 ? [...existing, ...newRows] : newRows;
      });
      toast({ title: "OCR Berhasil", description: `${ocrItems.length} item terbaca dari foto` });
    } catch (err: any) {
      toast({ title: "Error OCR", description: err.message, variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const validCount = parsedItems.filter(i => i.isValid).length;
  const invalidCount = parsedItems.filter(i => !i.isValid).length;

  const handleReset = () => {
    setRows([{ kode: "", qty: "" }]);
    setInputText("");
    setParsedItems([]);
    setReviewResult(null);
    setShowParsed(false);
    setOrderDate(undefined);
    setTargetDays("");
    setAlreadySent(false);
  };

  const filledRows = rows.filter(r => r.kode.trim() || r.qty.trim()).length;

  return (
    <div className="space-y-4">
      {/* ── Premium Header (matches other pages) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-blue-500/10 shadow-sm">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-xl font-extrabold tracking-tight leading-tight">Review AI</h3>
            <p className="text-muted-foreground text-xs font-medium">Kirim daftar pesanan, AI kasih masukan</p>
          </div>
        </div>
      </div>

      {/* Input Card */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Daftar Pesanan {filledRows > 0 && <span className="text-primary text-sm font-normal">({filledRows})</span>}
            </CardTitle>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = ""; }} />
              <Button variant="outline" size="sm" className="rounded-xl font-semibold native-press h-9" onClick={() => fileRef.current?.click()} disabled={ocrLoading || isLoading}>
                {ocrLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
                {ocrLoading ? "Membaca..." : "Foto Catatan"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
              <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_36px] gap-0 px-3 py-2 bg-muted/40 border-b border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Kode</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Qty</span>
                  <span></span>
                </div>
                {/* Rows */}
                <div className="divide-y divide-border/30 max-h-[280px] overflow-y-auto">
                  {rows.map((row, i) => {
                    const product = row.kode.trim() ? (products || []).find(p => p.kode.toUpperCase() === row.kode.toUpperCase() || p.kode.toUpperCase().replace(/^0+/, "") === row.kode.toUpperCase().replace(/^0+/, "")) : null;
                    const hasInput = row.kode.trim().length > 0;
                    const isInvalid = hasInput && !product;
                    return (
                      <div key={i} className={`grid grid-cols-[1fr_80px_36px] gap-0 items-center ${isInvalid ? "bg-destructive/5" : ""}`}>
                        <div className="relative">
                          <input
                            type="text"
                            value={row.kode}
                            onChange={e => updateRow(i, "kode", e.target.value.toUpperCase())}
                            onPaste={e => handlePasteRows(e, i)}
                            placeholder={i === 0 ? "Kode produk (bisa paste banyak baris)" : "Kode produk"}
                            className="w-full h-10 px-3 bg-transparent text-sm font-mono font-bold placeholder:text-muted-foreground/40 placeholder:font-normal focus:outline-none focus:bg-primary/5 transition-colors"
                            disabled={isLoading}
                          />
                          {product && (
                            <span className="absolute bottom-0.5 left-3 text-[9px] text-muted-foreground truncate max-w-[150px]">{product.nama}</span>
                          )}
                          {isInvalid && (
                            <span className="absolute bottom-0.5 left-3 text-[9px] text-destructive">Tidak dikenal</span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={row.qty}
                          onChange={e => updateRow(i, "qty", e.target.value)}
                          placeholder="0"
                          className="w-full h-10 px-2 bg-transparent text-sm font-bold tabular-nums text-center placeholder:text-muted-foreground/40 focus:outline-none focus:bg-primary/5 transition-colors border-l border-border/30"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="flex items-center justify-center h-10 text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-30"
                          disabled={isLoading || rows.length <= 1}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Add row button */}
                <button
                  type="button"
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors border-t border-border/40"
                  disabled={isLoading}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Baris
                </button>
              </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-1 gap-3">
              {/* Date Picker */}
              <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <CalendarIcon className="h-3 w-3" />
                  Tanggal Pesan ke Supplier
                  <span className="normal-case font-normal text-muted-foreground/70">(opsional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "justify-start text-left font-normal flex-1 rounded-lg h-9 bg-background",
                          !orderDate && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        <CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0" />
                        {orderDate
                          ? format(orderDate, "EEEE, d MMMM yyyy", { locale: idLocale })
                          : "Pilih tanggal..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={orderDate}
                        onSelect={setOrderDate}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {orderDate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg"
                      onClick={() => setOrderDate(undefined)}
                      disabled={isLoading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {orderDate && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>AI akan analisa penjualan setelah {format(orderDate, "d MMM", { locale: idLocale })} & kasih saran tambahan</span>
                  </div>
                )}
              </div>

              {/* Target Days + Already Sent row */}
              {/* Target Days */}
              <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Package className="h-3 w-3" />
                  Target Hari
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    placeholder="7"
                    value={targetDays}
                    onChange={e => setTargetDays(e.target.value)}
                    className="w-16 h-9 rounded-lg border border-input bg-background px-2 text-sm font-bold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isLoading}
                  />
                  <span className="text-xs text-muted-foreground">hari</span>
                </div>
                {targetDays && parseInt(targetDays) > 0 && (
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Hitung untuk <strong>{targetDays} hari</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button className="flex-1 h-11 rounded-xl font-bold shadow-premium native-press" onClick={handleParse} disabled={filledRows === 0 || isLoading}>
                <FileText className="h-4 w-4 mr-2" />
                Cek Daftar
              </Button>
              {(parsedItems.length > 0 || reviewResult) && (
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl shrink-0" onClick={handleReset} disabled={isLoading}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
        </CardContent>
      </Card>

      {/* Parsed Items Preview */}
      {showParsed && parsedItems.length > 0 && (
        <Card className="card-premium overflow-hidden animate-fade-in" style={{ animationFillMode: "both" }}>
          <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Daftar Item</span>
            </div>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-0.5" /> {invalidCount} unknown
                </Badge>
              )}
            </div>
          </div>
          <CardContent className="p-3">
            <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
              {parsedItems.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    item.isValid ? "bg-card border border-border/60" : "bg-destructive/5 border border-destructive/20"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold">{item.kode}</span>
                    {item.isValid ? (
                      <span className="text-xs text-muted-foreground truncate">{item.productName}</span>
                    ) : (
                      <span className="text-xs text-destructive">Tidak dikenal</span>
                    )}
                  </div>
                  <span className="font-bold text-sm tabular-nums ml-2">{item.qty} pcs</span>
                </div>
              ))}
            </div>

            {validCount > 0 && (
              <Button
                className="w-full mt-3 font-bold shadow-premium native-press"
                onClick={() => setShowSentDialog(true)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI sedang menganalisa...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {orderDate
                      ? `Review + Analisa Tambahan (${validCount} item)`
                      : `Review dengan AI (${validCount} item)`}
                  </div>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sent Status Dialog */}
      <Dialog open={showSentDialog} onOpenChange={setShowSentDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-center text-lg">Pesanan ini sudah dikirim?</DialogTitle>
            <DialogDescription className="text-center text-sm text-muted-foreground">
              AI butuh tahu status pengiriman untuk kasih saran yang tepat
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 pt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setAlreadySent(false);
                setShowSentDialog(false);
                handleReview();
              }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Clock className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm">Belum</p>
                <p className="text-[11px] text-muted-foreground">Masih rencana</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setAlreadySent(true);
                setShowSentDialog(false);
                handleReview();
              }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Truck className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm">Sudah</p>
                <p className="text-[11px] text-muted-foreground">Sudah dikirim</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Result Cards */}
      {reviewResult && <ReviewResultCards result={reviewResult} alreadySent={alreadySent} />}
    </div>
  );
}
