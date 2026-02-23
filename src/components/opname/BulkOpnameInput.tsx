import { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { Send, FileText, CheckCircle2, AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { ProductWithDetails } from "@/hooks/useProducts";
import type { ParsedOpnameItem } from "@/lib/opnameParser";
import { OcrUpload } from "@/components/OcrUpload";

interface InputRow {
  id: number;
  kode: string;
  qty: string;
  status: "idle" | "valid" | "invalid";
}

interface BulkOpnameInputProps {
  products: ProductWithDetails[];
  onSubmit: (items: ParsedOpnameItem[]) => Promise<void>;
  submitting: boolean;
}

let rowIdCounter = 0;

export function BulkOpnameInput({ products, onSubmit, submitting }: BulkOpnameInputProps) {
  const [rows, setRows] = useState<InputRow[]>([
    { id: ++rowIdCounter, kode: "", qty: "", status: "idle" },
  ]);
  const [showPreview, setShowPreview] = useState(false);
  const [parsed, setParsed] = useState<ParsedOpnameItem[]>([]);

  const kodeRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Build a lookup set for fast product matching
  const productKodeSet = useMemo(() => {
    const set = new Map<string, ProductWithDetails>();
    for (const p of products) {
      set.set(p.kode.toUpperCase(), p);
    }
    return set;
  }, [products]);

  const findProduct = useCallback(
    (kode: string) => productKodeSet.get(kode.toUpperCase()),
    [productKodeSet]
  );

  const validateKode = useCallback(
    (kode: string): "valid" | "invalid" | "idle" => {
      if (!kode.trim()) return "idle";
      return findProduct(kode) ? "valid" : "invalid";
    },
    [findProduct]
  );

  const updateRow = (id: number, field: "kode" | "qty", value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "kode") {
          updated.status = validateKode(value);
        }
        return updated;
      })
    );
  };

  const addNewRow = useCallback(() => {
    const newId = ++rowIdCounter;
    setRows((prev) => [...prev, { id: newId, kode: "", qty: "", status: "idle" }]);
    // Focus kode input of new row after render
    setTimeout(() => {
      kodeRefs.current.get(newId)?.focus();
    }, 50);
    return newId;
  }, []);

  const removeRow = (id: number) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      if (filtered.length === 0) {
        const newId = ++rowIdCounter;
        return [{ id: newId, kode: "", qty: "", status: "idle" as const }];
      }
      return filtered;
    });
  };

  // When user presses Enter or Tab on qty field, auto-advance if valid
  const handleQtyKeyDown = (e: React.KeyboardEvent, row: InputRow) => {
    if (e.key === "Enter" || e.key === "Tab") {
      if (row.status === "valid" && row.qty.trim() && parseInt(row.qty) > 0) {
        e.preventDefault();
        addNewRow();
      } else if (row.status === "invalid") {
        e.preventDefault();
        // Focus back to kode to fix it
        kodeRefs.current.get(row.id)?.focus();
      }
    }
  };

  // When user presses Enter on kode field, move to qty
  const handleKodeKeyDown = (e: React.KeyboardEvent, row: InputRow) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (row.status === "valid") {
        qtyRefs.current.get(row.id)?.focus();
      }
    }
  };

  // Handle OCR results
  const handleOcrResult = (ocrItems: any[]) => {
    const newRows: InputRow[] = ocrItems
      .map((item) => {
        const kode = String(item.kode || "").toUpperCase();
        const qty = String(item.qty || item.stok_fisik || 0);
        const status = validateKode(kode);
        return { id: ++rowIdCounter, kode, qty, status };
      })
      .filter((r) => r.kode);

    setRows((prev) => {
      // Remove empty trailing row, add OCR rows, then add fresh empty row
      const existing = prev.filter((r) => r.kode.trim() || r.qty.trim());
      const newId = ++rowIdCounter;
      return [...existing, ...newRows, { id: newId, kode: "", qty: "", status: "idle" as const }];
    });
  };

  // Build parsed items from rows
  const buildParsed = (): ParsedOpnameItem[] => {
    const grouped = new Map<string, number[]>();
    for (const row of rows) {
      if (row.status !== "valid" || !row.qty.trim()) continue;
      const kode = row.kode.toUpperCase().replace(/^0+/, "") || "0";
      const qty = parseInt(row.qty, 10);
      if (qty <= 0) continue;
      if (!grouped.has(kode)) grouped.set(kode, []);
      grouped.get(kode)!.push(qty);
    }
    const result: ParsedOpnameItem[] = [];
    for (const [kode, stacks] of grouped) {
      const sorted = [...stacks].sort((a, b) => a - b);
      result.push({ kode, stacks: sorted, total: sorted.reduce((s, v) => s + v, 0) });
    }
    return result;
  };

  const handleParse = () => {
    const items = buildParsed();
    setParsed(items);
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    await onSubmit(parsed);
    rowIdCounter = 0;
    setRows([{ id: ++rowIdCounter, kode: "", qty: "", status: "idle" }]);
    setParsed([]);
    setShowPreview(false);
  };

  const validRows = rows.filter((r) => r.status === "valid" && r.qty.trim() && parseInt(r.qty) > 0);
  const validItems = parsed.filter((item) => findProduct(item.kode));
  const invalidItems = parsed.filter((item) => !findProduct(item.kode));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Input Cepat Stock Opname
          </CardTitle>
          <OcrUpload mode="opname" onResult={handleOcrResult} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showPreview ? (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ketik kode produk lalu jumlah. Tekan <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono border">Enter</kbd> untuk pindah ke baris berikutnya.
              </p>
              <p className="text-xs text-muted-foreground">
                Kode yang sama di baris berbeda otomatis digabung jadi tumpukan terpisah.
              </p>

              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Kode</span>
                <span>Jumlah</span>
                <span></span>
              </div>

              {/* Scrollable rows */}
              <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
                {rows.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-[1fr_80px_36px] gap-2 items-center">
                    <div className="relative">
                      <Input
                        ref={(el) => {
                          if (el) kodeRefs.current.set(row.id, el);
                          else kodeRefs.current.delete(row.id);
                        }}
                        value={row.kode}
                        onChange={(e) => updateRow(row.id, "kode", e.target.value.toUpperCase())}
                        onKeyDown={(e) => handleKodeKeyDown(e, row)}
                        placeholder="Kode"
                        className={`font-mono text-sm h-9 min-h-0 pr-7 ${
                          row.status === "invalid"
                            ? "border-destructive focus-visible:ring-destructive/30"
                            : row.status === "valid"
                            ? "border-success focus-visible:ring-success/30"
                            : ""
                        }`}
                        autoComplete="off"
                      />
                      {row.status === "valid" && (
                        <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-success" />
                      )}
                      {row.status === "invalid" && (
                        <X className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-destructive" />
                      )}
                    </div>
                    <Input
                      ref={(el) => {
                        if (el) qtyRefs.current.set(row.id, el);
                        else qtyRefs.current.delete(row.id);
                      }}
                      type="number"
                      inputMode="numeric"
                      value={row.qty}
                      onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                      onKeyDown={(e) => handleQtyKeyDown(e, row)}
                      placeholder="Qty"
                      className="font-mono text-sm h-9 min-h-0"
                      autoComplete="off"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      tabIndex={-1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={addNewRow}
                className="w-full text-muted-foreground"
              >
                <Plus className="h-4 w-4 mr-1" /> Tambah Baris
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{validRows.length} baris valid dari {rows.filter((r) => r.kode.trim()).length} terisi</span>
            </div>

            <Button
              onClick={handleParse}
              disabled={validRows.length === 0}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" /> Preview Hasil
            </Button>
          </>
        ) : (
          <>
            {invalidItems.length > 0 && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" /> Kode tidak ditemukan:
                </div>
                {invalidItems.map((item) => (
                  <span key={item.kode} className="font-mono mr-2">{item.kode}</span>
                ))}
              </div>
            )}

            {validItems.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Tumpukan Fisik</TableHead>
                      <TableHead className="text-right">Total Fisik</TableHead>
                      <TableHead className="text-right">Stok Sistem</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validItems.map((item) => {
                      const product = findProduct(item.kode)!;
                      const stokSistem = product.stock?.jumlah ?? 0;
                      const selisih = item.total - stokSistem;
                      return (
                        <TableRow key={item.kode}>
                          <TableCell className="font-mono text-sm font-medium">{item.kode}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{product.nama}</TableCell>
                          <TableCell>
                            <TumpukanBadges stacks={item.stacks} kode={item.kode} compact />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(item.total)}</TableCell>
                          <TableCell className="text-right">{formatNumber(stokSistem)}</TableCell>
                          <TableCell className={`text-right font-semibold ${
                            selisih === 0 ? "text-success" : "text-destructive"
                          }`}>
                            {selisih > 0 ? "+" : ""}{selisih}
                            {selisih === 0 && " ✓"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {validItems.length} produk valid
                {invalidItems.length > 0 && `, ${invalidItems.length} tidak ditemukan`}
              </span>
              <Badge variant="secondary" className="bg-success/10 text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validItems.filter((i) => i.total === (findProduct(i.kode)?.stock?.jumlah ?? 0)).length} sesuai
              </Badge>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-xl"
              >
                Edit Ulang
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || validItems.length === 0}
                className="flex-1 rounded-xl"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitting ? "Menyimpan..." : `Simpan ${validItems.length} Opname`}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
