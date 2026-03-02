import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Loader2, Send, Plus, FileText, Trash2,
  CheckCircle2, AlertTriangle, Clock, Package, ArrowRight,
  RefreshCw, ListChecks, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts, type ProductWithDetails } from "@/hooks/useProducts";
import { useProductAliases } from "@/hooks/useProductAliases";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface OrderItem {
  kode: string;
  qty: number;
  isValid: boolean;
  productName?: string;
  productId?: string;
}

interface PendingRestock {
  id: string;
  ordered_at: string;
  status: string;
  notes: string;
  created_at: string;
  items: { kode: string; qty: number; product_id: string | null }[];
}

function parseInput(text: string, products: ProductWithDetails[], aliases: any[]): OrderItem[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: OrderItem[] = [];

  for (const line of lines) {
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
        const aliasEntry = aliases.find((a: any) => a.alias.toUpperCase() === k || a.alias.toUpperCase() === stripped);
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
      productId: product?.id,
    });
  }
  return items;
}

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PesananTambahan() {
  const [step, setStep] = useState<"input" | "saved" | "result">("input");
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<OrderItem[]>([]);
  const [showParsed, setShowParsed] = useState(false);
  const [orderedAt, setOrderedAt] = useState(() => formatDateTimeLocal(new Date()));
  const [saving, setSaving] = useState(false);
  const [pendingRestock, setPendingRestock] = useState<PendingRestock | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [loadingPending, setLoadingPending] = useState(true);

  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: products } = useProducts();
  const { data: aliases } = useProductAliases();

  // Load existing pending restock on mount
  useEffect(() => {
    loadPendingRestock();
  }, []);

  const loadPendingRestock = async () => {
    setLoadingPending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("pending_restock")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const restock = data[0];
        // Fetch items
        const { data: items, error: itemsErr } = await supabase
          .from("pending_restock_items")
          .select("kode, qty, product_id")
          .eq("restock_id", restock.id);

        if (itemsErr) throw itemsErr;

        setPendingRestock({
          ...restock,
          items: items || [],
        });
        setStep("saved");
      }
    } catch (err: any) {
      console.error("Load pending restock error:", err);
    } finally {
      setLoadingPending(false);
    }
  };

  const handleParse = useCallback(() => {
    if (!inputText.trim()) {
      toast({ title: "Kosong", description: "Tulis daftar pesanan dulu", variant: "destructive" });
      return;
    }
    const items = parseInput(inputText, products || [], aliases || []);
    if (items.length === 0) {
      toast({ title: "Format salah", description: "Format: KODE QTY per baris", variant: "destructive" });
      return;
    }
    setParsedItems(items);
    setShowParsed(true);
  }, [inputText, products, aliases, toast]);

  const handleSave = async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "Error", description: "Tidak ada item valid", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Belum login");

      // Delete existing pending if any
      if (pendingRestock) {
        await supabase.from("pending_restock").delete().eq("id", pendingRestock.id);
      }

      // Create new pending restock
      const { data: restock, error: restockErr } = await supabase
        .from("pending_restock")
        .insert({
          user_id: session.user.id,
          ordered_at: new Date(orderedAt).toISOString(),
          status: "pending",
          notes: "",
        })
        .select()
        .single();

      if (restockErr) throw restockErr;

      // Insert items
      const itemsToInsert = validItems.map(i => ({
        restock_id: restock.id,
        product_id: i.productId || null,
        kode: i.kode,
        qty: i.qty,
      }));

      const { error: itemsErr } = await supabase
        .from("pending_restock_items")
        .insert(itemsToInsert);

      if (itemsErr) throw itemsErr;

      setPendingRestock({
        ...restock,
        items: itemsToInsert.map(i => ({ kode: i.kode, qty: i.qty, product_id: i.product_id })),
      });
      setStep("saved");
      toast({ title: "Tersimpan!", description: `${validItems.length} item pesanan disimpan` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCalculateTopup = async () => {
    if (!pendingRestock) return;
    setIsStreaming(true);
    setAiResult("");
    setStep("result");

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
          body: JSON.stringify({
            mode: "topup",
            items: pendingRestock.items.map(i => ({ kode: i.kode, qty: i.qty })),
            ordered_at: pendingRestock.ordered_at,
          }),
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
            if (content) { fullText += content; setAiResult(fullText); }
          } catch { /* partial */ }
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
      console.error("Topup review error:", err);
      toast({ title: "Error", description: err.message || "Gagal review", variant: "destructive" });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleClearPending = async () => {
    if (!pendingRestock) return;
    try {
      await supabase.from("pending_restock").delete().eq("id", pendingRestock.id);
      setPendingRestock(null);
      setStep("input");
      setAiResult("");
      setParsedItems([]);
      setShowParsed(false);
      setInputText("");
      toast({ title: "Dihapus", description: "Pesanan pending dihapus" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

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

  if (loadingPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── STEP 1: Input pesanan pertama ─── */}
      {step === "input" && (
        <>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Pesanan Tambahan</h3>
                  <p className="text-xs text-muted-foreground">Catat pesanan pertama Boss, nanti sistem hitung kekurangannya</p>
                </div>
              </div>

              {/* Waktu pesan */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Kapan Boss Pesan ke Supplier?
                </label>
                <Input
                  type="datetime-local"
                  value={orderedAt}
                  onChange={e => setOrderedAt(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              {/* Daftar pesanan */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Daftar Pesanan ke Supplier</label>
                <Textarea
                  placeholder={"Tulis kode + qty per baris:\nABC-123 50\nDEF-456 25\n\nAtau foto catatan →"}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="min-h-[140px] font-mono text-sm"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f); e.target.value = ""; }} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={ocrLoading}>
                  {ocrLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
                  {ocrLoading ? "Membaca..." : "Foto Catatan"}
                </Button>
                <Button size="sm" onClick={handleParse} disabled={!inputText.trim()}>
                  <FileText className="h-4 w-4 mr-1.5" />
                  Cek Daftar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Parsed preview */}
          {showParsed && parsedItems.length > 0 && (
            <Card className="border-0 shadow-sm overflow-hidden animate-fade-in" style={{ animationFillMode: "both" }}>
              <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Daftar Pesanan Pertama</span>
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
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Menyimpan...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Simpan Pesanan ({validCount} item)
                      </div>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── STEP 2: Pesanan tersimpan, siap hitung tambahan ─── */}
      {step === "saved" && pendingRestock && (
        <>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-success/10">
                  <Package className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base">Pesanan Pending</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Dipesan: {formatDateTime(pendingRestock.ordered_at)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={handleClearPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Items summary */}
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {pendingRestock.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-muted/30 border border-border/40">
                    <span className="font-mono font-bold">{item.kode}</span>
                    <span className="font-bold tabular-nums">{item.qty} pcs</span>
                  </div>
                ))}
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm mb-1">💡 Cara pakai:</p>
                <p>Klik tombol di bawah untuk cek apakah ada barang yang perlu ditambah. Sistem akan cek pesanan yang masuk setelah Boss pesan ke supplier.</p>
              </div>

              <Button
                className="w-full font-bold"
                size="lg"
                onClick={handleCalculateTopup}
                disabled={isStreaming}
              >
                {isStreaming ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menghitung kekurangan...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Hitung Pesanan Tambahan
                  </div>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── STEP 3: AI Result ─── */}
      {step === "result" && (
        <>
          {/* Back to saved */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("saved")} disabled={isStreaming}>
              <ListChecks className="h-4 w-4 mr-1.5" />
              Lihat Pesanan
            </Button>
            <Button variant="outline" size="sm" onClick={handleCalculateTopup} disabled={isStreaming}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Hitung Ulang
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearPending} disabled={isStreaming} className="ml-auto text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Selesai
            </Button>
          </div>

          {aiResult && (
            <Card className="border-0 shadow-sm overflow-hidden animate-fade-in" style={{ animationFillMode: "both" }}>
              <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Analisa Pesanan Tambahan</span>
                {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto" />}
              </div>
              <CardContent className="p-4 md:p-5">
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground">
                  <ReactMarkdown>{aiResult}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
