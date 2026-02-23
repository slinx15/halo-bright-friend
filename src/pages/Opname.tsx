import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClipboardCheck, Clock, ChevronDown } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { BulkOpnameInput } from "@/components/opname/BulkOpnameInput";
import type { ParsedOpnameItem } from "@/lib/opnameParser";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/PageHeader";
import { OpnameSkeleton } from "@/components/LoadingSkeletons";

const Opname = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();

  const { data: history } = useQuery({
    queryKey: ["opname_history"],
    queryFn: async () => {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_opname_log?select=*,products(kode,nama)&order=created_at.desc&limit=50`,
        { headers: { ...headers, "Prefer": "return=representation" } }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const handleBulkSubmit = async (items: ParsedOpnameItem[]) => {
    if (!user || !products) return;
    setSubmitting(true);
    try {
      const opnameLogs: any[] = [];
      const stockUpserts: { product_id: string; jumlah: number; tumpukan_detail: number[] }[] = [];
      for (const item of items) {
        const product = products.find((p) => p.kode.toUpperCase() === item.kode.toUpperCase());
        if (!product) continue;
        const stokSistem = product.stock?.jumlah ?? 0;
        const selisih = item.total - stokSistem;
        opnameLogs.push({
          product_id: product.id, stok_sistem: stokSistem, stok_fisik: item.total,
          selisih, catatan: `Bulk SO: tumpukan ${item.stacks.join(", ")}`,
          user_id: user.id, status: selisih === 0 ? "sesuai" : "selisih",
        });
        stockUpserts.push({ product_id: product.id, jumlah: item.total, tumpukan_detail: item.stacks });
      }
      const headers = getAuthHeaders();
      if (opnameLogs.length > 0) {
        const logRes = await fetch(`${SUPABASE_URL}/rest/v1/stock_opname_log`, { method: "POST", headers, body: JSON.stringify(opnameLogs) });
        if (!logRes.ok) throw new Error(await logRes.text());
      }
      if (stockUpserts.length > 0) {
        const stockRes = await fetch(`${SUPABASE_URL}/rest/v1/stock?on_conflict=product_id`, {
          method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(stockUpserts),
        });
        if (!stockRes.ok) throw new Error(await stockRes.text());
      }
      toast({ title: "Bulk Opname Selesai", description: `${stockUpserts.length} produk berhasil di-update` });
      queryClient.invalidateQueries({ queryKey: ["opname_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      <PageHeader
        icon={ClipboardCheck}
        iconColor="text-warning"
        iconBg="bg-warning/10"
        title="Stock Opname"
        subtitle="Rekonsiliasi stok sistem vs fisik"
      />

      <BulkOpnameInput
        products={products ?? []}
        onSubmit={handleBulkSubmit}
        submitting={submitting}
      />

      <Card className="boss-card">
        <Collapsible>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Riwayat Opname
                </CardTitle>
                <div className="flex items-center gap-2">
                  {history && history.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] rounded-full px-2">{history.length}</Badge>
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
                  {(!history || history.length === 0) ? (
                    <div className="py-8 text-center">
                      <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Belum ada riwayat opname</p>
                    </div>
                  ) : history.map((h: any) => (
                    <div key={h.id} className={`rounded-xl border p-3.5 space-y-2 transition-all duration-200 ${
                      h.selisih !== 0 ? "border-l-[3px] border-l-destructive border-border/60" : "border-l-[3px] border-l-success border-border/60"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm">{h.products?.kode}</span>
                        <Badge className={`rounded-full text-[10px] px-2 border-0 font-bold ${
                          h.status === "sesuai" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                        }`}>
                          {h.status}
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
                            {h.selisih > 0 ? "+" : ""}{h.selisih}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center text-[11px] text-muted-foreground gap-1">
                        <Clock className="h-3 w-3" /> {formatDate(h.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead className="text-right">Sistem</TableHead>
                        <TableHead className="text-right">Fisik</TableHead>
                        <TableHead className="text-right">Selisih</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history?.map((h: any) => (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs">{formatDate(h.created_at)}</TableCell>
                          <TableCell className="font-mono font-semibold text-sm">{h.products?.kode}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(h.stok_sistem)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(h.stok_fisik)}</TableCell>
                          <TableCell className={`text-right font-bold tabular-nums ${h.selisih !== 0 ? "text-destructive" : "text-success"}`}>
                            {h.selisih > 0 ? "+" : ""}{h.selisih}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`rounded-full ${h.status === "sesuai" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                              {h.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{h.catatan || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {(!history || history.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada riwayat opname</TableCell>
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
