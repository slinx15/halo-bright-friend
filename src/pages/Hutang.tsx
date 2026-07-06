import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import {
  createDebtItem,
  getDebtItems,
  getDebtLimit,
  getDebtSummary,
  markDebtsPaid,
  normalizeInvoiceNumber,
  saveDebtItems,
  setDebtLimit,
  type DebtItem,
} from "@/lib/hutangStore";
import { cn } from "@/lib/utils";
import { AlertTriangle, Banknote, CheckCircle2, Plus, ShieldAlert, Wallet } from "lucide-react";
import { HutangOcrUpload, type DebtDraft } from "@/components/hutang/HutangOcrUpload";
import { FakturUpload, type FakturDraft } from "@/components/hutang/FakturUpload";
import { useToast } from "@/hooks/use-toast";

const initialForm = {
  invoiceNumber: "",
  amount: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  note: "",
};

export default function Hutang() {
  const { toast } = useToast();
  const [items, setItems] = useState<DebtItem[]>([]);
  const [limit, setLimitState] = useState(getDebtLimit());
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState<string[]>([]);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const refresh = () => {
    setItems(getDebtItems());
    setLimitState(getDebtLimit());
  };

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const summary = useMemo(() => getDebtSummary(items), [items]);
  const openItems = useMemo(() => items.filter((item) => item.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [items]);
  const paidItems = useMemo(() => items.filter((item) => item.status === "paid").sort((a, b) => b.paidAt!.localeCompare(a.paidAt!)), [items]);
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

  const addFromFaktur = (drafts: FakturDraft[], sourceImages: string[]) => {
    const current = getDebtItems();
    const created = drafts.map((draft) =>
      createDebtItem({
        invoiceNumber: draft.invoiceNumber || `FAKTUR-${Date.now()}`,
        amount: draft.amount,
        invoiceDate: draft.invoiceDate || new Date().toISOString().slice(0, 10),
        note: draft.note,
        sourceImage: sourceImages[0] || null,
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
    setPaymentOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:space-y-5 md:p-6 md:pb-6">
      <PageHeader
        icon={Wallet}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Hutang Ivory"
        subtitle="Kelola bon supplier, lunas, dan riwayat"
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap">
              <HutangOcrUpload onResult={addFromOcr} />
              <FakturUpload onResult={addFromFaktur} />
            </div>
          </div>
        }
      />

      <Card className="card-premium overflow-hidden rounded-2xl">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle className="text-sm font-semibold">Tambah Bon Baru</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 px-4 pb-4 pt-1 sm:grid-cols-2">
          <Button
            className="h-12 rounded-2xl font-bold"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Tambah dari Faktur
          </Button>
          <Button
            variant="secondary"
            className="h-12 rounded-2xl font-bold"
            onClick={() => {
              document.getElementById("input-bon-manual")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Input Manual
          </Button>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
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

      <Card className="card-premium overflow-hidden rounded-2xl" id="input-bon-manual">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-2.5 pb-2">
          <CardTitle className="text-sm font-semibold">Bon Aktif</CardTitle>
          <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-bold">
            Tap untuk pilih
          </Badge>
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
                className={cn("w-full rounded-2xl border p-3 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-card")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">{item.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{item.invoiceDate}</p>
                    <p className={cn("mt-1 text-[11px]", item.note.toLowerCase().includes("lunas") ? "font-semibold text-warning" : "text-muted-foreground")}>
                      {item.note ? item.note : "Tanpa catatan"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold tabular-nums">{formatRupiah(item.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{isSelected ? "dipilih" : "ketuk untuk pilih"}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="card-premium overflow-hidden rounded-2xl" id="pembayaran-bon">
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
            <Input value={form.invoiceNumber} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} placeholder="No faktur / bon" className="h-11 rounded-xl font-mono" />
            <Input type="date" value={form.invoiceDate} onChange={(e) => setForm((prev) => ({ ...prev, invoiceDate: e.target.value }))} className="h-11 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
            <Textarea value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Catatan, misalnya: lunas / koreksi / tambahan" className="min-h-[88px] rounded-xl" />
            <Input type="text" inputMode="numeric" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Nominal" className="h-11 rounded-xl text-right font-semibold tabular-nums" />
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
            Buka daftar bon aktif
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-1">
          <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 w-full rounded-xl font-bold">
                Buka Bon Aktif ({openItems.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-hidden rounded-3xl p-0 sm:max-w-2xl">
              <div className="flex max-h-[85vh] flex-col">
                <DialogHeader className="border-b border-border/60 px-4 py-4">
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Banknote className="h-4 w-4 text-primary" />
                    Pembayaran Bon
                  </DialogTitle>
                  <DialogDescription>
                    Pilih bon aktif yang sudah dibayar, lalu tandai lunas.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 overflow-y-auto px-4 py-4">
                  <Textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Catatan pembayaran" className="min-h-[72px] rounded-xl" />
                  <div className="space-y-2">
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
                          className={cn("w-full rounded-2xl border p-3 text-left transition-all", isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-card")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-bold">{item.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground">{item.invoiceDate}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{item.note ? item.note : "Tanpa catatan"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-extrabold tabular-nums">{formatRupiah(item.amount)}</p>
                              <p className="text-[11px] text-muted-foreground">{isSelected ? "dipilih" : "ketuk untuk pilih"}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-border/60 px-4 py-4">
                  <Button onClick={paySelected} disabled={selected.length === 0} className="h-11 w-full rounded-xl font-bold">
                    Tandai Lunas ({selected.length})
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            variant="ghost"
            className="h-10 w-full rounded-xl text-xs font-semibold"
            onClick={() => {
              const el = document.getElementById("riwayat-lunas");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Lihat Riwayat
          </Button>
        </CardContent>
      </Card>

      <Card className="card-premium overflow-hidden rounded-2xl" id="riwayat-lunas">
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
