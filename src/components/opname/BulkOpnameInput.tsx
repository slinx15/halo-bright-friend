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
import { findProductMatch } from "@/lib/productMatcher";
import type { BulkOpnameSubmitResult } from "@/pages/Opname";

interface InputRow {
  id: number;
  kode: string;
  qty: string;
  status: "idle" | "valid" | "invalid";
  productId?: string;
  productKode?: string;
  productKategori?: string | null;
}

interface BulkOpnameInputProps {
  products: ProductWithDetails[];
  onSubmit: (items: ParsedOpnameItem[]) => Promise<BulkOpnameSubmitResult>;
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
  } catch {
    // Draft persistence is best-effort only.
  }
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
  handleOcrResult: (items: BulkOpnameOcrItem[]) => void;
  handleVoiceResult: (items: { kode: string; qty: number }[]) => void;
}

interface BulkOpnameOcrItem {
  productId?: string;
  kode?: string;
  kategori?: string;
  qty?: number;
  stok_fisik?: number;
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
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [showAllSubmitErrors, setShowAllSubmitErrors] = useState(false);

  const kodeRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  useEffect(() => {
    saveDraft(rows);
  }, [rows]);

  const findProduct = useCallback(
    (kode: string, productId?: string, kategori?: string | null) => findProductMatch(products, { kode, productId, kategori }),
    [products]
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
      status: r.kode.trim() ? (findProduct(r.kode, r.productId, r.productKategori) ? "valid" : "invalid") : "idle",
    })));
  }, [findProduct]);

  const updateRow = (id: number, field: "kode" | "qty", value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "kode") {
          updated.productId = undefined;
          updated.productKode = undefined;
          updated.productKategori = undefined;
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

  const handleOcrResult = useCallback((ocrItems: BulkOpnameOcrItem[]) => {
    const newRows: InputRow[] = ocrItems
      .map((item) => {
        const product = findProductMatch(products, { productId: item.productId, kode: item.kode, kategori: item.kategori });
        const kode = String(product?.kode || item.kode || "").toUpperCase();
        const qty = String(item.qty || item.stok_fisik || 0);
        const status: InputRow["status"] = product ? "valid" : validateKode(kode);
        return {
          id: getNextId(),
          kode,
          qty,
          status,
          productId: product?.id,
          productKode: product?.kode,
          productKategori: product?.kategori,
        };
      })
      .filter((r) => r.kode);

    setRows((prev) => {
      const existing = prev.filter((r) => r.kode.trim() || r.qty.trim());
      const newId = getNextId();
      return [...existing, ...newRows, { id: newId, kode: "", qty: "", status: "idle" as const }];
    });
  }, [products, validateKode]);

  const handleVoiceResult = useCallback((voiceItems: { kode: string; qty: number }[]) => {
    const newRows: InputRow[] = voiceItems
      .map((item) => {
        const product = findProductMatch(products, { kode: item.kode });
        const kode = String(product?.kode || item.kode || "").toUpperCase();
        const qty = String(item.qty ?? 0);
        const status: InputRow["status"] = product ? "valid" : validateKode(kode);
        return {
          id: getNextId(),
          kode,
          qty,
          status,
          productId: product?.id,
          productKode: product?.kode,
          productKategori: product?.kategori,
        };
      })
      .filter((r) => r.kode);

    setRows((prev) => {
      const existing = prev.filter((r) => r.kode.trim() || r.qty.trim());
      const newId = getNextId();
      return [...existing, ...newRows, { id: newId, kode: "", qty: "", status: "idle" as const }];
    });
  }, [products, validateKode]);

  useImperativeHandle(ref, () => ({ handleOcrResult, handleVoiceResult }), [handleOcrResult, handleVoiceResult]);

  const buildParsed = (): ParsedOpnameItem[] => {
    const grouped = new Map<string, { kode: string; stacks: number[]; productId: string; kategori: string | null }>();
    for (const row of rows) {
      if (row.status !== "valid" || !row.qty.trim()) continue;
      const product = findProduct(row.kode, row.productId, row.productKategori);
      if (!product) continue;
      const qty = parseInt(row.qty, 10);
      if (qty < 0) continue;
      if (!grouped.has(product.id)) {
        grouped.set(product.id, { kode: product.kode.toUpperCase(), stacks: [], productId: product.id, kategori: product.kategori });
      }
      grouped.get(product.id)!.stacks.push(qty);
    }
    const result: ParsedOpnameItem[] = [];
    for (const [, { kode, stacks, productId, kategori }] of grouped) {
      const sorted = [...stacks].sort((a, b) => a - b);
      result.push({ kode, productId, kategori, stacks: sorted, total: sorted.reduce((s, v) => s + v, 0) });
    }
    return result;
  };

  const handleParse = () => {
    setSubmitErrors([]);
    setShowAllSubmitErrors(false);
    setParsed(buildParsed());
    setShowPreview(true);
  };

  const handleSubmit = async () => {
    const result = await onSubmit(parsed);
    setSubmitErrors(result.errorMessages);
    setShowAllSubmitErrors(false);

    if (result.errorMessages.length > 0) {
      setShowPreview(true);
      return;
    }

    getNextId.counter = 0;
    setRows([{ id: getNextId(), kode: "", qty: "", status: "idle" }]);
    setParsed([]);
    setShowPreview(false);
    localStorage.removeItem(DRAFT_KEY);
  };

  const findProductByParsedItem = useCallback(
    (item: ParsedOpnameItem) => {
      if (item.productId) {
        const byId = (products || []).find(p => p.id === item.productId);
        if (byId) return byId;
      }
      return findProductMatch(products, { kode: item.kode, kategori: item.kategori });
    },
    [products]
  );

  const validRows = rows.filter((r) => r.status === "valid" && r.qty.trim() && parseInt(r.qty) >= 0);
  const validItems = parsed.filter((item) => findProductByParsedItem(item));
  const invalidItems = parsed.filter((item) => !findProductByParsedItem(item));
  const invalidRows = rows.filter((row) => row.status === "invalid" && row.kode.trim());
  const visibleSubmitErrors = showAllSubmitErrors ? submitErrors : submitErrors.slice(0, 10);

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
                const matched = row.status === "valid" ? findProduct(row.kode, row.productId, row.productKategori) : null;
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
            {submitErrors.length > 0 && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> {submitErrors.length} item gagal disimpan
                  </div>
                  {submitErrors.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowAllSubmitErrors((prev) => !prev)}
                      className="text-xs font-semibold underline underline-offset-2"
                    >
                      {showAllSubmitErrors ? "Tampilkan ringkas" : "Lihat semua"}
                    </button>
                  )}
                </div>
                <p className="text-xs mb-2 text-destructive/80">
                  Item ini belum tercatat ke log opname. Periksa kode atau coba simpan ulang jika gagal karena koneksi.
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {visibleSubmitErrors.map((message) => (
                    <p key={message} className="font-mono text-xs break-words">{message}</p>
                  ))}
                </div>
                {!showAllSubmitErrors && submitErrors.length > 10 && (
                  <p className="text-xs mt-2">+{submitErrors.length - 10} item gagal lain</p>
                )}
                {submitErrors.length === 1 && (
                  <p className="text-xs mt-2">
                    Perbaiki item ini lalu simpan lagi.
                  </p>
                )}
              </div>
            )}

            {invalidRows.length > 0 && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" /> Kode tidak cocok:
                </div>
                <div className="flex flex-wrap gap-1">
                  {invalidRows.map((row) => (
                    <span key={row.id} className="font-mono text-xs bg-destructive/10 px-1.5 py-0.5 rounded">{row.kode}</span>
                  ))}
                </div>
              </div>
            )}

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
                  const product = findProductByParsedItem(item)!;
                  const stokSistem = product.stock?.jumlah ?? 0;
                  const selisih = item.total - stokSistem;
                  const unitLabel = product.kategori === "18 Gram" ? "pack" : "pcs";
                  const kategoriLabel = product.kategori && product.kategori !== "2 Ons" ? product.kategori : null;
                  return (
                    <div
                      key={item.productId || item.kode}
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
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <TumpukanBadges stacks={item.stacks} kode={item.kode} compact />
                        <div className="flex flex-wrap gap-3 text-[11px] tabular-nums">
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
                {validItems.filter((i) => i.total === (findProductByParsedItem(i)?.stock?.jumlah ?? 0)).length} sesuai
              </Badge>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitErrors([]);
                  setShowAllSubmitErrors(false);
                  setShowPreview(false);
                }}
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
