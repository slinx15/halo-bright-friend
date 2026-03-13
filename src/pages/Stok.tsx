import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Package, Search, AlertTriangle, TrendingUp, BoxIcon, ShieldAlert, Loader2, Trash2 } from "lucide-react";
import { formatNumber, formatRupiah, getStockStatus, getStockStatusColor } from "@/lib/formatters";
import { StokSkeleton } from "@/components/LoadingSkeletons";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { useIsMobile } from "@/hooks/use-mobile";
import { Progress } from "@/components/ui/progress";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PAGE_SIZE = 30;

function getAuthHeaders() {
  const storageKey = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
  let token = SUPABASE_KEY;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.access_token || SUPABASE_KEY;
    }
  } catch {}
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${token}`,
    "Prefer": "return=minimal",
  };
}

const Stok = () => {
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isMobile = useIsMobile();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    products?.filter(
      (p) =>
        p.kode.toLowerCase().includes(search.toLowerCase()) ||
        p.nama.toLowerCase().includes(search.toLowerCase())
    ) ?? [],
    [products, search]
  );

  const visibleItems = useMemo(() =>
    filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const hasMore = visibleCount < filtered.length;

  // Reset visible count when search changes
  const handleSearch = (val: string) => {
    setSearch(val);
    setVisibleCount(PAGE_SIZE);
  };

  // Infinite scroll with IntersectionObserver
  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length));
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
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const totalItems = filtered.length;
  const totalStok = filtered.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0);
  const kosong = filtered.filter((p) => (p.stock?.jumlah ?? 0) === 0).length;
  const kritis = filtered.filter((p) => { const j = p.stock?.jumlah ?? 0; return j > 0 && j <= 5; }).length;
  const warning = filtered.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length;
  const nilaiStok = filtered.reduce((sum, p) => {
    const jumlah = p.stock?.jumlah ?? 0;
    const modal = p.prices?.harga_modal ?? 0;
    return sum + (jumlah * modal);
  }, 0);

  if (isLoading) return <StokSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Premium Header ── */}
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 shadow-sm">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-xl font-extrabold tracking-tight leading-tight">Manajemen Stok</h1>
          <p className="text-muted-foreground text-xs font-medium">
            {formatNumber(totalItems)} produk · {formatNumber(totalStok)} total pcs
          </p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="card-premium bg-primary/5 p-3.5 transition-all duration-150 md:hover:shadow-md md:hover:-translate-y-[1px]">
          <div className="flex items-center gap-2 mb-1.5">
            <BoxIcon className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Stok</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{formatNumber(totalStok)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(totalItems)} SKU</p>
        </div>
        <div className="card-premium bg-success/5 p-3.5 transition-all duration-150 md:hover:shadow-md md:hover:-translate-y-[1px]">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Nilai Stok</span>
          </div>
          <p className="text-xl font-extrabold tabular-nums text-success truncate">{formatRupiah(nilaiStok)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Berdasarkan harga modal</p>
        </div>
        <div className="card-premium bg-warning/5 p-3.5 transition-all duration-150 md:hover:shadow-md md:hover:-translate-y-[1px]">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Warning</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{warning}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Stok 6–15 pcs</p>
        </div>
        <div className="card-premium bg-destructive/5 p-3.5 transition-all duration-150 md:hover:shadow-md md:hover:-translate-y-[1px]">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Kritis / Kosong</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-destructive">{kritis + kosong}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{kosong} kosong · {kritis} kritis</p>
        </div>
      </div>

      {/* ── Daftar Stok ── */}
      <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Daftar Stok
              <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">{totalItems}</Badge>
            </CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 rounded-xl h-10" placeholder="Cari kode / nama..." value={search} onChange={(e) => handleSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="space-y-2.5">
              {visibleItems.length === 0 && (
                <div className="py-10 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Tidak ada data</p>
                </div>
              )}
              {visibleItems.map((p) => {
                const jumlah = p.stock?.jumlah ?? 0;
                const status = getStockStatus(jumlah);
                const stacks = (p.stock?.tumpukan_detail as number[]) ?? [];
                const pct = Math.min((jumlah / 50) * 100, 100);
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3.5 space-y-2 transition-all duration-200 active:scale-[0.98] bg-card ${
                      status === "kritis" ? "border-l-[3px] border-l-destructive border-border/60" :
                      status === "warning" ? "border-l-[3px] border-l-warning border-border/60" :
                      "border-border/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-sm">{p.kode}</span>
                        <Badge variant="secondary" className={`text-[10px] rounded-full px-2 ${getStockStatusColor(status)}`}>
                          {status === "kritis" ? "🔴 Kritis" : status === "warning" ? "🟡 Warning" : "🟢 Aman"}
                        </Badge>
                      </div>
                      <span className="font-extrabold text-lg tabular-nums">{formatNumber(jumlah)}</span>
                    </div>
                    <Progress
                      value={pct}
                      className={`h-1.5 rounded-full ${
                        status === "kritis" ? "[&>div]:bg-destructive" :
                        status === "warning" ? "[&>div]:bg-warning" :
                        "[&>div]:bg-success"
                      }`}
                    />
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Modal</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Normal</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Grosir</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</p>
                      </div>
                    </div>
                    {stacks.length > 0 && (
                      <div className="text-xs">
                        <TumpukanBadges stacks={stacks} kode={p.kode} compact />
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
                    <TableHead className="text-right font-bold">Modal</TableHead>
                    <TableHead className="text-right font-bold">Normal</TableHead>
                    <TableHead className="text-right font-bold">Grosir</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((p, idx) => {
                    const jumlah = p.stock?.jumlah ?? 0;
                    const status = getStockStatus(jumlah);
                    const stacks = (p.stock?.tumpukan_detail as number[]) ?? [];
                    return (
                      <TableRow key={p.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                        <TableCell className="font-mono font-bold text-sm">{p.kode}</TableCell>
                        <TableCell className="text-sm">{p.nama}</TableCell>
                        <TableCell className="text-right font-extrabold tabular-nums text-base">{formatNumber(jumlah)}</TableCell>
                        <TableCell><TumpukanBadges stacks={stacks} kode={p.kode} /></TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${getStockStatusColor(status)} rounded-full text-xs`}>
                            {status === "kritis" ? "🔴 Kritis" : status === "warning" ? "🟡 Warning" : "🟢 Aman"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Tidak ada data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="py-4 flex justify-center">
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