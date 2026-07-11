import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Camera, Loader2, Send, Sparkles, FileText, Trash2,
  CheckCircle2, AlertTriangle, CalendarIcon, X, Package, Plus, Truck, Clock
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";
import { useProductAliases, type ProductAlias } from "@/hooks/useProductAliases";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ReviewResultCards, type ReviewResult } from "./ReviewResultCards";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabaseEnv";
import type { BudgetEstimateSummary } from "@/lib/analisaBudget";

interface ReviewItem {
  kode: string;
  qty: number;
  isValid: boolean;
  productName?: string;
}

interface ReviewOcrItem {
  kode?: string;
  qty?: number;
  qty_pesan?: number;
}

interface ReviewAIProps {
  budgetEstimates?: BudgetEstimateSummary[];
}

function parseInput(text: string, products: ProductWithDetails[], aliases: ProductAlias[]): ReviewItem[] {
  const lines = text.split("\n").map(l => l.trim());
  const items: ReviewItem[] = [];

  // Category suffix aliases for non-2 Ons products
  const CATEGORY_ALIASES: Record<string, string> = {
    "18G": "18 Gram", "18GRAM": "18 Gram", "18GR": "18 Gram",
    "3OZ": "3 Ons", "3ONS": "3 Ons", "3 OZ": "3 Ons",
    "5OZ": "5 Ons", "5ONS": "5 Ons", "5 OZ": "5 Ons",
    "8OZ": "8 Ons", "8ONS": "8 Ons", "8 OZ": "8 Ons",
  };

  // Header detection regex: matches lines like "2 on", "3 ons", "5 on", "18 gram", "B obras 2 on"
  const HEADER_PATTERNS: { regex: RegExp; kategori: string }[] = [
    { regex: /\b18\s*g(?:r(?:am)?)?/i, kategori: "18 Gram" },
    { regex: /\b8\s*o(?:n(?:s)?|z)/i, kategori: "8 Ons" },
    { regex: /\b5\s*o(?:n(?:s)?|z)/i, kategori: "5 Ons" },
    { regex: /\b3\s*o(?:n(?:s)?|z)/i, kategori: "3 Ons" },
    { regex: /\b2\s*o(?:n(?:s)?|z)/i, kategori: "2 Ons" },
  ];

  // Name-to-kode mapping for common product names in non-2 Ons categories
  const NAME_TO_KODE: Record<string, string> = {
    "PUTIH": "WHT", "HITAM": "BLCK", "WHITE": "WHT", "BLACK": "BLCK",
  };

  let activeKategori: string | null = null; // null = default (2 Ons)

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    
    // Skip empty lines and separators
    if (!line || /^[-=_]+$/.test(line)) continue;

    // Check if this line is a category header
    let isHeader = false;
    for (const { regex, kategori } of HEADER_PATTERNS) {
      if (regex.test(line)) {
        // Only treat as header if it does NOT look like a product line (no qty pattern)
        const hasQty = /[\s.:-=]+\d+\s*(?:pcs|pc|buah|pack)?$/i.test(line);
        if (!hasQty) {
          activeKategori = kategori;
          isHeader = true;
          break;
        }
      }
    }
    if (isHeader) continue;

    // Try to extract: everything before the last number = kode, last number = qty
    const matchGeneral = line.match(/^(.+?)[.\s]*[\s=:-]+\s*(\d+)\s*(?:pcs|pc|buah|pack|pak)?$/i);
    const matchQtyFirst = line.match(/^(\d+)\s*(?:pcs|pc|buah|pack|pak)?\s+([A-Za-z][A-Za-z0-9\-/\s]*)\s*$/i);

    const match = matchGeneral || matchQtyFirst;
    if (!match) continue;

    let kode: string, qty: number;
    if (matchQtyFirst && !matchGeneral) {
      qty = parseInt(match[1]);
      kode = match[2].toUpperCase().trim();
    } else {
      kode = match[1].toUpperCase().trim();
      qty = parseInt(match[2]);
    }
    
    // Clean kode: remove trailing dots, spaces, dashes
    kode = kode.replace(/[.\s-]+$/, "");

    if (qty <= 0) continue;

    // If active kategori is non-2 Ons, append suffix to kode
    if (activeKategori && activeKategori !== "2 Ons") {
      // Map common names like PUTIH -> WHT
      const mappedKode = NAME_TO_KODE[kode] || kode;
      kode = mappedKode + " " + activeKategori;
    }

    const findProduct = (k: string) => {
      const kUpper = k.toUpperCase();
      // 1. Direct match
      let found = products?.find(p => p.kode.toUpperCase() === kUpper);
      if (found) return found;
      
      // 2. Strip leading zeros
      const stripped = kUpper.replace(/^0+/, "");
      if (stripped !== kUpper) {
        found = products?.find(p => p.kode.toUpperCase() === stripped);
        if (found) return found;
      }
      found = products?.find(p => p.kode.toUpperCase().replace(/^0+/, "") === stripped);
      if (found) return found;
      
      // 3. Try category suffix expansion (e.g., "BLCK 5OZ" -> "BLCK 5 Ons")
      for (const [alias, suffix] of Object.entries(CATEGORY_ALIASES)) {
        if (kUpper.endsWith(alias) || kUpper.endsWith(alias.replace(" ", ""))) {
          const baseKode = kUpper.replace(new RegExp(alias.replace(" ", "\\s*") + "$"), "").trim();
          const fullKode = baseKode + " " + suffix;
          found = products?.find(p => p.kode.toUpperCase() === fullKode.toUpperCase());
          if (found) return found;
          const strippedBase = baseKode.replace(/^0+/, "");
          const fullKode2 = strippedBase + " " + suffix;
          found = products?.find(p => p.kode.toUpperCase() === fullKode2.toUpperCase());
          if (found) return found;
        }
      }
      
      // 4. Alias lookup
      if (aliases) {
        const aliasEntry = aliases.find(a => a.alias.toUpperCase() === kUpper || a.alias.toUpperCase() === stripped);
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

  // Deduplicate: merge items with same kode by summing qty
  const merged = new Map<string, ReviewItem>();
  for (const item of items) {
    const key = item.kode.toUpperCase();
    const existing = merged.get(key);
    if (existing) {
      existing.qty += item.qty;
    } else {
      merged.set(key, { ...item });
    }
  }

  return Array.from(merged.values());
}

export default function ReviewAI({ budgetEstimates = [] }: ReviewAIProps) {
  const [expandParsed, setExpandParsed] = useState(false);
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ReviewItem[]>([]);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
  const [orderDate, setOrderDate] = useState<Date | undefined>(undefined);
  const [targetDays, setTargetDays] = useState<string>("");
  const [alreadySent, setAlreadySent] = useState(false);
  const [showSentDialog, setShowSentDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const { toast } = useToast();
  const { data: products } = useProducts();
  const { data: aliases } = useProductAliases();

  const handleParse = useCallback(() => {
    if (!inputText.trim()) {
      toast({ title: "Kosong", description: "Tulis daftar pesanan dulu", variant: "destructive" });
      return;
    }
    const items = parseInput(inputText, products || [], aliases || []);
    if (items.length === 0) {
      toast({ title: "Format salah", description: "Tulis: KODE QTY per baris\nContoh: 8842 50", variant: "destructive" });
      return;
    }
    setParsedItems(items);
    setShowParsed(true);
    setReviewResult(null);
  }, [inputText, products, aliases, toast]);

  const handleReview = useCallback(async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "Tidak ada item valid", description: "Perbaiki kode produk yang salah dulu", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setReviewResult(null);

    try {
      const body: {
        items: Array<{ kode: string; qty: number }>;
        target_days?: number;
        already_sent?: boolean;
        mode?: "topup";
        ordered_at?: string;
        baseline_items?: Array<{ kode: string; qty: number }>;
      } = { items: validItems.map(i => ({ kode: i.kode, qty: i.qty })) };

      // Always anchor to Ringkasan baseline. Default to 4-day cycle (= Analisa default)
      const effectiveTargetDays = targetDays && parseInt(targetDays) > 0 ? parseInt(targetDays) : 4;
      body.target_days = effectiveTargetDays;
      const baseline = budgetEstimates.find((estimate) => estimate.days === effectiveTargetDays);
      if (baseline && baseline.details.length > 0) {
        body.baseline_items = baseline.details.map((detail) => ({
          kode: detail.kode,
          qty: detail.qty,
        }));
      }
      body.already_sent = alreadySent;
      if (orderDate) {
        body.mode = "topup";
        body.ordered_at = orderDate.toISOString();
      }

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/review-restock`,
        {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setReviewResult(data as ReviewResult);
    } catch (err: unknown) {
      console.error("Review error:", err);
      toast({ title: "Error", description: getErrorMessage(err, "Gagal review"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [parsedItems, orderDate, targetDays, alreadySent, toast, budgetEstimates]);

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

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ocr-nota`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ image_base64: base64, mode: "review", master_codes: products?.map(p => p.kode) || [] }),
      });

      if (!resp.ok) throw new Error(`OCR failed: ${resp.status}`);
      const data = await resp.json();
      const ocrItems = (data?.items ?? []) as ReviewOcrItem[];

      if (ocrItems.length === 0) {
        toast({ title: "OCR", description: "Tidak bisa membaca data dari foto", variant: "destructive" });
        return;
      }

      const ocrText = ocrItems.map((item) => `${item.kode} ${item.qty || item.qty_pesan || 0}`).join("\n");
      setInputText(prev => prev ? prev.trim() + "\n" + ocrText : ocrText);
      toast({ title: "Foto Terbaca!", description: `${ocrItems.length} item berhasil dibaca` });
    } catch (err: unknown) {
      toast({ title: "Error OCR", description: getErrorMessage(err), variant: "destructive" });
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
    setAlreadySent(false);
    setShowSettings(false);
  };

  const lineCount = inputText.split("\n").filter(l => l.trim()).length;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 sm:items-center">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-primary/20 to-blue-500/10 shadow-sm">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-xl font-extrabold tracking-tight leading-tight">Review AI</h3>
            <p className="text-muted-foreground text-sm font-medium">Tulis daftar belanja, AI kasih masukan</p>
          </div>
        </div>
      </div>

      {/* ── Input Card — Simple Textarea ── */}
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Daftar Pesanan
              {lineCount > 0 && <Badge variant="secondary" className="text-xs font-bold">{lineCount}</Badge>}
            </CardTitle>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                ref={fileRef}
                id="review-ai-photo"
                name="review-ai-photo"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = ""; }}
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="h-11 w-full gap-2 rounded-xl px-4 text-sm font-bold transition-all duration-150 active:scale-95 sm:w-auto" 
                onClick={() => fileRef.current?.click()} 
                disabled={ocrLoading || isLoading}
              >
                {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {ocrLoading ? "Membaca..." : "Foto"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          {/* Textarea */}
          <div className="relative">
            <textarea
              id="review-ai-input"
              name="review-ai-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={"Tulis kode & jumlah, satu baris satu item:\n\n8842 50\nR484 50\n2135 25"}
              rows={6}
              className="w-full rounded-xl border-2 border-border/60 bg-muted/20 px-4 py-3 text-base font-mono font-bold leading-relaxed placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              disabled={isLoading}
            />
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-muted/60 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Optional settings toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Package className="h-3.5 w-3.5" />
            {showSettings ? "Sembunyikan opsi lanjutan" : "Opsi lanjutan (opsional)"}
          </button>

          {showSettings && (
            <div className="space-y-3 animate-fade-in">
              {/* Target Days */}
              <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Override Target Hari
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="review-ai-target-days"
                    name="review-ai-target-days"
                    type="number"
                    min="1"
                    max="30"
                    placeholder="7"
                    value={targetDays}
                    onChange={e => setTargetDays(e.target.value)}
                    className="w-20 h-10 rounded-xl border border-input bg-background px-3 text-base font-bold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-muted-foreground">hari</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Kosongkan agar Review AI ikut rumus Analisa utama.
                </p>
              </div>

              {/* Date Picker */}
              <div className="rounded-xl bg-muted/30 p-3.5 space-y-2">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Tanggal Pesan (opsional)
                </label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "justify-start text-left font-normal flex-1 rounded-xl h-10 bg-background text-sm",
                          !orderDate && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
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
                      className="h-10 w-10 shrink-0 rounded-xl"
                      onClick={() => setOrderDate(undefined)}
                      disabled={isLoading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button 
              className="h-14 w-full rounded-xl text-lg font-bold transition-all duration-150 active:scale-[0.97] shadow-md hover:shadow-lg sm:flex-1" 
              onClick={handleParse} 
              disabled={lineCount === 0 || isLoading}
            >
              <FileText className="h-5 w-5 mr-2" />
              Cek Daftar
            </Button>
            {(parsedItems.length > 0 || reviewResult) && (
              <Button variant="ghost" size="icon" className="h-14 w-full rounded-xl shrink-0 sm:w-14" onClick={handleReset} disabled={isLoading}>
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Parsed Result + Review Button ── */}
      {showParsed && parsedItems.length > 0 && (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            className="h-12 w-full gap-2 rounded-xl px-4 text-sm font-bold transition-all duration-150 active:scale-95 sm:w-auto"
            onClick={() => setExpandParsed(true)}
          >
            <FileText className="h-4 w-4" />
            {validCount} item
            {invalidCount > 0 && <span className="text-destructive font-bold">({invalidCount} salah)</span>}
          </Button>
          <Button
            className="h-14 w-full rounded-xl text-lg font-bold transition-all duration-150 active:scale-[0.97] shadow-md hover:shadow-lg sm:flex-1"
            onClick={() => setShowSentDialog(true)}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Menganalisa...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                <span>Review AI</span>
              </div>
            )}
          </Button>
        </div>
      )}

      {/* Parsed Items Dialog */}
      <Dialog open={expandParsed} onOpenChange={setExpandParsed}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5 text-primary" />
              Daftar Item
            </DialogTitle>
            <DialogDescription className="flex gap-2 mt-1">
              <Badge variant="secondary" className="bg-success/10 text-success text-xs font-bold">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" /> {invalidCount} salah
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
            {parsedItems.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-base ${
                  item.isValid ? "bg-card border border-border/60" : "bg-destructive/5 border border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-base">{item.kode}</span>
                  {item.isValid ? (
                    <span className="text-sm text-muted-foreground truncate">{item.productName}</span>
                  ) : (
                    <span className="text-sm text-destructive font-bold">Salah</span>
                  )}
                </div>
                <span className="font-bold text-base tabular-nums ml-2">{item.qty}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sent Status Dialog */}
      <Dialog open={showSentDialog} onOpenChange={setShowSentDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-center text-xl font-bold">Pesanan sudah dikirim?</DialogTitle>
            <DialogDescription className="text-center text-base text-muted-foreground">
              Supaya AI kasih saran yang tepat
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
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all active:scale-95 group"
            >
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Clock className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-bold text-base">Belum</p>
                <p className="text-sm text-muted-foreground">Masih rencana</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setAlreadySent(true);
                setShowSentDialog(false);
                handleReview();
              }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all active:scale-95 group"
            >
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Truck className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-bold text-base">Sudah</p>
                <p className="text-sm text-muted-foreground">Sudah dikirim</p>
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
