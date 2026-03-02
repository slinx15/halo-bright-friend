import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Camera, Loader2, Send, Sparkles, FileText, Trash2,
  CheckCircle2, AlertTriangle, CalendarIcon, X
} from "lucide-react";
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
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ReviewItem[]>([]);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
  const [orderDate, setOrderDate] = useState<Date | undefined>(undefined);
  const [targetDays, setTargetDays] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const { toast } = useToast();
  const { data: products } = useProducts();
  const { data: aliases } = useProductAliases();

  const handleParse = useCallback(() => {
    if (!inputText.trim()) {
      toast({ title: "Kosong", description: "Tulis daftar produk dulu", variant: "destructive" });
      return;
    }
    const items = parseInput(inputText, products || [], aliases || []);
    if (items.length === 0) {
      toast({ title: "Format salah", description: "Tulis format: KODE QTY per baris\nContoh:\nABC-123 50\nDEF-456 25", variant: "destructive" });
      return;
    }
    setParsedItems(items);
    setShowParsed(true);
    setReviewResult(null);
  }, [inputText, products, aliases, toast]);

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

      const ocrText = ocrItems.map((i: any) => `${i.kode} ${i.qty || i.qty_pesan || 0}`).join("\n");
      setInputText(prev => prev ? prev + "\n" + ocrText : ocrText);
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
    setInputText("");
    setParsedItems([]);
    setReviewResult(null);
    setShowParsed(false);
    setOrderDate(undefined);
    setTargetDays("");
  };

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Review AI</h3>
              <p className="text-xs text-muted-foreground">Kirim daftar pesanan kamu, AI akan review dan kasih masukan</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daftar Pesanan</label>
            <Textarea
              placeholder={"Tulis kode + qty per baris:\nABC-123 50\nDEF-456 25\nGHI-789 100\n\nAtau foto catatan kamu →"}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="min-h-[140px] font-mono text-sm"
              disabled={isLoading}
            />
          </div>

          {/* Optional Date Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tanggal Pesan ke Supplier <span className="normal-case font-normal">(opsional)</span>
            </label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal flex-1 max-w-[260px]",
                      !orderDate && "text-muted-foreground"
                    )}
                    disabled={isLoading}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
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
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOrderDate(undefined)}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {orderDate && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                AI akan analisa penjualan setelah {format(orderDate, "d MMM", { locale: idLocale })} & kasih saran pesanan tambahan
              </p>
            )}
          </div>

          {/* Target Days Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Target Stok untuk Berapa Hari? <span className="normal-case font-normal">(opsional, default 7 hari)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="30"
                placeholder="7"
                value={targetDays}
                onChange={e => setTargetDays(e.target.value)}
                className="w-24 h-9 rounded-lg border border-input bg-background px-3 text-sm font-bold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
              />
              <span className="text-sm text-muted-foreground">hari</span>
            </div>
            {targetDays && parseInt(targetDays) > 0 && (
              <p className="text-[11px] text-muted-foreground">
                AI akan hitung rekomendasi qty untuk kebutuhan <strong>{targetDays} hari</strong> ke depan
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={ocrLoading || isLoading}>
              {ocrLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
              {ocrLoading ? "Membaca..." : "Foto Catatan"}
            </Button>
            <Button size="sm" onClick={handleParse} disabled={!inputText.trim() || isLoading}>
              <FileText className="h-4 w-4 mr-1.5" />
              Cek Daftar
            </Button>
            {(parsedItems.length > 0 || reviewResult) && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={isLoading}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parsed Items Preview */}
      {showParsed && parsedItems.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden animate-fade-in" style={{ animationFillMode: "both" }}>
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
                className="w-full mt-3 font-bold"
                onClick={handleReview}
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

      {/* AI Result Cards */}
      {reviewResult && <ReviewResultCards result={reviewResult} />}
    </div>
  );
}
