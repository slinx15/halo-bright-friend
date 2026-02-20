import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TableProperties, Plus, Trash2, Loader2 } from "lucide-react";

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

  const CHUNK_SIZE = 50;

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast({ title: "Error", description: "Minimal isi Kode", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setProgress(0);
    setProgressLabel("Memeriksa duplikat...");

    try {
      // 1. Check internal duplicates
      const codes = validRows.map(r => r.kode.toUpperCase());
      const seen = new Set<string>();
      const internalDups: string[] = [];
      for (const c of codes) {
        if (seen.has(c)) internalDups.push(c);
        seen.add(c);
      }
      if (internalDups.length > 0) {
        toast({ title: "Kode Duplikat", description: `Kode duplikat dalam data: ${[...new Set(internalDups)].slice(0, 5).join(", ")}`, variant: "destructive" });
        setSubmitting(false);
        return;
      }

      // 2. Check existing codes in DB (chunk to avoid URL length limits)
      const uniqueCodes = [...seen];
      const existingSet = new Set<string>();
      for (let i = 0; i < uniqueCodes.length; i += CHUNK_SIZE) {
        const batch = uniqueCodes.slice(i, i + CHUNK_SIZE);
        const { data: existing, error: checkErr } = await supabase
          .from("products")
          .select("kode")
          .in("kode", batch);
        if (checkErr) {
          console.error("Duplicate check error:", checkErr);
          // Skip dup check on error, proceed with insert
          break;
        }
        (existing || []).forEach(e => existingSet.add(e.kode));
      }
      const newRows = validRows.filter(r => !existingSet.has(r.kode.toUpperCase()));

      if (existingSet.size > 0) {
        const skipped = [...existingSet].slice(0, 5).join(", ");
        toast({ title: "Info", description: `${existingSet.size} kode sudah ada (${skipped}${existingSet.size > 5 ? "..." : ""}), dilewati.` });
      }

      if (newRows.length === 0) {
        toast({ title: "Tidak ada data baru", description: "Semua kode sudah ada di database.", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      setProgress(5);
      setProgressLabel(`Mengimport ${newRows.length} produk...`);

      // 3. Process in chunks
      const chunks: BulkRow[][] = [];
      for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
        chunks.push(newRows.slice(i, i + CHUNK_SIZE));
      }

      let totalInserted = 0;
      let errors: string[] = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const baseProgress = 5 + Math.round((ci / chunks.length) * 90);
        setProgress(baseProgress);
        setProgressLabel(`Chunk ${ci + 1}/${chunks.length} — ${totalInserted}/${newRows.length} produk...`);

        const productPayloads = chunk.map(row => ({
          kode: row.kode.toUpperCase(),
          nama: row.kode.toUpperCase(),
          kategori: row.kategori || null,
        }));

        const { data: insertedProducts, error: prodError } = await supabase
          .from("products")
          .insert(productPayloads)
          .select();

        if (prodError) {
          errors.push(`Chunk ${ci + 1}: ${prodError.message}`);
          continue;
        }
        if (!insertedProducts || insertedProducts.length === 0) continue;

        totalInserted += insertedProducts.length;

        // Insert prices
        const pricePayloads = insertedProducts.map((p, i) => ({
          product_id: p.id,
          harga_modal: parseInt(chunk[i].modal) || 0,
          harga_normal: parseInt(chunk[i].normal) || 0,
          harga_grosir: parseInt(chunk[i].grosir) || 0,
        }));
        const { error: priceError } = await supabase.from("prices").insert(pricePayloads);
        if (priceError) errors.push(`Harga chunk ${ci + 1}: ${priceError.message}`);

        // Insert stock
        const stockPayloads = insertedProducts
          .map((p, i) => ({ product_id: p.id, jumlah: parseInt(chunk[i].stok) || 0 }))
          .filter(s => s.jumlah > 0);
        if (stockPayloads.length > 0) {
          const { error: stockError } = await supabase.from("stock").insert(stockPayloads);
          if (stockError) errors.push(`Stok chunk ${ci + 1}: ${stockError.message}`);
        }
      }

      setProgress(100);
      setProgressLabel("Selesai!");

      if (errors.length > 0) {
        toast({ title: "Sebagian Gagal", description: `${totalInserted} berhasil, ${errors.length} error: ${errors[0]}`, variant: "destructive" });
      } else {
        toast({ title: "Import Selesai", description: `${totalInserted} produk berhasil diimport` });
      }

      setRows([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
    setProgress(0);
    setProgressLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TableProperties className="h-4 w-4 mr-1" /> Input Massal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
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
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addRows(5)} disabled={submitting}>
              <Plus className="h-3 w-3 mr-1" /> 5 Baris
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRows(10)} disabled={submitting}>
              <Plus className="h-3 w-3 mr-1" /> 10 Baris
            </Button>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Mengimport...</> : `Import ${validRows.length} Produk`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
