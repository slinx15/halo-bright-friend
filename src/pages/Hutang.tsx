import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import {
  createDebtItem,
  createSupplierSnapshot,
  ensureDefaultIvoryDebtData,
  getDebtItems,
  getDebtLimit,
  getDebtSummary,
  getSupplierSnapshots,
  markDebtsPaid,
  normalizeInvoiceNumber,
  saveDebtItems,
  saveSupplierSnapshot,
  setDebtLimit,
  type DebtItem,
  type SupplierSnapshot,
} from "@/lib/hutangStore";
import { cn } from "@/lib/utils";
import { AlertTriangle, Banknote, CheckCircle2, Plus, ShieldAlert, Wallet } from "lucide-react";
import { HutangOcrUpload, type DebtDraft } from "@/components/hutang/HutangOcrUpload";
import { useToast } from "@/hooks/use-toast";

const SAMPLE_SNAPSHOT = [
  { invoiceNumber: "090626002", amount: 6435000, invoiceDate: "2026-06-09", note: "" },
  { invoiceNumber: "190626003", amount: 3690750, invoiceDate: "2026-06-19", note: "" },
  { invoiceNumber: "230626002", amount: 3653000, invoiceDate: "2026-06-23", note: "" },
  { invoiceNumber: "230626003", amount: 3784000, invoiceDate: "2026-06-23", note: "" },
  { invoiceNumber: "260626003", amount: 2035000, invoiceDate: "2026-06-26", note: "" },
  { invoiceNumber: "260626004", amount: 6667250, invoiceDate: "2026-06-26", note: "" },
  { invoiceNumber: "300626003", amount: 6275324, invoiceDate: "2026-06-30", note: "" },
  { invoiceNumber: "300626004", amount: 6718800, invoiceDate: "2026-06-30", note: "" },
];

const initialForm = {
  invoiceNumber: "",
  amount: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  note: "",
};

export default function Hutang() {
  const { toast } = useToast();
  const [items, setItems] = useState<DebtItem[]>([]);
  const [snapshots, setSnapshots] = useState<SupplierSnapshot[]>([]);
  const [limit, setLimitState] = useState(getDebtLimit());
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState<string[]>([]);
  const [paymentNote, setPaymentNote] = useState("");

  const refresh = () => {
    setItems(getDebtItems());
    setSnapshots(getSupplierSnapshots());
    setLimitState(getDebtLimit());
  };

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const snapshot = createSupplierSnapshot({
      label: "Snapshot supplier contoh - 30 Juni 2026",
      items: SAMPLE_SNAPSHOT.map((item) => ({
        ...item,
        sourceType: "snapshot" as const,
      })),
    });
    const snapshotItems = snapshot.items.map((item) =>
      createDebtItem({
        invoiceNumber: item.invoiceNumber,
        amount: item.amount,
        invoiceDate: item.invoiceDate,
        note: item.note,
        sourceType: "snapshot",
      }),
    );
    ensureDefaultIvoryDebtData(snapshot, snapshotItems);
    refresh();
  }, []);

  const summary = useMemo(() => getDebtSummary(items), [items]);
  const openItems = useMemo(() => items.filter((item) => item.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [items]);
  const paidItems = useMemo(() => items.filter((item) => item.status === "paid").sort((a, b) => b.paidAt!.localeCompare(a.paidAt!)), [items]);
  const latestSnapshot = snapshots[0] || null;
  const limitLeft = Math.max(0, limit - summary.openDebt);

  const addManualDebt = () => {
    const amount = Number(form.amount);
    if (!form.invoiceNumber.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Error", description: "Nomor bon dan nominal wajib diisi", variant: "destructive" });
      return;
    }
    const item = createDebtItem({
      invoiceNumber: normalizeInvoiceNumber(form.invoiceNumber),
      amount,
      invoiceDate: form.invoiceDate,
      note: form.note,
    });
    saveDebtItems([item, ...getDebtItems()]);
    setForm(initialForm);
    refresh();
    toast({ title: "Bon ditambahkan", description: `${item.invoiceNumber} tersimpan` });
  };

  const addFromOcr = (drafts: DebtDraft[], sourceImage: string) => {
    const current = getDebtItems();
    const created = drafts.map((draft) =>
      createDebtItem({
        invoiceNumber: draft.invoiceNumber || `BON-${Date.now()}`,
        amount: draft.amount,
        invoiceDate: draft.invoiceDate || new Date().toISOString().slice(0, 10),
        note: draft.note,
        sourceImage: sourceImage || null,
        sourceType: "ocr",
      }),
    );
    saveDebtItems([...created, ...current]);
    refresh();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const paySelected = () => {
    if (selected.length === 0) {
      toast({ title: "Pilih bon", description: "Pilih minimal satu bon untuk dibayar", variant: "destructive" });
      return;
    }
    const targetItems = items.filter((item) => selected.includes(item.id) && item.status === "open");
    if (targetItems.length === 0) return;

    const total = targetItems.reduce((sum, item) => sum + item.amount, 0);
    markDebtsPaid(selected, paymentNote);
    setSelected([]);
    setPaymentNote("");
    refresh();
    toast({ title: "Pembayaran tersimpan", description: `${formatRupiah(total)} dilunasi` });
  };

  const addSampleSnapshot = () => {
    const snapshot = createSupplierSnapshot({
      label: "Snapshot supplier contoh - 30 Juni 2026",
      items: SAMPLE_SNAPSHOT.map((item) => ({
        ...item,
        sourceType: "snapshot" as const,
      })),
    });
    saveSupplierSnapshot(snapshot);
    const snapshotItems = snapshot.items.map((item) =>
      createDebtItem({
        invoiceNumber: item.invoiceNumber,
        amount: item.amount,
        invoiceDate: item.invoiceDate,
        note: item.note,
        sourceType: "snapshot",
      }),
    );
    saveDebtItems([...snapshotItems, ...getDebtItems()]);
    refresh();
    toast({ title: "Snapshot disimpan", description: "Contoh bon supplier sudah masuk" });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:space-y-5 md:p-6 md:pb-6">
      <PageHeader
        icon={Wallet}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Hutang Ivory"
        subtitle="Kelola bon supplier, status lunas, dan riwayat pembayaran"
        actions={
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limit</span>
              <Input
                type="number"
                value={limit}
                onChange={(e) => {
                  const next = Number(e.target.value || 0);
                  setLimitState(next);
                  setDebtLimit(next);
                  refresh();
                }}
                className="h-9 w-32 rounded-xl text-sm font-semibold"
              />
            </div>
            <HutangOcrUpload onResult={addFromOcr} />
            <Button variant="secondary" size="sm" onClick={addSampleSnapshot} className="min-h-[44px] rounded-xl">
              Pakai Bon Contoh
            </Button>
          </div>
        }
      />

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3 pb-2">
          <CardTitle className="text-sm font-semibold">Foto Bon Supplier Terbaru</CardTitle>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-bold">
            {snapshots.length} riwayat
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-1">
          {latestSnapshot ? (
            <>
              <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{latestSnapshot.label}</span>
                  <span>•</span>
                  <span>{new Date(latestSnapshot.createdAt).toLocaleString("id-ID")}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {latestSnapshot.items.map((item) => (
                  <div key={`${item.invoiceNumber}-${item.invoiceDate}`} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                    <p className="font-mono text-xs font-bold">{item.invoiceNumber}</p>
                    <p className="mt-1 text-sm font-extrabold tabular-nums">{formatRupiah(item.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{item.invoiceDate}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
              Belum ada snapshot supplier
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="card-premium bg-primary/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Hutang</span>
          </div>
          <p className="text-lg font-extrabold tabular-nums">{formatRupiah(summary.totalDebt)}</p>
        </div>
        <div className="card-premium bg-success/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lunas</span>
          </div>
          <p className="text-lg font-extrabold tabular-nums">{formatRupiah(summary.totalPaid)}</p>
        </div>
        <div className="card-premium bg-warning/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sisa Limit</span>
          </div>
          <p className="text-lg font-extrabold tabular-nums">{formatRupiah(limitLeft)}</p>
        </div>
        <div className="card-premium bg-destructive/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bon Aktif</span>
          </div>
          <p className="text-lg font-extrabold tabular-nums">{formatNumber(summary.activeCount)}</p>
        </div>
      </section>

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4 text-primary" />
            Input Bon Manual
          </CardTitle>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-bold">
            Untuk koreksi cepat
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              value={form.invoiceNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
              placeholder="No faktur / bon"
              className="h-11 rounded-xl font-mono"
            />
            <Input
              type="date"
              value={form.invoiceDate}
              onChange={(e) => setForm((prev) => ({ ...prev, invoiceDate: e.target.value }))}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
            <Textarea
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Catatan, misalnya: lunas / koreksi / tambahan"
              className="min-h-[88px] rounded-xl"
            />
            <Input
              type="text"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Nominal"
              className="h-11 rounded-xl text-right font-semibold tabular-nums"
            />
          </div>
          <Button onClick={addManualDebt} className="h-11 w-full rounded-xl font-bold">
            Simpan Bon
          </Button>
        </CardContent>
      </Card>

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Banknote className="h-4 w-4 text-primary" />
            Pembayaran Bon
          </CardTitle>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-bold">
            Pilih bon yang sudah dibayar
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-1">
          <Textarea
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            placeholder="Catatan pembayaran"
            className="min-h-[72px] rounded-xl"
          />
          <Button onClick={paySelected} disabled={selected.length === 0} className="h-11 w-full rounded-xl font-bold">
            Tandai Lunas ({selected.length})
          </Button>
        </CardContent>
      </Card>

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle className="text-sm font-semibold">Bon Aktif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-1">
          {openItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
              Belum ada bon aktif
            </div>
          )}
          {openItems.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition-all",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">{item.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{item.invoiceDate}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        item.note.toLowerCase().includes("lunas") ? "font-semibold text-warning" : "text-muted-foreground",
                      )}
                    >
                      {item.note ? item.note : item.sourceType === "snapshot" ? "Snapshot supplier" : "Tanpa catatan"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold tabular-nums">{formatRupiah(item.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.sourceType === "snapshot" ? "dari foto supplier" : isSelected ? "dipilih" : "ketuk untuk pilih"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle className="text-sm font-semibold">Riwayat Lunas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-1">
          {paidItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
              Belum ada bon lunas
            </div>
          )}
          {paidItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-warning/30 bg-warning/5 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold">{item.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">Lunas: {item.paidAt ? new Date(item.paidAt).toLocaleString("id-ID") : "-"}</p>
                </div>
                <Badge className="rounded-full bg-warning text-warning-foreground">Kuning / Lunas</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold tabular-nums">{formatRupiah(item.amount)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
