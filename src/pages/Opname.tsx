import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Send } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";

const Opname = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [kode, setKode] = useState("");
  const [stokFisik, setStokFisik] = useState(0);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matched = products?.find((p) => p.kode.toUpperCase() === kode.toUpperCase());
  const stokSistem = matched?.stock?.jumlah ?? 0;
  const selisih = stokFisik - stokSistem;

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

  const handleSubmit = async () => {
    if (!matched) {
      toast({ title: "Error", description: "Produk tidak ditemukan", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await supabase.from("stock_opname_log").insert({
        product_id: matched.id,
        stok_sistem: stokSistem,
        stok_fisik: stokFisik,
        selisih,
        catatan: catatan || null,
        user_id: user!.id,
        status: selisih === 0 ? "sesuai" : "selisih",
      });
      // Update stok to match fisik
      if (selisih !== 0) {
        await supabase
          .from("stock")
          .update({ jumlah: stokFisik })
          .eq("product_id", matched.id);
      }
      toast({
        title: "Opname Tercatat",
        description: selisih === 0
          ? `${matched.kode} — stok sesuai`
          : `${matched.kode} — selisih ${selisih > 0 ? "+" : ""}${selisih}`,
      });
      setKode("");
      setStokFisik(0);
      setCatatan("");
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

      <Card>
        <CardHeader><CardTitle className="text-lg">Input Opname</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Kode Produk</Label>
              <Input
                placeholder="Kode..."
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                list="product-codes-opname"
              />
              <datalist id="product-codes-opname">
                {products?.map((p) => <option key={p.id} value={p.kode} />)}
              </datalist>
              {matched && <p className="text-xs text-muted-foreground mt-1">{matched.nama}</p>}
            </div>
            <div>
              <Label>Stok Sistem</Label>
              <Input value={matched ? formatNumber(stokSistem) : "-"} disabled />
            </div>
            <div>
              <Label>Stok Fisik</Label>
              <Input
                type="number"
                min={0}
                value={stokFisik}
                onChange={(e) => setStokFisik(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {matched && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              selisih === 0
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}>
              Selisih: {selisih > 0 ? "+" : ""}{selisih}
              {selisih === 0 ? " ✓ Sesuai" : " — Stok akan diupdate ke stok fisik"}
            </div>
          )}

          <div>
            <Label>Catatan (opsional)</Label>
            <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan..." rows={2} />
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !matched} className="w-full">
            <Send className="h-4 w-4 mr-2" /> {submitting ? "Menyimpan..." : "Simpan Opname"}
          </Button>
        </CardContent>
      </Card>

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
