import { useState, useRef, useCallback, useMemo, useEffect } from "react";
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

const DRAFT_KEY = "opname_draft_rows";

function saveDraft(rows: InputRow[]) {
  try {
    const data = rows.filter(r => r.kode.trim() || r.qty.trim());
    if (data.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {}
}

function loadDraft(): InputRow[] | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as InputRow[];
    if (data.length === 0) return null;
    // Re-assign IDs to avoid conflicts
    return data.map((r, i) => ({ ...r, id: i + 1 }));
  } catch {
    return null;
  }
}

function getNextId() {
  return ++getNextId.counter;
}
getNextId.counter = 0;

export function BulkOpnameInput({ products, onSubmit, submitting }: BulkOpnameInputProps) {
  const [rows, setRows] = useState<InputRow[]>(() => {
    const draft = loadDraft();
    if (draft) {
      const maxId = Math.max(...draft.map(r => r.id), 0);
      getNextId.counter = maxId;
      return [...draft, { id: getNextId(), kode: "", qty: "", status: "idle" as const }];
    }
    getNextId.counter = 0;
    return [{ id: getNextId(), kode: "", qty: "", status: "idle" as const }];
  });
  const [showPreview, setShowPreview] = useState(false);
  const [parsed, setParsed] = useState<ParsedOpnameItem[]>([]);

  const kodeRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());


  // Auto-save draft to localStorage
  useEffect(() => {
    saveDraft(rows);
  }, [rows]);

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
    const newId = getNextId();
    setRows((prev) => [...prev, { id: newId, kode: "", qty: "", status: "idle" }]);
    setTimeout(() => {
      kodeRefs.current.get(newId)?.focus();
    }, 50);
    return newId;
  }, []);

  const removeRow = (id: number) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      if (filtered.length === 0) {
        const newId = getNextId();
        return [{ id: newId, kode: "", qty: "", status: "idle" as const }];
      }
      return filtered;
    });
  };

  // On kode blur: if valid, auto-focus qty
  const handleKodeBlur = (row: InputRow) => {
    const status = validateKode(row.kode);
    if (status === "valid") {
      qtyRefs.current.get(row.id)?.focus();
    }
  };

  // On qty blur: if valid kode + qty filled, auto-add new row
  const handleQtyBlur = (row: InputRow) => {
    if (row.status === "valid" && row.qty.trim() && parseInt(row.qty) >= 0) {
      // Check if this is the last row
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === prev.length - 1) {
          const newId = getNextId();
          setTimeout(() => kodeRefs.current.get(newId)?.focus(), 50);
          return [...prev, { id: newId, kode: "", qty: "", status: "idle" as const }];
        }
        return prev;
      });
    }
  };

  // Keyboard support (desktop)
  const handleKodeKeyDown = (e: React.KeyboardEvent, row: InputRow) => {
    if (e.key === "Enter" && row.status === "valid") {
      e.preventDefault();
      qtyRefs.current.get(row.id)?.focus();
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent, row: InputRow) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (row.status === "valid" && row.qty.trim() && parseInt(row.qty) >= 0) {
        addNewRow();
      } else if (row.status === "invalid") {
        kodeRefs.current.get(row.id)?.focus();
      }
    }
  };

  const handleOcrResult = (ocrItems: any[]) => {
    const newRows: InputRow[] = ocrItems
      .map((item) => {
        const kode = String(item.kode || "").toUpperCase();
        const qty = String(item.qty || item.stok_fisik || 0);
        const status = validateKode(kode);
        return { id: getNextId(), kode, qty, status };
      })
      .filter((r) => r.kode);

    setRows((prev) => {
      const existing = prev.filter((r) => r.kode.trim() || r.qty.trim());
      const newId = getNextId();
      return [...existing, ...newRows, { id: newId, kode: "", qty: "", status: "idle" as const }];
    });
  };

  const buildParsed = (): ParsedOpnameItem[] => {
    const grouped = new Map<string, number[]>();
    for (const row of rows) {
      if (row.status !== "valid" || !row.qty.trim()) continue;
      const kode = row.kode.toUpperCase().replace(/^0+/, "") || "0";
      const qty = parseInt(row.qty, 10);
      if (qty < 0) continue;
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
    setParsed(buildParsed());
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    await onSubmit(parsed);
    getNextId.counter = 0;
    setRows([{ id: getNextId(), kode: "", qty: "", status: "idle" }]);
    setParsed([]);
    setShowPreview(false);
    localStorage.removeItem(DRAFT_KEY);
  };

  const validRows = rows.filter((r) => r.status === "valid" && r.qty.trim() && parseInt(r.qty) >= 0);
  const validItems = parsed.filter((item) => findProduct(item.kode));
  const invalidItems = parsed.filter((item) => !findProduct(item.kode));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Input Opname
          </CardTitle>
          <OcrUpload mode="opname" onResult={handleOcrResult} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showPreview ? (
          <>
            {/* Rows */}
            <div className="max-h-[60vh] overflow-y-auto space-y-2 -mx-1 px-1">
              {rows.map((row) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Input
                      ref={(el) => {
                        if (el) kodeRefs.current.set(row.id, el);
                        else kodeRefs.current.delete(row.id);
                      }}
                      value={row.kode}
                      onChange={(e) => updateRow(row.id, "kode", e.target.value.toUpperCase())}
                      onBlur={() => handleKodeBlur(row)}
                      onKeyDown={(e) => handleKodeKeyDown(e, row)}
                      placeholder="Kode"
                      className={`font-mono text-sm pr-7 ${
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
                    onBlur={() => handleQtyBlur(row)}
                    onKeyDown={(e) => handleQtyKeyDown(e, row)}
                    placeholder="Qty"
                    className="font-mono text-sm w-20 shrink-0 tabular-nums"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="shrink-0 h-[44px] w-[44px] flex items-center justify-center text-muted-foreground active:text-destructive"
                    onClick={() => removeRow(row.id)}
                    tabIndex={-1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addNewRow}
              className="w-full py-2 text-sm text-muted-foreground flex items-center justify-center gap-1 active:text-foreground"
            >
              <Plus className="h-4 w-4" /> Tambah
            </button>

            {validRows.length > 0 && (
              <p className="text-xs text-muted-foreground text-center tabular-nums">
                {validRows.length} baris siap
              </p>
            )}

            <Button
              onClick={handleParse}
              disabled={validRows.length === 0}
              className="w-full"
            >
              Preview
            </Button>
          </>
        ) : (
          <>
            {invalidItems.length > 0 && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" /> Tidak ditemukan:
                </div>
                <div className="flex flex-wrap gap-1">
                  {invalidItems.map((item) => (
                    <span key={item.kode} className="font-mono text-xs bg-destructive/10 px-1.5 py-0.5 rounded">{item.kode}</span>
                  ))}
                </div>
              </div>
            )}

            {validItems.length > 0 && (
              <div className="space-y-2">
                {validItems.map((item) => {
                  const product = findProduct(item.kode)!;
                  const stokSistem = product.stock?.jumlah ?? 0;
                  const selisih = item.total - stokSistem;
                  return (
                    <div
                      key={item.kode}
                      className={`rounded-xl border p-3 space-y-1.5 ${
                        selisih !== 0
                          ? "border-l-[3px] border-l-destructive"
                          : "border-l-[3px] border-l-success"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm">{item.kode}</span>
                        <span className={`text-sm font-bold tabular-nums ${
                          selisih === 0 ? "text-success" : "text-destructive"
                        }`}>
                          {selisih > 0 ? "+" : ""}{selisih}{selisih === 0 && " ✓"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{product.nama}</p>
                      <div className="flex items-center justify-between">
                        <TumpukanBadges stacks={item.stacks} kode={item.kode} compact />
                        <div className="flex gap-3 text-[11px] tabular-nums">
                          <span className="text-muted-foreground">Fisik <strong className="text-foreground">{formatNumber(item.total)}</strong></span>
                          <span className="text-muted-foreground">Sistem <strong className="text-foreground">{formatNumber(stokSistem)}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {validItems.length} produk
              </span>
              <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validItems.filter((i) => i.total === (findProduct(i.kode)?.stock?.jumlah ?? 0)).length} sesuai
              </Badge>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                className="flex-1"
              >
                Edit
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || validItems.length === 0}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitting ? "Simpan..." : `Simpan ${validItems.length}`}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
