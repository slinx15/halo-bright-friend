import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OcrUploadProps {
  mode: "masuk" | "keluar" | "opname";
  onResult: (items: any[]) => void;
}

export function OcrUpload({ mode, onResult }: OcrUploadProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "File harus berupa gambar", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Error", description: "Ukuran file maks 10MB", variant: "destructive" });
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Convert to base64
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("ocr-nota", {
        body: { image_base64: base64, mode },
      });

      if (error) throw error;

      if (data?.error) {
        toast({ title: "Error OCR", description: data.error, variant: "destructive" });
        return;
      }

      const items = data?.items || [];
      if (items.length === 0) {
        toast({ title: "OCR", description: "Tidak bisa membaca data dari foto. Coba foto yang lebih jelas.", variant: "destructive" });
      } else {
        toast({ title: "OCR Berhasil", description: `${items.length} item terdeteksi` });
        onResult(items);
      }
    } catch (err: any) {
      console.error("OCR error:", err);
      toast({ title: "Error", description: err.message || "Gagal memproses foto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const modeLabel = {
    masuk: "nota pembelian",
    keluar: "nota penjualan",
    opname: "data stok",
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-1" />
          )}
          {loading ? "Memproses..." : `Scan ${modeLabel[mode]}`}
        </Button>
      </div>
      {preview && (
        <div className="relative w-32 h-32 rounded border overflow-hidden">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          {loading && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
