import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ClipboardList, Plus, Trash2, Send, AlertTriangle, CheckCircle2,
  Package, Clock, Loader2
} from "lucide-react";
import type { ProductAnalysis } from "@/lib/stockAnalyticsEngine";

interface ManualPesananProps {
  analyses: ProductAnalysis[];
  isMobile: boolean;
}

interface PesananRow {
  kode: string;
  qty: number;
  matched?: ProductAnalysis;
}

interface PendingOrder {
  id: string;
  ordered_at: string;
  status: string;
  notes: string | null;
  items: { kode: string; qty: number }[];
}

export default function ManualPesanan({ analyses, isMobile }: ManualPesananProps) {
  const [rows, setRows] = useState<PesananRow[]>([]);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  // Build lookup
  const kodeMap = useMemo(() => {
    const m = new Map<string, ProductAnalysis>();
    analyses.forEach(a => m.set(a.kode.toUpperCase(), a));
    return m;
  }, [analyses]);

  // Fetch pending orders on mount
  useState(() => {
    fetchPending();
  });

  async function fetchPending() {
    setLoadingPending(true);
    try {
      const { data } = await supabase
        .from("pending_restock")
        .select("id, ordered_at, status, notes, pending_restock_items(kode, qty)")
        .eq("status", "pending")
        .order("ordered_at", { ascending: false });

      const orders: PendingOrder[] = (data || []).map((r: any) => ({
        id: r.id,
        ordered_at: r.ordered_at,
        status: r.status,
        notes: r.notes,
        items: (r.pending_restock_items || []).map((i: any) => ({ kode: i.kode, qty: i.qty })),
      }));
      setPendingOrders(orders);
    } catch { setPendingOrders([]); }
    finally { setLoadingPending(false); }
  }

  const resolveRow = useCallback((kode: string, qty: number): PesananRow => {
    const matched = kodeMap.get(kode.toUpperCase());
    return { kode: matched ? matched.kode : kode.toUpperCase(), qty, matched };
  }, [kodeMap]);

  const addRow = () => setRows(prev => [...prev, { kode: "", qty: 0 }]);

  const updateRow = (idx: number, field: "kode" | "qty", value: string | number) => {
    setRows(prev => {
      const updated = [...prev];
      if (field === "kode") {
        updated[idx] = resolveRow(value as string, updated[idx].qty);
      } else {
        updated[idx] = { ...updated[idx], qty: value as number };
      }
      return updated;
    });
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  const validRows = rows.filter(r => r.matched && r.qty > 0);
  const invalidRows = rows.filter(r => r.kode && !r.matched);

  const totalCost = validRows.reduce((sum, r) => sum + (r.matched!.unitPrice * r.qty), 0);

  async function handleSubmit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Belum login"); return; }

      const { data: restock, error: restockErr } = await supabase
        .from("pending_restock")
        .insert({ user_id: user.id, notes: catatan || "Input manual" })
        .select()
        .single();
      if (restockErr || !restock) throw restockErr;

      const itemsToInsert = validRows.map(r => ({
        restock_id: restock.id,
        kode: r.kode,
        qty: r.qty,
        product_id: r.matched!.productId,
      }));

      const { error: itemsErr } = await supabase
        .from("pending_restock_items")
        .insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      toast.success(`${validRows.length} item berhasil dicatat sebagai pesanan pending`);
      setRows([]);
      setCatatan("");
      fetchPending();
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal menyimpan: " + (e?.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function markReceived(orderId: string) {
    try {
      await supabase
        .from("pending_restock")
        .update({ status: "received" })
        .eq("id", orderId);
      toast.success("Pesanan ditandai sudah diterima");
      fetchPending();
    } catch {
      toast.error("Gagal mengubah status");
    }
  }

  const formatRp = (n: number) => "Rp " + n.toLocaleString("id-ID");

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Input Pesanan Manual</h3>
              <p className="text-xs text-muted-foreground">
                Catat pesanan yang sudah dipesan di luar sistem
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Catatan (opsional)</label>
            <Input
              value={catatan}
              onChange={e => setCatatan(e.target.value)}
              placeholder="Misal: pesan lewat WA ke supplier A..."
              className="rounded-lg mt-1"
            />
          </div>

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="text-right w-16">Stok</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="text-right">Est. Biaya</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const cost = row.matched ? row.matched.unitPrice * row.qty : 0;
                    return (
                      <TableRow key={idx} className={!row.matched && row.kode ? "bg-destructive/5" : ""}>
                        <TableCell>
                          <Input
                            className="h-8 text-sm font-mono"
                            value={row.kode}
                            onChange={e => updateRow(idx, "kode", e.target.value)}
                            placeholder="Kode..."
                            list="manual-pesanan-codes"
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.matched ? (
                            <span className="text-muted-foreground">{row.matched.kode}</span>
                          ) : row.kode ? (
                            <span className="text-destructive text-xs">Tidak ditemukan</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {row.matched ? row.matched.currentStock : "-"}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="h-10 text-sm w-20 min-w-[5rem] touch-manipulation"
                            value={row.qty === 0 ? "" : row.qty}
                            onChange={e => updateRow(idx, "qty", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {row.matched && row.qty > 0 ? formatRp(cost) : "-"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeRow(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <datalist id="manual-pesanan-codes">
            {analyses.map(a => <option key={a.productId} value={a.kode} />)}
          </datalist>

          <Button variant="outline" size="sm" onClick={addRow} className="w-full rounded-xl min-h-[44px]">
            <Plus className="h-4 w-4 mr-1" /> Tambah Baris
          </Button>

          {invalidRows.length > 0 && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {invalidRows.length} kode tidak ditemukan
            </div>
          )}

          {validRows.length > 0 && (
            <div className="bg-muted p-3 rounded-lg text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validRows.length} item
                </Badge>
                <span className="text-muted-foreground">
                  Total: <strong>{validRows.reduce((s, r) => s + r.qty, 0)}</strong> pcs
                </span>
              </div>
              <span className="font-bold text-primary">{formatRp(totalCost)}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || validRows.length === 0}
            className="w-full rounded-xl h-12 text-base font-bold shadow-md"
          >
            {submitting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
            {submitting ? "Menyimpan..." : `Simpan ${validRows.length} Pesanan`}
          </Button>
        </CardContent>
      </Card>

      {/* Pending Orders List */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-warning/10">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Pesanan Pending</h3>
              <p className="text-xs text-muted-foreground">Belum diterima / masih dalam perjalanan</p>
            </div>
          </div>

          {loadingPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Belum ada pesanan pending</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingOrders.map(order => (
                <div key={order.id} className="rounded-xl border border-border/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {new Date(order.ordered_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </Badge>
                      {order.notes && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{order.notes}</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 rounded-lg"
                      onClick={() => markReceived(order.id)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Diterima
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {order.items.map((item, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                        {item.kode} × {item.qty}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
