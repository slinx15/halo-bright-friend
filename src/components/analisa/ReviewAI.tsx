import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Loader2, Send, Sparkles, FileText, Trash2,
  CheckCircle2, AlertTriangle, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useProductAliases } from "@/hooks/useProductAliases";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

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
    // Patterns: "KODE 50", "KODE=50", "KODE - 50", "KODE  50pcs", "50 KODE"
    const match = line.match(/^([A-Za-z0-9\-\/\.]+)\s*[=\-:\s]+\s*(\d+)\s*(?:pcs|pc|buah)?$/i)
      || line.match(/^(\d+)\s*(?:pcs|pc|buah)?\s+([A-Za-z0-9\-\/\.]+)$/i);

    if (!match) continue;

    let kode: string, qty: number;
    if (/^\d+$/.test(match[1])) {
      qty = parseInt(match[1]);
      kode = match[2].toUpperCase().trim();
    } else {
      kode = match[1].toUpperCase().trim();
      qty = parseInt(match[2]);
    }

    if (qty <= 0) continue;

    // Find product
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
  const [aiResult, setAiResult] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
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
    setAiResult("");
  }, [inputText, products, aliases, toast]);

  const handleReview = useCallback(async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "Tidak ada item valid", description: "Perbaiki kode produk yang merah dulu", variant: "destructive" });
      return;
    }

    setIsStreaming(true);
    setAiResult("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-restock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ items: validItems.map(i => ({ kode: i.kode, qty: i.qty })) }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setAiResult(fullText);
            }
          } catch { /* partial JSON, skip */ }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { fullText += content; setAiResult(fullText); }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      console.error("Review error:", err);
      toast({ title: "Error", description: err.message || "Gagal review", variant: "destructive" });
    } finally {
      setIsStreaming(false);
    }
  }, [parsedItems, toast]);

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

      // Convert OCR items to text format and append
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
    setAiResult("");
    setShowParsed(false);
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
              disabled={isStreaming}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={ocrLoading || isStreaming}>
              {ocrLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
              {ocrLoading ? "Membaca..." : "Foto Catatan"}
            </Button>
            <Button size="sm" onClick={handleParse} disabled={!inputText.trim() || isStreaming}>
              <FileText className="h-4 w-4 mr-1.5" />
              Cek Daftar
            </Button>
            {(parsedItems.length > 0 || aiResult) && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={isStreaming}>
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
                disabled={isStreaming}
              >
                {isStreaming ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI sedang menganalisa...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Review dengan AI ({validCount} item)
                  </div>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Result */}
      {aiResult && (
        <Card className="border-0 shadow-sm overflow-hidden animate-fade-in" style={{ animationFillMode: "both" }}>
          <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Hasil Review AI</span>
            {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto" />}
          </div>
          <CardContent className="p-4 md:p-5">
            <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground">
              <ReactMarkdown>{aiResult}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
