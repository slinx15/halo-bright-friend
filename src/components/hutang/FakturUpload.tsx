import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage, isAbortError } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabaseEnv";
import { formatRupiah } from "@/lib/formatters";

export interface FakturDraft {
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  note: string;
}

interface FakturUploadProps {
  onResult: (items: FakturDraft[], sourceImages: string[]) => void;
  openSignal?: number;
}

type OcrDebtRow = {
  invoice_number?: string;
  amount?: number;
  invoice_date?: string;
  note?: string;
  status?: "open" | "paid";
};

export function FakturUpload({ onResult, openSignal }: FakturUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [draftRows, setDraftRows] = useState<FakturDraft[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (openSignal) fileRef.current?.click();
  }, [openSignal]);

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
        note: row.note || (row.status === "paid" ? "lunas" : ""),
      }))
      .filter((row) => row.amount > 0 || row.invoiceNumber);

  const updateRow = (idx: number, field: keyof FakturDraft, value: string | number) => {
    setDraftRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "amount" ? Number(value) || 0 : String(value) } as FakturDraft;
      return next;
    });
  };

  const removeRow = (idx: number) => setDraftRows((prev) => prev.filter((_, index) => index !== idx));

  const handleFiles = async (files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (list.some((file) => !file.type.startsWith("image/"))) {
      toast({ title: "Error", description: "Semua file harus berupa gambar", variant: "destructive" });
      return;
    }
    if (list.some((file) => file.size > 10 * 1024 * 1024)) {
      toast({ title: "Error", description: "Ukuran file maks 10MB per gambar", variant: "destructive" });
      return;
    }

    setPreviewImages(list.map((file) => URL.createObjectURL(file)));
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const allRows: FakturDraft[] = [];
      for (const file of list) {
        const base64 = await fileToBase64(file);
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr-nota`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            image_base64: base64,
            mode: "hutang",
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        const items = parseRows((data?.items ?? data ?? []) as OcrDebtRow[]);
        allRows.push(...items);
      }
      clearTimeout(timeoutId);

      if (allRows.length === 0) {
        toast({ title: "OCR", description: "Tidak ada faktur yang terbaca. Silakan isi manual.", variant: "destructive" });
      }
      setDraftRows(allRows);
      setShowConfirm(true);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        toast({ title: "Timeout", description: "Proses terlalu lama. Coba foto yang lebih jelas.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: getErrorMessage(err, "Gagal memproses faktur"), variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const valid = draftRows.filter((item) => item.amount > 0 || item.invoiceNumber.trim());
    if (valid.length === 0) {
      toast({ title: "Error", description: "Tidak ada data faktur valid", variant: "destructive" });
      return;
    }
    onResult(valid, previewImages);
    setShowConfirm(false);
    setDraftRows([]);
    setPreviewImages([]);
    toast({ title: "OCR faktur tersimpan", description: `${valid.length} baris faktur siap dicek` });
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) handleFiles(files);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="min-h-[44px] w-full rounded-xl border-border/70 bg-card shadow-sm sm:w-auto sm:min-w-[140px]"
      >
        {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
        {loading ? "Memproses..." : "Tambah Bon Baru"}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="flex max-h-[90svh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Hasil Baca Faktur
            </DialogTitle>
          </DialogHeader>

          <div className="px-6">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {draftRows.length} baris terbaca
            </Badge>
          </div>

          <div className="mx-6 grid max-h-24 grid-cols-3 gap-2 overflow-hidden">
            {previewImages.slice(0, 3).map((src, index) => (
              <img key={`${src}-${index}`} src={src} alt={`Preview ${index + 1}`} className="h-24 w-full rounded-xl border object-cover bg-muted" />
            ))}
          </div>

          <div className="mx-6 my-4 flex-1 min-h-0 overflow-y-auto rounded-xl border p-2">
            <div className="space-y-2">
              {draftRows.map((row, idx) => (
                <div key={`${row.invoiceNumber}-${idx}`} className="space-y-2 rounded-xl border p-3 bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={row.invoiceNumber}
                      onChange={(e) => updateRow(idx, "invoiceNumber", e.target.value)}
                      placeholder="No faktur"
                      className="h-9 rounded-lg font-mono text-sm"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
                    placeholder="Catatan"
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
              Simpan Faktur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
