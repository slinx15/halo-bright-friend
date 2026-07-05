import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, Database, History, Loader2, RefreshCw, Scale, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import {
  buildStockReconciliationRows,
  summarizeStockReconciliation,
  type ReconciliationOpnameRow,
  type ReconciliationProductRow,
  type ReconciliationStockInRow,
  type ReconciliationStockOutRow,
  type ReconciliationStockRow,
  type StockReconciliationRow,
} from "@/lib/stockReconciliation";

const PAGE_SIZE = 1000;

type FilterMode = "selisih" | "sinkron" | "all";

function formatDateTime(date: string | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

async function fetchActiveProducts() {
  const rows: ReconciliationProductRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id,kode,nama,kategori,is_active")
      .eq("is_active", true)
      .order("kode", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as ReconciliationProductRow[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchStocks() {
  const rows: ReconciliationStockRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("stock")
      .select("product_id,jumlah,updated_at")
      .order("updated_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as ReconciliationStockRow[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchStockInHistory() {
  const rows: ReconciliationStockInRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("stock_in")
      .select("product_id,qty,created_at")
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as ReconciliationStockInRow[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchStockOutHistory() {
  const rows: ReconciliationStockOutRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("stock_out")
      .select("product_id,qty_kirim,created_at")
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as ReconciliationStockOutRow[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchOpnameHistory() {
  const rows: ReconciliationOpnameRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("stock_opname_log")
      .select("product_id,stok_fisik,stok_sistem,selisih,created_at,status")
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as ReconciliationOpnameRow[]));

    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

function statusBadgeClass(status: StockReconciliationRow["status"]) {
  return status === "selisih"
    ? "bg-destructive/10 text-destructive border-destructive/25"
    : "bg-success/10 text-success border-success/25";
}

function differenceClass(row: StockReconciliationRow) {
  if (row.difference === 0) {
    return "text-success bg-success/10 border-success/20";
  }

  if (row.absDifference >= 5) {
    return "text-destructive bg-destructive/10 border-destructive/20";
  }

  return "text-warning bg-warning/10 border-warning/20";
}

const RekonsiliasiStok = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("selisih");

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["stock-reconciliation-dataset"],
    queryFn: async () => {
      const [products, stocks, stockIns, stockOuts, opnames] = await Promise.all([
        fetchActiveProducts(),
        fetchStocks(),
        fetchStockInHistory(),
        fetchStockOutHistory(),
        fetchOpnameHistory(),
      ]);

      return { products, stocks, stockIns, stockOuts, opnames };
    },
    enabled: role === "admin",
  });

  const rows = useMemo(() => {
    if (!data) return [];

    return buildStockReconciliationRows({
      products: data.products,
      stocks: data.stocks,
      stockIns: data.stockIns,
      stockOuts: data.stockOuts,
      opnames: data.opnames,
    });
  }, [data]);

  const summary = useMemo(() => summarizeStockReconciliation(rows), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesFilter =
        filterMode === "all" ||
        (filterMode === "selisih" && row.status === "selisih") ||
        (filterMode === "sinkron" && row.status === "sinkron");

      if (!matchesFilter) return false;

      if (!term) return true;

      return [row.kode, row.nama, row.kategori, row.reason, ...row.flags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [filterMode, rows, search]);

  if (role !== "admin") {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
        <PageHeader
          title="Rekonsiliasi Stok"
          icon={Scale}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          subtitle="Bandingkan stok current dengan histori mutasi"
        />
        <Card className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-semibold">Halaman ini hanya untuk admin.</p>
          <p className="text-sm text-muted-foreground mt-1">Login sebagai admin untuk memeriksa sinkronisasi stok.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-5 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Rekonsiliasi Stok"
          icon={Scale}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          subtitle="Bandingkan stok current dengan histori mutasi"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/audit-stok")}>
            <History className="h-4 w-4 mr-2" />
            Audit Stok
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/opname")}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Buka Opname
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Muat Ulang
          </Button>
        </div>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/15">
        <p className="text-sm font-semibold text-foreground">Cara hitung tool ini</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Jika produk sudah pernah opname, stok histori dihitung dari stok fisik opname terakhir + barang masuk setelah opname - barang keluar setelah opname.
          Jika belum pernah opname, stok histori dihitung dari total barang masuk - total barang keluar sejak awal histori.
        </p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card className="p-3.5 bg-primary/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Produk Aktif</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{formatNumber(summary.totalProducts)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Produk yang discan</p>
        </Card>
        <Card className="p-3.5 bg-destructive/5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Selisih</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-destructive">{formatNumber(summary.mismatchCount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Perlu pengecekan</p>
        </Card>
        <Card className="p-3.5 bg-warning/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Scale className="h-4 w-4 text-warning" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Deviasi</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-warning">{formatNumber(summary.totalAbsoluteDifference)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Akumulasi selisih absolut</p>
        </Card>
        <Card className="p-3.5 bg-muted/40">
          <div className="flex items-center gap-2 mb-1.5">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Belum Opname</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{formatNumber(summary.withoutOpnameCount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Masih pakai histori penuh</p>
        </Card>
      </div>

      {summary.historylessStockCount > 0 && (
        <Card className="p-4 border-warning/25 bg-warning/5">
          <p className="text-sm font-semibold text-warning">Ada stok current tanpa histori mutasi</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatNumber(summary.historylessStockCount)} produk punya stok current, tetapi tool tidak menemukan histori masuk, keluar, atau opname.
            Ini biasanya tanda ada edit manual lama atau histori yang belum lengkap.
          </p>
        </Card>
      )}

      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl h-10"
              placeholder="Cari kode, nama, kategori, atau alasan selisih..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={filterMode} onValueChange={(value: FilterMode) => setFilterMode(value)}>
            <SelectTrigger className="w-full lg:w-[190px] rounded-xl h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selisih">Hanya Selisih</SelectItem>
              <SelectItem value="sinkron">Hanya Sinkron</SelectItem>
              <SelectItem value="all">Semua Produk</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Menampilkan {formatNumber(filteredRows.length)} dari {formatNumber(summary.totalProducts)} produk aktif.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive/70" />
          <p className="font-semibold">Gagal memuat rekonsiliasi stok</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Coba muat ulang halaman."}
          </p>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Scale className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">Tidak ada produk untuk filter ini</p>
          <p className="text-sm">
            {filterMode === "selisih"
              ? "Semua produk aktif yang discan saat ini sinkron."
              : "Coba ganti filter atau kata pencarian."}
          </p>
        </Card>
      ) : (
        <>
          <div className="hidden lg:block rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[1160px]">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Produk</TableHead>
                    <TableHead className="text-right font-bold w-[90px]">Sistem</TableHead>
                    <TableHead className="text-right font-bold w-[90px]">Histori</TableHead>
                    <TableHead className="text-right font-bold w-[100px]">Selisih</TableHead>
                    <TableHead className="font-bold w-[135px]">Status</TableHead>
                    <TableHead className="font-bold w-[220px]">Baseline</TableHead>
                    <TableHead className="font-bold w-[130px]">Masuk / Keluar</TableHead>
                    <TableHead className="font-bold w-[130px]">Mutasi Terakhir</TableHead>
                    <TableHead className="font-bold min-w-[280px]">Petunjuk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, index) => (
                    <TableRow key={row.productId} className={cn(index % 2 === 0 ? "" : "bg-muted/15", row.status === "selisih" && "bg-destructive/[0.03]")}>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm">{row.kode}</span>
                            {row.kategori && (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {row.kategori}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">{row.nama}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatNumber(row.currentStock)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatNumber(row.expectedStock)}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums", differenceClass(row))}>
                          {row.difference > 0 ? "+" : ""}
                          {formatNumber(row.difference)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", statusBadgeClass(row.status))}>
                          {row.status === "selisih" ? "Perlu Cek" : "Sinkron"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground leading-relaxed">
                        <div>{row.baselineSource === "opname" ? "Opname terakhir" : "Awal histori"}</div>
                        <div>{formatDateTime(row.baselineAt)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground leading-relaxed">
                        <div>+ {formatNumber(row.totalInSinceBaseline)}</div>
                        <div>- {formatNumber(row.totalOutSinceBaseline)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground leading-relaxed">
                        <div>{formatDateTime(row.latestMutationAt)}</div>
                        <div>Stock row: {formatDateTime(row.stockUpdatedAt)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-xs text-foreground">{row.reason}</p>
                          <div className="flex flex-wrap gap-1">
                            {row.flags.map((flag) => (
                              <Badge key={`${row.productId}-${flag}`} variant="secondary" className="text-[10px] rounded-full px-2">
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="lg:hidden space-y-2.5">
            {filteredRows.map((row) => (
              <Card key={row.productId} className={cn("p-3.5 space-y-3", row.status === "selisih" && "border-destructive/25 bg-destructive/[0.03]")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-sm truncate">{row.kode}</span>
                      {row.kategori && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {row.kategori}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{row.nama}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 shrink-0", statusBadgeClass(row.status))}>
                    {row.status === "selisih" ? "Perlu Cek" : "Sinkron"}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/35 px-3 py-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Sistem</p>
                    <p className="text-lg font-extrabold tabular-nums">{formatNumber(row.currentStock)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Histori</p>
                    <p className="text-lg font-extrabold tabular-nums">{formatNumber(row.expectedStock)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Selisih</p>
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums mt-1", differenceClass(row))}>
                      {row.difference > 0 ? "+" : ""}
                      {formatNumber(row.difference)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div className="rounded-lg bg-muted/30 px-2.5 py-2">
                    <p className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Baseline</p>
                    <p>{row.baselineSource === "opname" ? "Opname terakhir" : "Awal histori"}</p>
                    <p>{formatDateTime(row.baselineAt)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-2.5 py-2">
                    <p className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Mutasi</p>
                    <p>Masuk: {formatNumber(row.totalInSinceBaseline)}</p>
                    <p>Keluar: {formatNumber(row.totalOutSinceBaseline)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-foreground">{row.reason}</p>
                  <div className="flex flex-wrap gap-1">
                    {row.flags.map((flag) => (
                      <Badge key={`${row.productId}-${flag}`} variant="secondary" className="text-[10px] rounded-full px-2">
                        {flag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default RekonsiliasiStok;
