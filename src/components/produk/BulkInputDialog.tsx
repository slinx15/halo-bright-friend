import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { TableProperties, Plus, Trash2, Loader2 } from "lucide-react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";

interface BulkRow {
  kode: string;
  kategori: string;
  modal: string;
  normal: string;
  grosir: string;
  stok: string;
}

const emptyRow = (): BulkRow => ({
  kode: "", kategori: "", modal: "", normal: "", grosir: "", stok: "",
});

export function BulkInputDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateRow = (index: number, field: keyof BulkRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRows = (count: number) => {
    setRows(prev => [...prev, ...Array.from({ length: count }, () => emptyRow())]);
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent, rowIndex: number, fieldIndex: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return; // normal paste
    e.preventDefault();

    const fields: (keyof BulkRow)[] = ["kode", "kategori", "modal", "normal", "grosir", "stok"];
    const lines = text.trim().split("\n");
    
    setRows(prev => {
      const updated = [...prev];
      lines.forEach((line, li) => {
        const ri = rowIndex + li;
        while (updated.length <= ri) updated.push(emptyRow());
        const parts = line.split("\t");
        parts.forEach((val, ci) => {
          const fi = fieldIndex + ci;
          if (fi < fields.length) {
            updated[ri] = { ...updated[ri], [fields[fi]]: val.trim() };
          }
        });
      });
      return updated;
    });
  };

  const validRows = rows.filter(r => r.kode.trim());

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast({ title: "Error", description: "Minimal isi Kode", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setProgress(10);
    setProgressLabel("Menyiapkan data...");

    try {
      const payload = validRows.map(r => ({
        kode: r.kode.toUpperCase(),
        kategori: r.kategori || "",
        modal: parseInt(r.modal) || 0,
        normal: parseInt(r.normal) || 0,
        grosir: parseInt(r.grosir) || 0,
        stok: parseInt(r.stok) || 0,
      }));

      console.log("[BulkImport] Payload ready:", payload.length, "rows");

      // Get auth token directly from localStorage to bypass SDK lock
      setProgress(15);
      setProgressLabel("Mengambil token auth...");
      
      const storageKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
      const sessionStr = storageKey ? localStorage.getItem(storageKey) : null;
      let accessToken = "";
      
      if (sessionStr) {
        try {
          const parsed = JSON.parse(sessionStr);
          accessToken = parsed.access_token || parsed?.currentSession?.access_token || "";
        } catch {
          // fallback: try getting from supabase directly
        }
      }

      // Fallback: try supabase.auth.getSession() with a timeout
      if (!accessToken) {
        console.log("[BulkImport] Trying getSession fallback...");
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Auth timeout")), 5000)
        );
        try {
          const { data: sessionData } = await Promise.race([sessionPromise, timeoutPromise]);
          accessToken = sessionData?.session?.access_token || "";
        } catch (e) {
          console.warn("[BulkImport] getSession timed out, using stored token");
        }
      }

      if (!accessToken) {
        throw new Error("Tidak bisa mendapatkan token auth. Coba logout dan login ulang.");
      }

      console.log("[BulkImport] Token obtained, sending to edge function...");
      setProgress(20);
      setProgressLabel(`Mengimport ${payload.length} produk...`);

      // Use raw fetch instead of supabase.functions.invoke to bypass SDK lock
      const supabaseUrl = SUPABASE_URL;
      const supabaseKey = SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": supabaseKey,
        },
        body: JSON.stringify({ rows: payload }),
      });

      console.log("[BulkImport] Response status:", response.status);

      if (!response.ok) {
        const errBody = await response.text();
        console.error("[BulkImport] Error response:", errBody);
        throw new Error(`Server error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      console.log("[BulkImport] Result:", data);

      setProgress(100);
      setProgressLabel("Selesai!");

      if (data.errors && data.errors.length > 0) {
        console.error("[BulkImport] Errors:", data.errors);
        toast({
          title: "Sebagian Gagal",
          description: `${data.totalInserted} berhasil, ${data.errors.length} batch gagal`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import Selesai",
          description: `${data.totalInserted} produk berhasil diimport`,
        });
      }

      setRows([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: unknown) {
      console.error("[BulkImport] Error:", err);
      toast({ title: "Error", description: getErrorMessage(err), variant: "destructive" });
    }
    setSubmitting(false);
    setProgress(0);
    setProgressLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] w-full rounded-xl sm:w-auto">
          <TableProperties className="h-4 w-4 mr-1" /> Input Massal
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90svh] w-[calc(100vw-1rem)] max-w-4xl flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle>Input Massal Produk</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Isi data di tabel bawah, atau <strong>paste langsung dari Excel</strong> ke sel manapun.
        </p>
        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead className="min-w-[100px]">Kode *</TableHead>
                <TableHead className="min-w-[100px]">Kategori</TableHead>
                <TableHead className="min-w-[100px] text-right">Modal</TableHead>
                <TableHead className="min-w-[100px] text-right">Normal</TableHead>
                <TableHead className="min-w-[100px] text-right">Grosir</TableHead>
                <TableHead className="min-w-[80px] text-right">Stok</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center text-xs text-muted-foreground p-1">{i + 1}</TableCell>
                  {(["kode", "kategori", "modal", "normal", "grosir", "stok"] as (keyof BulkRow)[]).map((field, fi) => (
                    <TableCell key={field} className="p-1">
                      <Input
                        className="h-8 text-sm border-transparent hover:border-input focus:border-input bg-transparent"
                        value={row[field]}
                        onChange={e => updateRow(i, field, field === "kode" ? e.target.value.toUpperCase() : e.target.value)}
                        onPaste={e => handlePaste(e, i, fi)}
                        placeholder={field === "kode" ? "KTN-001" : ""}
                        type={["modal", "normal", "grosir", "stok"].includes(field) ? "number" : "text"}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="p-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {submitting && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progressLabel}
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => addRows(5)} disabled={submitting}>
              <Plus className="h-3 w-3 mr-1" /> 5 Baris
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRows(10)} disabled={submitting}>
              <Plus className="h-3 w-3 mr-1" /> 10 Baris
            </Button>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0} className="w-full sm:w-auto">
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Mengimport...</> : `Import ${validRows.length} Produk`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
