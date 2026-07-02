import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  BoxIcon,
  Download,
  Loader2,
  Package,
  Search,
  ShieldAlert,
  TrendingUp,
  Trash2,
} from "lucide-react";

import { useProducts } from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StokSkeleton } from "@/components/LoadingSkeletons";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { useIsMobile } from "@/hooks/use-mobile";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatNumber, formatRupiah, getStockStatus, getStockStatusColor } from "@/lib/formatters";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage } from "@/lib/errors";
import { logActivity } from "@/lib/activityLogger";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

const PAGE_SIZE = 30;

const Stok = () => {
  const { data: products, isLoading } = useProducts();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const initialKategori = searchParams.get("kategori") || "Semua";
  const initialStatus = searchParams.get("status") || "semua";
  const [kategoriFilter, setKategoriFilter] = useState<string>(initialKategori);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const isMobile = useIsMobile();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const paramKategori = searchParams.get("kategori");
    const paramStatus = searchParams.get("status");
    if (paramKategori) {
      setKategoriFilter(paramKategori);
      setVisibleCount(PAGE_SIZE);
    }
    if (paramStatus) {
      setStatusFilter(paramStatus);
      setVisibleCount(PAGE_SIZE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);



  const exportStokToExcel = () => {
    if (!products || products.length === 0) return;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rows = products.map((product) => ({
      Kode: product.kode,
      Nama: product.nama,
      Kategori: product.kategori || "",
      Stok: product.stock?.jumlah ?? 0,
      Tumpukan: product.stock?.tumpukan || "",
      "Harga Modal": product.prices?.harga_modal ?? 0,
      "Harga Normal": product.prices?.harga_normal ?? 0,
      "Harga Grosir": product.prices?.harga_grosir ?? 0,
      "Harga Grosir 2": product.prices?.harga_grosir2 ?? 0,
      "Nilai Stok": (product.stock?.jumlah ?? 0) * (product.prices?.harga_modal ?? 0),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const firstRow = rows[0];
    const columns = Object.keys(firstRow) as Array<keyof typeof firstRow>;
    ws["!cols"] = columns.map((key) => ({
      wch: Math.max(String(key).length, ...rows.map((row) => String(row[key]).length)) + 2,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok");
    XLSX.writeFile(wb, `backup-stok-${dateStr}.xlsx`);
    toast({ title: "Export berhasil", description: `File backup-stok-${dateStr}.xlsx telah diunduh` });
  };

  const handleResetStock = async () => {
    if (resetConfirmText.trim().toUpperCase() !== "RESET") return;
    setResetting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock?id=neq.00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ jumlah: 0, tumpukan: "", tumpukan_detail: [] }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      await logActivity("stock_reset", "Reset semua stok ke 0", { scope: "all_stock" });
      toast({ title: "Berhasil", description: "Semua stok telah di-reset ke 0" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowResetDialog(false);
      setResetConfirmText("");
    } catch (err: unknown) {
      toast({ title: "Error", description: getErrorMessage(err), variant: "destructive" });
    }
    setResetting(false);
  };

  const kategoriList = useMemo(() => {
    const cats = new Set<string>();
    products?.forEach((product) => {
      if (product.kategori) cats.add(product.kategori);
    });
    return ["Semua", ...Array.from(cats).sort()];
  }, [products]);

  const filtered = useMemo(
    () =>
      products?.filter((product) => {
        const matchSearch =
          !search ||
          product.kode.toLowerCase().includes(search.toLowerCase()) ||
          product.nama.toLowerCase().includes(search.toLowerCase());
        const matchKategori = kategoriFilter === "Semua" || product.kategori === kategoriFilter;
        const jumlah = product.stock?.jumlah ?? 0;
        let matchStatus = true;
        if (statusFilter === "kosong") matchStatus = jumlah === 0;
        else if (statusFilter === "kritis") matchStatus = jumlah > 0 && jumlah <= 5;
        else if (statusFilter === "warning") matchStatus = getStockStatus(jumlah) === "warning";
        else if (statusFilter === "aman") matchStatus = getStockStatus(jumlah) === "aman";
        return matchSearch && matchKategori && matchStatus;
      }) ?? [],
    [products, search, kategoriFilter, statusFilter],
  );


  const visibleItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const handleSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(PAGE_SIZE);
  };

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const totalItems = filtered.length;
  const totalStok = filtered.reduce((sum, product) => sum + (product.stock?.jumlah ?? 0), 0);
  const kosong = filtered.filter((product) => (product.stock?.jumlah ?? 0) === 0).length;
  const kritis = filtered.filter((product) => {
    const jumlah = product.stock?.jumlah ?? 0;
    return jumlah > 0 && jumlah <= 5;
  }).length;
  const warning = filtered.filter((product) => getStockStatus(product.stock?.jumlah ?? 0) === "warning").length;
  const nilaiStok = filtered.reduce((sum, product) => {
    const jumlah = product.stock?.jumlah ?? 0;
    const modal = product.prices?.harga_modal ?? 0;
    return sum + jumlah * modal;
  }, 0);

  if (isLoading) return <StokSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 pb-32 md:space-y-5 md:p-6 md:pb-6 [&>*]:animate-fade-in [&>*]:[animation-fill-mode:both] [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms]">
      {/* HEADER — ringkas, ikon di kiri, tombol aksi compact */}
      <section className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">Manajemen Stok</h1>
            <p className="text-xs text-muted-foreground">
              {formatNumber(totalItems)} produk · {formatNumber(totalStok)} pcs
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={exportStokToExcel}
            aria-label="Export Excel"
            title="Export Excel"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => setShowResetDialog(true)}
            aria-label="Reset Stok"
            title="Reset Stok"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <Dialog
        open={showResetDialog}
        onOpenChange={(open) => {
          setShowResetDialog(open);
          if (!open) setResetConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Reset Semua Stok
            </DialogTitle>
            <DialogDescription>
              Semua jumlah stok akan di-set ke <strong>0</strong> dan data tumpukan akan dihapus. Aksi ini tidak bisa di-undo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Disarankan export backup dulu sebelum reset</p>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportStokToExcel}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download Backup Excel
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Ketik RESET untuk konfirmasi.</p>
            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET"
              disabled={resetting}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)} disabled={resetting}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetStock}
              disabled={resetting || resetConfirmText.trim().toUpperCase() !== "RESET"}
            >
              {resetting ? "Mereset..." : "Ya, Reset Semua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI CARDS — Vibrant status cards (horizontal, 3 kolom) */}
      <section className="grid grid-cols-3 gap-2.5">
        {/* Total */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BoxIcon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-foreground leading-none">{formatNumber(totalStok)}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-foreground/90">Total</p>
            <p className="text-[9px] text-muted-foreground">{formatNumber(totalItems)} SKU</p>
          </div>
        </div>

        {/* Risiko (gabung warning + kritis + kosong) */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-sm transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-destructive leading-none">{kritis + kosong + warning}</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-destructive">Risiko</p>
            <p className="text-[9px] text-muted-foreground">{kosong} kosong · {kritis + warning} tipis</p>
          </div>
        </div>

        {/* Nilai Stok — filled primary */}
        <div className="flex flex-col items-center justify-between rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
            <TrendingUp className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="my-1.5 text-center">
            <span className="text-2xl font-extrabold tabular-nums text-primary-foreground leading-none">
              {nilaiStok >= 1_000_000_000
                ? `${(nilaiStok / 1_000_000_000).toFixed(1).replace(".", ",")} M`
                : nilaiStok >= 1_000_000
                  ? `${(nilaiStok / 1_000_000).toFixed(1).replace(".", ",")} jt`
                  : nilaiStok >= 1_000
                    ? `${(nilaiStok / 1_000).toFixed(0)} rb`
                    : formatNumber(nilaiStok)}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-tight text-primary-foreground">Nilai (Rp)</p>
            <p className="text-[9px] text-primary-foreground/75">Harga modal</p>
          </div>

        </div>
      </section>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <Package className="h-4 w-4 text-primary" />
              </div>
              Daftar Stok
              <Badge variant="secondary" className="rounded-full px-2 text-[10px] font-bold">
                {totalItems}
              </Badge>
            </CardTitle>
            <div className="relative w-40 md:w-80">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-xl border-border/70 bg-card pl-8 text-xs"
                placeholder="Cari..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>


          <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-2">
              {kategoriList.map((cat) => {
                const isActive = kategoriFilter === cat;
                const count =
                  cat === "Semua"
                    ? products?.length ?? 0
                    : products?.filter((product) => product.kategori === cat).length ?? 0;

                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setKategoriFilter(cat);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(
                      "relative flex shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all duration-200",
                      isActive
                        ? "border-primary/30 bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "border-border/50 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span>{cat}</span>
                    <span
                      className={cn(
                        "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-background/80 text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {isMobile ? (
            <div className="space-y-2.5">
              {visibleItems.length === 0 && (
                <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/60 py-10 text-center">
                  <Package className="mx-auto mb-3 h-12 w-12 text-muted-foreground/20" />
                  <p className="text-sm font-medium text-muted-foreground">Tidak ada data</p>
                </div>
              )}

              {visibleItems.map((product) => {
                const jumlah = product.stock?.jumlah ?? 0;
                const status = getStockStatus(jumlah);
                const stacks = (product.stock?.tumpukan_detail as number[]) ?? [];
                const pct = Math.min((jumlah / 50) * 100, 100);
                const statusLabel =
                  status === "kritis" ? "Kritis" : status === "warning" ? "Perlu cek" : "Aman";

                return (
                  <div
                    key={product.id}
                    className="space-y-3 rounded-[1.35rem] border border-border/70 bg-card p-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] font-bold text-foreground">
                            {product.kode}
                          </span>
                          {product.kategori && (
                            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                              {product.kategori}
                            </span>
                          )}
                          <Badge variant="secondary" className={cn("rounded-full px-2.5 text-[10px]", getStockStatusColor(status))}>
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{product.nama}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-medium text-muted-foreground">Stok</p>
                        <p className="text-2xl font-extrabold text-foreground tabular-nums">{formatNumber(jumlah)}</p>
                      </div>
                    </div>

                    <Progress
                      value={pct}
                      className={cn(
                        "h-1.5 rounded-full",
                        status === "kritis"
                          ? "[&>div]:bg-destructive"
                          : status === "warning"
                            ? "[&>div]:bg-warning"
                            : "[&>div]:bg-success",
                      )}
                    />

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-xl bg-background/70 px-2.5 py-2">
                        <span className="text-muted-foreground">Normal</span>
                        <p className="mt-1 font-semibold tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_normal) : "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-background/70 px-2.5 py-2">
                        <span className="text-muted-foreground">Grosir</span>
                        <p className="mt-1 font-semibold tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_grosir) : "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-background/70 px-2.5 py-2">
                        <span className="text-muted-foreground">Grosir 2</span>
                        <p className="mt-1 font-semibold tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_grosir2) : "-"}
                        </p>
                      </div>
                    </div>

                    {stacks.length > 0 && (
                      <div className="rounded-xl bg-background/70 px-2.5 py-2.5 text-xs">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Tumpukan
                        </p>
                        <TumpukanBadges stacks={stacks} kode={product.kode} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Kode</TableHead>
                    <TableHead className="font-bold">Nama</TableHead>
                    <TableHead className="text-right font-bold">Stok</TableHead>
                    <TableHead className="font-bold">Tumpukan</TableHead>
                    <TableHead className="text-right font-bold">Normal</TableHead>
                    <TableHead className="text-right font-bold">Grosir</TableHead>
                    <TableHead className="text-right font-bold">Grosir 2</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((product, idx) => {
                    const jumlah = product.stock?.jumlah ?? 0;
                    const status = getStockStatus(jumlah);
                    const stacks = (product.stock?.tumpukan_detail as number[]) ?? [];
                    return (
                      <TableRow key={product.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                        <TableCell className="font-mono text-sm font-bold">
                          {product.kode}
                          {product.kategori && (
                            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {product.kategori}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{product.nama}</TableCell>
                        <TableCell className="text-right text-base font-extrabold tabular-nums">
                          {formatNumber(jumlah)}
                        </TableCell>
                        <TableCell><TumpukanBadges stacks={stacks} kode={product.kode} /></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_normal) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_grosir) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {product.prices ? formatRupiah(product.prices.harga_grosir2) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("rounded-full text-xs", getStockStatusColor(status))}>
                            {status === "kritis" ? "Kritis" : status === "warning" ? "Perlu cek" : "Aman"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        Tidak ada data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div ref={sentinelRef} className="flex justify-center py-4">
            {hasMore && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memuat {formatNumber(visibleCount)} dari {formatNumber(totalItems)}...</span>
              </div>
            )}
            {!hasMore && visibleItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Menampilkan semua {formatNumber(totalItems)} produk
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Stok;
