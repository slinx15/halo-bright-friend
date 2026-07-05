import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Clock, ChevronDown, ListChecks } from "lucide-react";

import { getAuthHeaders } from "@/lib/authHeaders";
import { logActivity } from "@/lib/activityLogger";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatNumber } from "@/lib/formatters";
import { findProductMatch } from "@/lib/productMatcher";
import { registerStockOpname } from "@/lib/stockMutations";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

import { useProducts } from "@/hooks/useProducts";
import type { ProductWithDetails } from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BulkOpnameInput, type BulkOpnameInputHandle } from "@/components/opname/BulkOpnameInput";
import { OcrUpload } from "@/components/OcrUpload";
import { VoiceOpnameInput } from "@/components/opname/VoiceOpnameInput";

import type { ParsedOpnameItem } from "@/lib/opnameParser";

export interface BulkOpnameSubmitResult {
  successCount: number;
  selisihCount: number;
  errorMessages: string[];
}

interface ResetActivityRow {
  created_at: string;
  detail: string;
}

interface MissingOpnameItem {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  stokSaatIni: number | null;
}

interface OpnameHistoryRow {
  id: string;
  created_at: string;
  status: string;
  selisih: number;
  stok_sistem: number;
  stok_fisik: number;
  catatan: string | null;
  products?: {
    kode?: string;
    nama?: string;
  } | null;
}

function getCurrentStock(product: ProductWithDetails) {
  return product.stock?.jumlah ?? null;
}

const Opname = () => {
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();
  const bulkRef = useRef<BulkOpnameInputHandle>(null);

  const { data: history } = useQuery({
    queryKey: ["opname_history"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_opname_log?select=*,products(kode,nama)&order=created_at.desc&limit=50`,
        { headers: { ...headers, Prefer: "return=representation" } }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<OpnameHistoryRow[]>;
    },
  });

  const { data: latestReset } = useQuery({
    queryKey: ["latest_stock_reset"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/activity_log?select=created_at,detail&action=eq.stock_reset&order=created_at.desc&limit=1`,
        { headers: { ...headers, Prefer: "return=representation" } }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return (data?.[0] ?? null) as ResetActivityRow | null;
    },
  });

  const { data: opnameCoverage } = useQuery({
    queryKey: ["opname_coverage_since_reset", latestReset?.created_at],
    enabled: !!latestReset?.created_at,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const resetAt = encodeURIComponent(latestReset!.created_at);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_opname_log?select=product_id&created_at=gte.${resetAt}&limit=5000`,
        { headers: { ...headers, Prefer: "return=representation" } }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Array<{ product_id: string }>>;
    },
  });

  const totalOpname = history?.length ?? 0;
  const sesuaiCount = history?.filter((item) => item.status === "sesuai").length ?? 0;
  const selisihCount = history?.filter((item) => item.status !== "sesuai").length ?? 0;

  const missingSinceReset = useMemo(() => {
    if (!products || !opnameCoverage) return [] as MissingOpnameItem[];

    const covered = new Set(opnameCoverage.map((row) => row.product_id));
    return products
      .filter((product) => !covered.has(product.id))
      .map((product) => ({
        id: product.id,
        kode: product.kode,
        nama: product.nama,
        kategori: product.kategori,
        stokSaatIni: getCurrentStock(product),
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [opnameCoverage, products]);

  const missingZeroCount = missingSinceReset.filter((item) => (item.stokSaatIni ?? 0) === 0).length;
  const missingNonZeroCount = missingSinceReset.filter((item) => (item.stokSaatIni ?? 0) > 0).length;

  const handleBulkSubmit = async (items: ParsedOpnameItem[]): Promise<BulkOpnameSubmitResult> => {
    if (!products) {
      return {
        successCount: 0,
        selisihCount: 0,
        errorMessages: ["Data produk belum siap, coba lagi."],
      };
    }

    setSubmitting(true);
    try {
      let successCount = 0;
      let totalSelisihCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        const product = item.productId
          ? products.find((p) => p.id === item.productId)
          : findProductMatch(products, { kode: item.kode, kategori: item.kategori });

        if (!product) {
          errors.push(`${item.kode}: produk tidak ditemukan`);
          continue;
        }

        try {
          const result = await registerStockOpname({
            productId: product.id,
            stokFisik: item.total,
            tumpukanDetail: item.stacks,
            catatan: `Bulk SO: tumpukan ${item.stacks.join(", ")}`,
          });

          if ((result.selisih ?? item.total - (product.stock?.jumlah ?? 0)) !== 0) {
            totalSelisihCount++;
          }
          successCount++;
        } catch (err: unknown) {
          errors.push(`${product.kode}: ${getErrorMessage(err)}`);
        }
      }

      if (errors.length > 0) {
        toast({
          title: `${successCount} berhasil, ${errors.length} gagal`,
          description: errors[0],
          variant: "destructive",
        });
      } else {
        toast({ title: "Bulk Opname Selesai", description: `${successCount} produk berhasil di-update` });
      }

      if (successCount > 0) {
        logActivity(
          "opname",
          `Opname ${successCount} produk${totalSelisihCount > 0 ? `, ${totalSelisihCount} selisih` : ""}`,
          { count: successCount, selisih: totalSelisihCount }
        );
        queryClient.invalidateQueries({ queryKey: ["opname_history"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["opname_coverage_since_reset"] });
      }

      return { successCount, selisihCount: totalSelisihCount, errorMessages: errors };
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      toast({ title: "Error", description: message, variant: "destructive" });
      return {
        successCount: 0,
        selisihCount: 0,
        errorMessages: [message],
      };
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*:nth-child(4)]:![animation-delay:150ms] [&>*]:[animation-fill-mode:both]">
      <PageHeader
        icon={ClipboardCheck}
        iconColor="text-warning"
        iconBg="bg-warning/10"
        title="Stock Opname"
        subtitle="Rekonsiliasi stok sistem vs fisik"
        actions={
          <>
            <VoiceOpnameInput onResult={(items) => bulkRef.current?.handleVoiceResult(items)} />
            <OcrUpload mode="opname" onResult={(items) => bulkRef.current?.handleOcrResult(items)} />
          </>
        }
      />
      <div className="hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-3 rounded-2xl bg-warning/10 shadow-sm shrink-0">
            <ClipboardCheck className="h-6 w-6 text-warning" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight whitespace-nowrap">Stock Opname</h1>
            <p className="text-muted-foreground text-xs font-medium">Rekonsiliasi stok sistem vs fisik</p>
          </div>
        </div>
        <div className="flex gap-2 items-center justify-end sm:justify-start shrink-0">
          <VoiceOpnameInput onResult={(items) => bulkRef.current?.handleVoiceResult(items)} />
          <OcrUpload mode="opname" onResult={(items) => bulkRef.current?.handleOcrResult(items)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-warning/5 p-3 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{totalOpname}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Log</p>
        </div>
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-success">{sesuaiCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sesuai ✓</p>
        </div>
        <div className="card-premium bg-destructive/5 p-3 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-destructive">{selisihCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Selisih ✕</p>
        </div>
      </div>

      <BulkOpnameInput
        ref={bulkRef}
        products={products ?? []}
        onSubmit={handleBulkSubmit}
        submitting={submitting}
      />

      {latestReset && (
        <Card className="card-premium">
          <Collapsible defaultOpen>
            <CardHeader className="pb-2">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left min-h-[44px]">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-warning" /> Belum Tercatat Sejak Reset Terakhir
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] rounded-full px-2.5 font-bold ${
                        missingSinceReset.length > 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {missingSinceReset.length} produk
                    </Badge>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </div>
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
                  <p className="font-medium text-foreground">Reset terakhir: {formatDate(latestReset.created_at)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Panel ini menampilkan produk aktif yang belum punya log opname sejak reset stok terakhir.
                  </p>
                </div>

                {missingSinceReset.length === 0 ? (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm text-success">
                    Semua produk aktif sudah punya log opname setelah reset terakhir.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                        <p className="text-lg font-extrabold tabular-nums text-destructive">{missingSinceReset.length}</p>
                        <p className="text-[11px] text-muted-foreground">Total belum tercatat</p>
                      </div>
                      <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                        <p className="text-lg font-extrabold tabular-nums text-warning">{missingNonZeroCount}</p>
                        <p className="text-[11px] text-muted-foreground">Masih punya stok &gt; 0</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {missingZeroCount} produk masih 0 atau belum punya row stok. Fokus utama biasanya yang stoknya masih &gt; 0.
                    </p>

                    {isMobile ? (
                      <div className="space-y-2.5">
                        {missingSinceReset.map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3.5 space-y-1.5 ${
                              (item.stokSaatIni ?? 0) > 0
                                ? "border-l-[3px] border-l-destructive border-border/60"
                                : "border-border/60"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-sm">{item.kode}</span>
                              <Badge
                                variant="secondary"
                                className={(item.stokSaatIni ?? 0) > 0 ? "bg-destructive/10 text-destructive" : ""}
                              >
                                stok {item.stokSaatIni ?? "-"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.nama}</p>
                            {item.kategori && <p className="text-[11px] text-muted-foreground">{item.kategori}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="font-bold">Kode</TableHead>
                              <TableHead className="font-bold">Nama</TableHead>
                              <TableHead className="font-bold">Kategori</TableHead>
                              <TableHead className="text-right font-bold">Stok Saat Ini</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {missingSinceReset.map((item, idx) => (
                              <TableRow key={item.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                                <TableCell className="font-mono font-bold text-sm">{item.kode}</TableCell>
                                <TableCell className="text-sm">{item.nama}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{item.kategori || "-"}</TableCell>
                                <TableCell
                                  className={`text-right tabular-nums font-semibold ${
                                    (item.stokSaatIni ?? 0) > 0 ? "text-destructive" : ""
                                  }`}
                                >
                                  {item.stokSaatIni ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      <Card className="card-premium">
        <Collapsible defaultOpen>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left min-h-[44px]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Opname
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">
                      {history.length} entri
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </div>
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {isMobile ? (
                <div className="space-y-2.5">
                  {!history || history.length === 0 ? (
                    <div className="py-10 text-center">
                      <ClipboardCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">Belum ada riwayat opname</p>
                    </div>
                  ) : (
                    history.map((h) => (
                      <div
                        key={h.id}
                        className={`rounded-xl border p-3.5 space-y-2 transition-all duration-200 active:scale-[0.98] bg-card ${
                          h.selisih !== 0 ? "border-l-[3px] border-l-destructive border-border/60" : "border-l-[3px] border-l-success border-border/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm">{h.products?.kode}</span>
                            <span className="text-xs text-muted-foreground truncate">{h.products?.nama}</span>
                          </div>
                          <Badge
                            className={`rounded-full text-[10px] px-2.5 border-0 font-bold ${
                              h.status === "sesuai" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            {h.status === "sesuai" ? `${"\u2713"} Sesuai` : `${"\u2715"} Selisih`}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Sistem</span>
                            <p className="font-semibold tabular-nums">{formatNumber(h.stok_sistem)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fisik</span>
                            <p className="font-semibold tabular-nums">{formatNumber(h.stok_fisik)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Selisih</span>
                            <p className={`font-bold tabular-nums ${h.selisih !== 0 ? "text-destructive" : "text-success"}`}>
                              {h.selisih > 0 ? "+" : ""}
                              {h.selisih}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                          <Clock className="h-3 w-3" /> {formatDate(h.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-bold">Waktu</TableHead>
                        <TableHead className="font-bold">Kode</TableHead>
                        <TableHead className="font-bold">Nama</TableHead>
                        <TableHead className="text-right font-bold">Sistem</TableHead>
                        <TableHead className="text-right font-bold">Fisik</TableHead>
                        <TableHead className="text-right font-bold">Selisih</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="font-bold">Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history?.map((h, idx: number) => (
                        <TableRow key={h.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(h.created_at)}</TableCell>
                          <TableCell className="font-mono font-bold text-sm">{h.products?.kode}</TableCell>
                          <TableCell className="text-sm">{h.products?.nama}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(h.stok_sistem)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{formatNumber(h.stok_fisik)}</TableCell>
                          <TableCell className={`text-right font-bold tabular-nums ${h.selisih !== 0 ? "text-destructive" : "text-success"}`}>
                            {h.selisih > 0 ? "+" : ""}
                            {h.selisih}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`rounded-full text-xs ${h.status === "sesuai" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                            >
                              {h.status === "sesuai" ? `${"\u2713"} Sesuai` : `${"\u2715"} Selisih`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{h.catatan || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {(!history || history.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                            Belum ada riwayat opname
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
};

export default Opname;
