import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Loader2, Check, X, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface VoiceOpnameInputProps {
  onResult: (items: { kode: string; qty: number }[]) => void;
}

interface VoiceItem {
  kode: string;
  qty: number;
  isValid: boolean;
  productName?: string;
  matchedKode?: string;
  stokSistem?: number;
}

export function VoiceOpnameInput({ onResult }: VoiceOpnameInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();
  const { data: products } = useProducts();

  const findProduct = useCallback(
    (rawKode: string) => {
      const all = products || [];
      const kode = String(rawKode).toUpperCase().trim();
      // Exact full kode
      let found = all.find((p) => p.kode.toUpperCase() === kode);
      if (found) return found;
      // Strip leading zeros
      const stripped = kode.replace(/^0+/, "") || "0";
      found = all.find((p) => p.kode.toUpperCase().replace(/^0+/, "") === stripped);
      if (found) return found;
      // Base code (strip kategori suffix)
      found = all.find((p) => {
        const base = p.kode.toUpperCase().replace(/\s+(2 ONS|3 ONS|5 ONS|18 GRAM)$/i, "");
        return base === kode || base === stripped;
      });
      return found || null;
    },
    [products]
  );

  const validateItems = useCallback(
    (raw: { kode: string; qty: number }[]): VoiceItem[] => {
      return raw.map((it) => {
        const found = findProduct(it.kode);
        return {
          kode: it.kode,
          qty: it.qty,
          isValid: !!found,
          productName: found?.nama,
          matchedKode: found?.kode,
          stokSistem: found?.stock?.jumlah ?? 0,
        };
      });
    },
    [findProduct]
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Pick best supported mime
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 1000) {
          toast({ title: "Rekaman terlalu pendek", description: "Coba ngomong lebih lama ya", variant: "destructive" });
          return;
        }
        await processAudio(blob);
      };
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Mic error:", err);
      toast({
        title: "Mikrofon tidak bisa diakses",
        description: "Pastikan izin mic sudah diberikan di browser",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const base64 = await blobToBase64(blob);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-opname`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            audio_base64: base64,
            mime_type: blob.type,
            master_codes: products?.map((p) => p.kode) || [],
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawItems: { kode: string; qty: number }[] = data?.items || [];
      if (rawItems.length === 0) {
        toast({
          title: "Tidak terdeteksi",
          description: data?.transcript
            ? `Saya dengar: "${data.transcript}" — tapi tidak ada kode produk terdeteksi`
            : "Coba ulangi dengan format: kode lalu jumlah, contoh 'A123 lima'",
          variant: "destructive",
        });
        return;
      }
      setItems(validateItems(rawItems));
      setTranscript(data?.transcript || "");
      setShowConfirm(true);
    } catch (err: any) {
      console.error("Voice opname error:", err);
      toast({
        title: "Gagal memproses suara",
        description: err.name === "AbortError" ? "Timeout — coba rekam lebih pendek" : err.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const updateItem = (idx: number, field: "kode" | "qty", value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx] };
      if (field === "kode") {
        row.kode = value.toUpperCase();
        const found = findProduct(row.kode);
        row.isValid = !!found;
        row.productName = found?.nama;
        row.matchedKode = found?.kode;
        row.stokSistem = found?.stock?.jumlah ?? 0;
      } else {
        row.qty = Math.max(0, parseInt(value) || 0);
      }
      updated[idx] = row;
      return updated;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = () => {
    const valid = items.filter((i) => i.isValid && i.qty >= 0);
    if (valid.length === 0) {
      toast({ title: "Tidak ada item valid", variant: "destructive" });
      return;
    }
    onResult(
      valid.map((i) => ({
        kode: i.matchedKode || i.kode,
        qty: i.qty,
      }))
    );
    toast({ title: "Voice Berhasil", description: `${valid.length} item ditambahkan ke list` });
    setShowConfirm(false);
    setItems([]);
    setTranscript("");
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setItems([]);
    setTranscript("");
  };

  const validCount = items.filter((i) => i.isValid).length;
  const invalidCount = items.length - validCount;

  return (
    <>
      <Button
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`min-h-[44px] ${isRecording ? "animate-pulse" : ""}`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            Memproses...
          </>
        ) : isRecording ? (
          <>
            <MicOff className="h-4 w-4 mr-1" />
            Stop Rekam
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 mr-1" />
            Voice
          </>
        )}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              🎤 Konfirmasi Hasil Voice
            </DialogTitle>
          </DialogHeader>

          {transcript && (
            <div className="bg-muted/40 rounded-lg p-2.5 text-xs text-muted-foreground italic">
              "{transcript}"
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="bg-success/10 text-success">
              <Check className="h-3 w-3 mr-1" /> {validCount} valid
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3 w-3 mr-1" /> {invalidCount} tidak ditemukan
              </Badge>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto border rounded-md p-2 space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border space-y-1.5 ${
                  item.isValid ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={item.kode}
                    onChange={(e) => updateItem(idx, "kode", e.target.value)}
                    className="font-mono text-sm h-9 flex-1"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, "qty", e.target.value)}
                    className="font-mono text-sm h-9 w-20 tabular-nums"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive shrink-0"
                    onClick={() => removeItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs">
                  {item.isValid ? (
                    <span className="text-muted-foreground truncate">
                      ✓ {item.productName}
                      {item.matchedKode && item.matchedKode !== item.kode && (
                        <span className="ml-1 text-warning">(→ {item.matchedKode})</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-destructive">✗ Kode tidak ada di Master</span>
                  )}
                </p>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Tidak ada item</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel} className="flex-1 min-h-[44px]">
              <X className="h-4 w-4 mr-1" /> Batal
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={validCount === 0}
              className="flex-1 min-h-[44px] bg-warning hover:bg-warning/90 text-warning-foreground"
            >
              <Check className="h-4 w-4 mr-1" /> Tambah ke List ({validCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
