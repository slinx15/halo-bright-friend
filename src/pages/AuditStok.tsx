import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
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
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const PAGE_SIZE = 50;

type ProductSummary = {
  kode: string;
  nama: string;
  kategori: string | null;
} | null;

type StockAuditRow = Tables<"stock_audit_log"> & {
  products?: ProductSummary | ProductSummary[];
};

const EMPTY_LOGS: StockAuditRow[] = [];

type OperationFilter = "all" | "INSERT" | "UPDATE" | "DELETE";

const OPERATION_CONFIG: Record<string, { label: string; badge: string; icon: typeof Package }> = {
  INSERT: {
    label: "Stok Baru",
    badge: "bg-success/10 text-success border-success/25",
    icon: Package,
  },
  UPDATE: {
    label: "Update Stok",
    badge: "bg-primary/10 text-primary border-primary/25",
    icon: Activity,
  },
  DELETE: {
    label: "Hapus Stok",
    badge: "bg-destructive/10 text-destructive border-destructive/25",
    icon: AlertTriangle,
  },
};

function getProduct(row: StockAuditRow): ProductSummary {
  if (Array.isArray(row.products)) return row.products[0] ?? null;
  return row.products ?? null;
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatShortTime(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatStack(value: Json | null) {
  if (!Array.isArray(value) || value.length === 0) return "-";
  const items = value
    .map((item) => {
      const num = typeof item === "number" || typeof item === "string" ? Number(item) : NaN;
      return Number.isFinite(num) ? formatNumber(num) : null;
    })
    .filter(Boolean);

  if (items.length === 0) return "-";
  const text = items.join(", ");
  return text.length > 44 ? `${text.slice(0, 44)}...` : text;
}

function getDelta(row: StockAuditRow) {
  const oldQty = row.old_jumlah ?? 0;
  const newQty = row.new_jumlah ?? 0;
  return newQty - oldQty;
}

function quantityText(value: number | null) {
  return value === null ? "-" : formatNumber(value);
}

function userFallback(userId: string | null) {
  if (!userId) return "Sistem";
  return userId.slice(0, 8);
}

const AuditStok = () => {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [operation, setOperation] = useState<OperationFilter>("all");
  const [page, setPage] = useState(0);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-stock-audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, name");
      if (error) throw error;
      return data || [];
    },
    enabled: role === "admin",
  });

  const profileMap = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.user_id, profile.name]));
  }, [profiles]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["stock-audit-log", operation, page],
    queryFn: async () => {
      let query = supabase
        .from("stock_audit_log")
        .select(
          `
          id,
          stock_id,
          product_id,
          operation,
          old_jumlah,
          new_jumlah,
          old_tumpukan_detail,
          new_tumpukan_detail,
          changed_by,
          changed_at,
          products(kode,nama,kategori)
        `,
          { count: "exact" }
        )
        .order("changed_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (operation !== "all") {
        query = query.eq("operation", operation);
      }

      const { data: rows, count, error: auditError } = await query;
      if (auditError) throw auditError;

      return {
        logs: (rows || []) as StockAuditRow[],
        total: count || 0,
      };
    },
    enabled: role === "admin",
  });

  const logs = data?.logs ?? EMPTY_LOGS;
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;

    return logs.filter((row) => {
      const product = getProduct(row);
      const userName = row.changed_by ? profileMap.get(row.changed_by) : "";
      return [
        product?.kode,
        product?.nama,
        product?.kategori,
        row.operation,
        userName,
        row.changed_by,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [logs, profileMap, search]);

  const pageStats = useMemo(() => {
    return filteredLogs.reduce(
      (acc, row) => {
        const delta = getDelta(row);
        if (delta > 0) acc.naik += 1;
        if (delta < 0) acc.turun += 1;
        if (delta === 0) acc.tetap += 1;
        return acc;
      },
      { naik: 0, turun: 0, tetap: 0 }
    );
  }, [filteredLogs]);

  const getUserName = (userId: string | null) => {
    if (!userId) return "Sistem";
    return profileMap.get(userId) || userFallback(userId);
  };

  const changeClass = (delta: number) => {
    if (delta > 0) return "text-success bg-success/10 border-success/20";
    if (delta < 0) return "text-destructive bg-destructive/10 border-destructive/20";
    return "text-muted-foreground bg-muted border-border";
  };

  if (role !== "admin") {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
        <PageHeader
          title="Audit Stok"
          icon={ShieldCheck}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          subtitle="Riwayat perubahan jumlah stok"
        />
        <Card className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-semibold">Halaman ini hanya untuk admin.</p>
          <p className="text-sm text-muted-foreground mt-1">Login sebagai admin untuk melihat audit stok.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-5 max-w-[1400px] mx-auto w-full">
      <PageHeader
        title="Audit Stok"
        icon={ShieldCheck}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        subtitle="Riwayat perubahan jumlah stok"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card className="p-3.5 bg-primary/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Log</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{formatNumber(total)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Sesuai filter aktif</p>
        </Card>
        <Card className="p-3.5 bg-success/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Package className="h-4 w-4 text-success" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Stok Naik</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-success">{formatNumber(pageStats.naik)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Di halaman ini</p>
        </Card>
        <Card className="p-3.5 bg-destructive/5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Stok Turun</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-destructive">{formatNumber(pageStats.turun)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Di halaman ini</p>
        </Card>
        <Card className="p-3.5 bg-muted/40">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Per Halaman</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums">{formatNumber(filteredLogs.length)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Dari {formatNumber(PAGE_SIZE)} data</p>
        </Card>
      </div>

      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 rounded-xl h-10"
              placeholder="Cari kode, nama produk, kategori, atau user..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            value={operation}
            onValueChange={(value: OperationFilter) => {
              setOperation(value);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-full lg:w-[180px] rounded-xl h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Operasi</SelectItem>
              <SelectItem value="INSERT">Stok Baru</SelectItem>
              <SelectItem value="UPDATE">Update Stok</SelectItem>
              <SelectItem value="DELETE">Hapus Stok</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive/70" />
          <p className="font-semibold">Gagal memuat audit stok</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Coba muat ulang halaman."}
          </p>
        </Card>
      ) : filteredLogs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-foreground">Belum ada data audit</p>
          <p className="text-sm">Perubahan stok berikutnya akan tampil di halaman ini.</p>
        </Card>
      ) : (
        <>
          <div className="hidden lg:block rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold w-[150px]">Waktu</TableHead>
                    <TableHead className="font-bold">Produk</TableHead>
                    <TableHead className="font-bold w-[135px]">Operasi</TableHead>
                    <TableHead className="text-right font-bold w-[90px]">Lama</TableHead>
                    <TableHead className="text-center font-bold w-[42px]"></TableHead>
                    <TableHead className="text-right font-bold w-[90px]">Baru</TableHead>
                    <TableHead className="text-right font-bold w-[95px]">Selisih</TableHead>
                    <TableHead className="font-bold w-[220px]">Tumpukan</TableHead>
                    <TableHead className="font-bold w-[120px]">User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((row, index) => {
                    const product = getProduct(row);
                    const delta = getDelta(row);
                    const config = OPERATION_CONFIG[row.operation] || OPERATION_CONFIG.UPDATE;
                    const Icon = config.icon;

                    return (
                      <TableRow key={row.id} className={index % 2 === 0 ? "" : "bg-muted/15"}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(row.changed_at)}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm">{product?.kode || "UNKNOWN"}</span>
                              {product?.kategori && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {product.kategori}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                              {product?.nama || "Produk tidak ditemukan"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1.5 text-[10px] px-2 py-0.5", config.badge)}>
                            <Icon className="h-3.5 w-3.5" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {quantityText(row.old_jumlah)}
                        </TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {quantityText(row.new_jumlah)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums", changeClass(delta))}>
                            {delta > 0 ? "+" : ""}
                            {formatNumber(delta)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-[11px] text-muted-foreground leading-relaxed">
                            <div className="truncate">Lama: {formatStack(row.old_tumpukan_detail)}</div>
                            <div className="truncate">Baru: {formatStack(row.new_tumpukan_detail)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UserRound className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[86px]">{getUserName(row.changed_by)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="lg:hidden space-y-2.5">
            {filteredLogs.map((row) => {
              const product = getProduct(row);
              const delta = getDelta(row);
              const config = OPERATION_CONFIG[row.operation] || OPERATION_CONFIG.UPDATE;
              const Icon = config.icon;

              return (
                <Card key={row.id} className="p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-sm truncate">{product?.kode || "UNKNOWN"}</span>
                        {product?.kategori && (
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {product.kategori}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {product?.nama || "Produk tidak ditemukan"}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("gap-1.5 text-[10px] px-2 py-0.5 shrink-0", config.badge)}>
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-muted/35 px-3 py-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Lama</p>
                      <p className="text-lg font-extrabold tabular-nums">{quantityText(row.old_jumlah)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Baru</p>
                      <p className="text-lg font-extrabold tabular-nums">{quantityText(row.new_jumlah)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 font-bold tabular-nums", changeClass(delta))}>
                      {delta > 0 ? "+" : ""}
                      {formatNumber(delta)}
                    </span>
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{formatShortTime(row.changed_at)} WIB</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                      <UserRound className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{getUserName(row.changed_by)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div className="rounded-lg bg-muted/30 px-2.5 py-2 min-w-0">
                      <p className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Tumpukan Lama</p>
                      <p className="truncate">{formatStack(row.old_tumpukan_detail)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 px-2.5 py-2 min-w-0">
                      <p className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Tumpukan Baru</p>
                      <p className="truncate">{formatStack(row.new_tumpukan_detail)}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditStok;
