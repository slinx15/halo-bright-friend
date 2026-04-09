import { useState, useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { Send, FileText, CheckCircle2, AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { ProductWithDetails } from "@/hooks/useProducts";
import type { ParsedOpnameItem } from "@/lib/opnameParser";

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

function loadDraft(): { rows: InputRow[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as InputRow[];
    if (data.length === 0) return null;
    return { rows: data.map((r, i) => ({ ...r, id: i + 1 })) };
  } catch {
    return null;
  }
}

function getNextId() {
  return ++getNextId.counter;
}
getNextId.counter = 0;

export interface BulkOpnameInputHandle {
  handleOcrResult: (items: any[]) => void;
}

export const BulkOpnameInput = forwardRef<BulkOpnameInputHandle, BulkOpnameInputProps>(function BulkOpnameInput({ products, onSubmit, submitting }, ref) {
  const draft = useMemo(() => loadDraft(), []);
  const [rows, setRows] = useState<InputRow[]>(() => {
    if (draft?.rows) {
      const maxId = Math.max(...draft.rows.map(r => r.id), 0);
      getNextId.counter = maxId;
      return [...draft.rows, { id: getNextId(), kode: "", qty: "", status: "idle" as const }];
    }
    getNextId.counter = 0;
    return [{ id: getNextId(), kode: "", qty: "", status: "idle" as const }];
  });
  const [showPreview, setShowPreview] = useState(false);
  const [parsed, setParsed] = useState<ParsedOpnameItem[]>([]);

  const kodeRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  useEffect(() => {
    saveDraft(rows);
  }, [rows]);

  // Auto-detect: search ALL products by kode (exact match, base code, or nama)
  const productKodeSet = useMemo(() => {
    const set = new Map<string, ProductWithDetails>();
    for (const p of products) {
      // Full kode
      set.set(p.kode.toUpperCase(), p);
      // Base code (strip category suffix) — only set if not already taken
      const baseKode = p.kode.toUpperCase().replace(/\s+(2 ONS|3 ONS|5 ONS|18 GRAM)$/i, "");
      if (!set.has(baseKode)) {
        set.set(baseKode, p);
      }
    }
    return set;
  }, [products]);

  const findProduct = useCallback(
    (kode: string) => productKodeSet.get(kode.toUpperCase().trim()),
    [productKodeSet]
  );

  const validateKode = useCallback(
    (kode: string): "valid" | "invalid" | "idle" => {
      if (!kode.trim()) return "idle";
      return findProduct(kode) ? "valid" : "invalid";
    },
    [findProduct]
  );

  // Re-validate all rows when products change
  useEffect(() => {
    setRows(prev => prev.map(r => ({
      ...r,
      status: r.kode.trim() ? (findProduct(r.kode) ? "valid" : "invalid") : "idle",
    })));
  }, [findProduct]);

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

  const handleKodeBlur = (row: InputRow) => {
    const status = validateKode(row.kode);
    if (status === "valid") {
      qtyRefs.current.get(row.id)?.focus();
    }
  };

  const handleQtyBlur = (row: InputRow) => {
    if (row.status === "valid" && row.qty.trim() && parseInt(row.qty) >= 0) {
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

  const handleOcrResult = useCallback((ocrItems: any[]) => {
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
  }, [validateKode]);

  useImperativeHandle(ref, () => ({ handleOcrResult }), [handleOcrResult]);

  const buildParsed = (): ParsedOpnameItem[] => {
    const grouped = new Map<string, { stacks: number[]; productId: string }>();
    for (const row of rows) {
      if (row.status !== "valid" || !row.qty.trim()) continue;
      const product = findProduct(row.kode);
      if (!product) continue;
      const fullKode = product.kode.toUpperCase();
      const qty = parseInt(row.qty, 10);
      if (qty < 0) continue;
      if (!grouped.has(fullKode)) grouped.set(fullKode, { stacks: [], productId: product.id });
      grouped.get(fullKode)!.stacks.push(qty);
    }
    const result: ParsedOpnameItem[] = [];
    for (const [kode, { stacks }] of grouped) {
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

  const findProductByFullKode = useCallback(
    (kode: string) => {
      return (products || []).find(p => p.kode.toUpperCase() === kode.toUpperCase());
    },
    [products]
  );

  const validRows = rows.filter((r) => r.status === "valid" && r.qty.trim() && parseInt(r.qty) >= 0);
  const validItems = parsed.filter((item) => findProductByFullKode(item.kode));
  const invalidItems = parsed.filter((item) => !findProductByFullKode(item.kode));

  return (
    <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-warning/5 to-transparent">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <FileText className="h-4 w-4 text-warning" />
          Input Opname
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {!showPreview ? (
          <>
            {/* Rows */}
            <div className="max-h-[60vh] overflow-y-auto space-y-2 -mx-1 px-1">
              {rows.map((row) => {
                const matched = row.status === "valid" ? findProduct(row.kode) : null;
                const kategoriLabel = matched?.kategori && matched.kategori !== "2 Ons" ? matched.kategori : null;
                const qtyLabel = matched?.kategori === "18 Gram" ? "Pack" : "Qty";
                return (
                  <div key={row.id} className="space-y-0.5">
                    <div className="flex gap-2 items-center">
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
                        placeholder={qtyLabel}
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
                    {matched && (
                      <p className="text-[10px] text-muted-foreground pl-1 truncate">
                        {matched.nama}
                        {kategoriLabel && <Badge variant="secondary" className="text-[8px] px-1 py-0 ml-1">{kategoriLabel}</Badge>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addNewRow}
              className="w-full py-2.5 text-sm text-muted-foreground flex items-center justify-center gap-1 active:text-foreground rounded-xl border border-dashed border-border/60 hover:bg-muted/30 transition-colors min-h-[44px]"
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
              className="w-full rounded-xl h-12 text-base font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-warning hover:bg-warning/90 text-warning-foreground"
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
                  const product = findProductByFullKode(item.kode)!;
                  const stokSistem = product.stock?.jumlah ?? 0;
                  const selisih = item.total - stokSistem;
                  const unitLabel = product.kategori === "18 Gram" ? "pack" : "pcs";
                  const kategoriLabel = product.kategori && product.kategori !== "2 Ons" ? product.kategori : null;
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm">{item.kode}</span>
                          {kategoriLabel && <Badge variant="secondary" className="text-[8px] px-1 py-0">{kategoriLabel}</Badge>}
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${
                          selisih === 0 ? "text-success" : "text-destructive"
                        }`}>
                          {selisih > 0 ? "+" : ""}{selisih} {unitLabel}{selisih === 0 && " ✓"}
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
                {validItems.filter((i) => i.total === (findProductByFullKode(i.kode)?.stock?.jumlah ?? 0)).length} sesuai
              </Badge>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-xl h-12 font-bold min-h-[44px]"
              >
                Edit
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || validItems.length === 0}
                className="flex-1 rounded-xl h-12 font-bold transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-lg bg-warning hover:bg-warning/90 text-warning-foreground"
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
});
