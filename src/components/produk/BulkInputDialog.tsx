import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TableProperties, Plus, Trash2 } from "lucide-react";

interface BulkRow {
  kode: string;
  nama: string;
  kategori: string;
  modal: string;
  normal: string;
  grosir: string;
  stok: string;
}

const emptyRow = (): BulkRow => ({
  kode: "", nama: "", kategori: "", modal: "", normal: "", grosir: "", stok: "",
});

export function BulkInputDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
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

    const fields: (keyof BulkRow)[] = ["kode", "nama", "kategori", "modal", "normal", "grosir", "stok"];
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

  const validRows = rows.filter(r => r.kode.trim() && r.nama.trim());

  const handleSubmit = async () => {
    if (validRows.length === 0) {
      toast({ title: "Error", description: "Minimal isi Kode dan Nama", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    let success = 0, errors = 0;

    for (const row of validRows) {
      try {
        const { data: newP, error } = await supabase.from("products").insert({
          kode: row.kode.toUpperCase(),
          nama: row.nama,
          kategori: row.kategori || null,
        }).select().single();
        if (error) throw error;
        await supabase.from("prices").insert({
          product_id: newP.id,
          harga_modal: parseInt(row.modal) || 0,
          harga_normal: parseInt(row.normal) || 0,
          harga_grosir: parseInt(row.grosir) || 0,
        });
        const stokVal = parseInt(row.stok) || 0;
        if (stokVal > 0) {
          await supabase.from("stock").insert({ product_id: newP.id, jumlah: stokVal });
        }
        success++;
      } catch {
        errors++;
      }
    }

    toast({ title: "Import Selesai", description: `${success} berhasil, ${errors} gagal` });
    setRows([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setSubmitting(false);
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
                <TableHead className="min-w-[160px]">Nama *</TableHead>
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
                  {(["kode", "nama", "kategori", "modal", "normal", "grosir", "stok"] as (keyof BulkRow)[]).map((field, fi) => (
                    <TableCell key={field} className="p-1">
                      <Input
                        className="h-8 text-sm border-transparent hover:border-input focus:border-input bg-transparent"
                        value={row[field]}
                        onChange={e => updateRow(i, field, field === "kode" ? e.target.value.toUpperCase() : e.target.value)}
                        onPaste={e => handlePaste(e, i, fi)}
                        placeholder={field === "kode" ? "KTN-001" : field === "nama" ? "Katun Jepang" : ""}
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
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addRows(5)}>
              <Plus className="h-3 w-3 mr-1" /> 5 Baris
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRows(10)}>
              <Plus className="h-3 w-3 mr-1" /> 10 Baris
            </Button>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || validRows.length === 0}>
            {submitting ? "Mengimport..." : `Import ${validRows.length} Produk`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
