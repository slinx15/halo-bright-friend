import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { BulkOpnameInput } from "@/components/opname/BulkOpnameInput";
import type { ParsedOpnameItem } from "@/lib/opnameParser";

const Opname = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["opname_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_opname_log")
        .select("*, products(kode, nama)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleBulkSubmit = async (items: ParsedOpnameItem[]) => {
    if (!user || !products) return;
    setSubmitting(true);

    try {
      // Prepare all data first
      const opnameLogs: any[] = [];
      const stockUpserts: { product_id: string; jumlah: number; tumpukan_detail: number[] }[] = [];

      for (const item of items) {
        const product = products.find((p) => p.kode.toUpperCase() === item.kode.toUpperCase());
        if (!product) continue;

        const stokSistem = product.stock?.jumlah ?? 0;
        const selisih = item.total - stokSistem;

        opnameLogs.push({
          product_id: product.id,
          stok_sistem: stokSistem,
          stok_fisik: item.total,
          selisih,
          catatan: `Bulk SO: tumpukan ${item.stacks.join(", ")}`,
          user_id: user.id,
          status: selisih === 0 ? "sesuai" : "selisih",
        });

        stockUpserts.push({
          product_id: product.id,
          jumlah: item.total,
          tumpukan_detail: item.stacks,
        });
      }

      // Batch insert opname logs
      if (opnameLogs.length > 0) {
        const { error: logErr } = await supabase.from("stock_opname_log").insert(opnameLogs);
        if (logErr) throw logErr;
      }

      // Batch upsert stock (onConflict on product_id)
      if (stockUpserts.length > 0) {
        const { error: stockErr } = await supabase
          .from("stock")
          .upsert(stockUpserts, { onConflict: "product_id" });
        if (stockErr) throw stockErr;
      }

      toast({
        title: "Bulk Opname Selesai",
        description: `${stockUpserts.length} produk berhasil di-update`,
      });
      queryClient.invalidateQueries({ queryKey: ["opname_history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-warning" />
        <div>
          <h1 className="text-2xl font-bold">Stock Opname</h1>
          <p className="text-muted-foreground text-sm">Rekonsiliasi stok sistem vs fisik</p>
        </div>
      </div>

      <BulkOpnameInput
        products={products ?? []}
        onSubmit={handleBulkSubmit}
        submitting={submitting}
      />

      <Card>
        <CardHeader><CardTitle className="text-lg">Riwayat Opname</CardTitle></CardHeader>
        <CardContent>
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
                    <TableCell className="font-mono text-sm">{h.products?.kode}</TableCell>
                    <TableCell className="text-right">{formatNumber(h.stok_sistem)}</TableCell>
                    <TableCell className="text-right">{formatNumber(h.stok_fisik)}</TableCell>
                    <TableCell className={`text-right font-semibold ${h.selisih !== 0 ? "text-destructive" : "text-success"}`}>
                      {h.selisih > 0 ? "+" : ""}{h.selisih}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={h.status === "sesuai" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.catatan || "-"}</TableCell>
                  </TableRow>
                ))}
                {(!history || history.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Belum ada riwayat opname
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Opname;
