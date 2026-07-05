import { useRef, useState } from "react";
import { Camera, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage, isAbortError } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabaseEnv";
import { formatRupiah } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface DebtDraft {
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  note: string;
}

interface HutangOcrUploadProps {
  onResult: (items: DebtDraft[], sourceImage: string) => void;
}

type OcrDebtRow = {
  invoice_number?: string;
  amount?: number;
  invoice_date?: string;
  note?: string;
};

export function HutangOcrUpload({ onResult }: HutangOcrUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [draftRows, setDraftRows] = useState<DebtDraft[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const { toast } = useToast();

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1100;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas tidak tersedia"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const parseRows = (rows: OcrDebtRow[]) =>
    rows
      .map((row) => ({
        invoiceNumber: String(row.invoice_number || "").trim(),
        amount: Number(row.amount || 0),
        invoiceDate: row.invoice_date || new Date().toISOString().slice(0, 10),
        note: row.note || "",
      }))
      .filter((row) => row.amount > 0 || row.invoiceNumber);

  const updateRow = (idx: number, field: keyof DebtDraft, value: string | number) => {
    setDraftRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "amount" ? Number(value) || 0 : String(value) } as DebtDraft;
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setDraftRows((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "File harus berupa gambar", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Error", description: "Ukuran file maks 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const headers = await getAuthHeaders();

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr-nota`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          image_base64: base64,
          mode: "hutang",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const items = parseRows((data?.items ?? data ?? []) as OcrDebtRow[]);
      if (items.length === 0) {
        toast({ title: "OCR", description: "Tidak ada tagihan yang terbaca. Silakan isi manual.", variant: "destructive" });
      }
      setDraftRows(items);
      setShowConfirm(true);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        toast({ title: "Timeout", description: "Proses terlalu lama. Coba foto yang lebih jelas.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: getErrorMessage(err, "Gagal memproses bon"), variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const valid = draftRows.filter((item) => item.amount > 0 || item.invoiceNumber.trim());
    if (valid.length === 0) {
      toast({ title: "Error", description: "Tidak ada data bon valid", variant: "destructive" });
      return;
    }
    onResult(valid, preview || "");
    setShowConfirm(false);
    setDraftRows([]);
    setPreview(null);
    toast({ title: "OCR bon tersimpan", description: `${valid.length} baris tagihan siap dicek` });
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="min-h-[44px] w-full rounded-xl sm:w-auto"
      >
        {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
        {loading ? "Memproses..." : "Scan Bon"}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="flex max-h-[90svh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Hasil Baca Bon
            </DialogTitle>
          </DialogHeader>

          <div className="px-6">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {draftRows.length} baris terbaca
            </Badge>
          </div>

          {preview && (
            <div className="px-6">
              <img src={preview} alt="Preview bon" className="max-h-40 w-full rounded-xl border object-contain bg-muted" />
            </div>
          )}

          <div className="mx-6 my-4 flex-1 min-h-0 overflow-y-auto rounded-xl border p-2">
            <div className="space-y-2">
              {draftRows.map((row, idx) => (
                <div
                  key={`${row.invoiceNumber}-${idx}`}
                  className={cn("space-y-2 rounded-xl border p-3", row.note.toLowerCase().includes("lunas") ? "border-warning/30 bg-warning/5" : "bg-card")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        value={row.invoiceNumber}
                        onChange={(e) => updateRow(idx, "invoiceNumber", e.target.value)}
                        placeholder="No faktur"
                        className="h-9 rounded-lg font-mono text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={row.amount || ""}
                      onChange={(e) => updateRow(idx, "amount", e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                      placeholder="Nominal"
                      className="h-9 rounded-lg text-sm"
                    />
                    <Input
                      type="date"
                      value={row.invoiceDate}
                      onChange={(e) => updateRow(idx, "invoiceDate", e.target.value)}
                      className="h-9 rounded-lg text-sm"
                    />
                  </div>
                  <Input
                    value={row.note}
                    onChange={(e) => updateRow(idx, "note", e.target.value)}
                    placeholder="Catatan / lunas"
                    className="h-9 rounded-lg text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{formatRupiah(row.amount || 0)}</p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t px-6 py-4 sm:flex-row">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="w-full sm:w-auto">
              <X className="mr-1 h-4 w-4" />
              Batal
            </Button>
            <Button onClick={handleConfirm} className="w-full sm:w-auto">
              <Check className="mr-1 h-4 w-4" />
              Simpan Bon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

