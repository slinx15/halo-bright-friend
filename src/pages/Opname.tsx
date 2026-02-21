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
import { ClipboardCheck, Send, Plus, Trash2 } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/formatters";
import { OcrUpload } from "@/components/OcrUpload";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { splitIntoStacks, getMaxStack } from "@/lib/tumpukanUtils";

const Opname = () => {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [kode, setKode] = useState("");
  const [stokFisik, setStokFisik] = useState(0);
  const [tumpukanInput, setTumpukanInput] = useState<number[]>([]);
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matched = products?.find((p) => p.kode.toUpperCase() === kode.toUpperCase());
  const stokSistem = matched?.stock?.jumlah ?? 0;
  const currentStacks = (matched?.stock?.tumpukan_detail as number[]) ?? [];
  const selisih = stokFisik - stokSistem;

  // When product changes, pre-fill tumpukan from current stacks
  const handleKodeChange = (newKode: string) => {
    setKode(newKode.toUpperCase());
    const found = products?.find((p) => p.kode.toUpperCase() === newKode.toUpperCase());
    if (found) {
      const stacks = (found.stock?.tumpukan_detail as number[]) ?? [];
      setTumpukanInput([...stacks]);
      setStokFisik(found.stock?.jumlah ?? 0);
    } else {
      setTumpukanInput([]);
      setStokFisik(0);
    }
  };

  const tumpukanTotal = tumpukanInput.reduce((s, v) => s + v, 0);

  // Auto-generate stacks from stokFisik
  const autoGenerateStacks = () => {
    if (!matched) return;
    const stacks = splitIntoStacks(stokFisik, matched.kode);
    setTumpukanInput(stacks);
  };

  // Manual stack editing
  const addStack = () => {
    const max = matched ? getMaxStack(matched.kode) : 25;
    setTumpukanInput((prev) => [...prev, max]);
  };
  const removeStack = (idx: number) => {
    setTumpukanInput((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateStack = (idx: number, val: number) => {
    setTumpukanInput((prev) => {
      const updated = [...prev];
      updated[idx] = val;
      return updated;
    });
  };

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
    // Validate tumpukan total matches stokFisik
    if (tumpukanInput.length > 0 && tumpukanTotal !== stokFisik) {
      toast({
        title: "Warning",
        description: `Total tumpukan (${tumpukanTotal}) tidak sama dengan stok fisik (${stokFisik}). Tumpukan akan di-generate otomatis.`,
      });
    }

    const finalStacks = tumpukanTotal === stokFisik && tumpukanInput.length > 0
      ? [...tumpukanInput].sort((a, b) => a - b)
      : splitIntoStacks(stokFisik, matched.kode);

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

      // Update stock jumlah AND tumpukan_detail
      const { data: existing } = await supabase
        .from("stock")
        .select("id")
        .eq("product_id", matched.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("stock")
          .update({ jumlah: stokFisik, tumpukan_detail: finalStacks })
          .eq("id", existing.id);
      } else {
        await supabase.from("stock").insert({
          product_id: matched.id,
          jumlah: stokFisik,
          tumpukan_detail: finalStacks,
        });
      }

      toast({
        title: "Opname Tercatat",
        description: selisih === 0
          ? `${matched.kode} — stok sesuai, tumpukan diperbarui`
          : `${matched.kode} — selisih ${selisih > 0 ? "+" : ""}${selisih}, tumpukan diperbarui`,
      });
      setKode("");
      setStokFisik(0);
      setTumpukanInput([]);
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
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Input Opname</CardTitle>
            <OcrUpload
              mode="opname"
              onResult={(ocrItems) => {
                if (ocrItems.length > 0) {
                  const first = ocrItems[0];
                  handleKodeChange((first.kode || "").toUpperCase());
                  if (first.stok_fisik) setStokFisik(first.stok_fisik);
                  if (first.catatan) setCatatan(first.catatan);
                }
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Kode Produk</Label>
              <Input
                placeholder="Kode..."
                value={kode}
                onChange={(e) => handleKodeChange(e.target.value)}
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

          {/* Current tumpukan display */}
          {matched && currentStacks.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Tumpukan sistem:</span>
              <TumpukanBadges stacks={currentStacks} kode={matched.kode} compact />
            </div>
          )}

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

          {/* Tumpukan editor */}
          {matched && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Atur Tumpukan Fisik</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={autoGenerateStacks}>
                    Auto dari stok fisik
                  </Button>
                  <Button variant="outline" size="sm" onClick={addStack}>
                    <Plus className="h-3 w-3 mr-1" /> Tumpukan
                  </Button>
                </div>
              </div>
              
              {tumpukanInput.length > 0 ? (
                <div className="bg-muted/50 rounded-md p-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {tumpukanInput.map((val, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-16 text-sm text-center font-mono"
                          value={val}
                          onChange={(e) => updateStack(idx, parseInt(e.target.value) || 0)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeStack(idx)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Preview:</span>
                    <TumpukanBadges stacks={[...tumpukanInput].sort((a, b) => a - b)} kode={matched.kode} compact />
                    <span className={`font-medium ${tumpukanTotal !== stokFisik ? "text-destructive" : "text-success"}`}>
                      = {tumpukanTotal}
                      {tumpukanTotal !== stokFisik && ` (≠ fisik ${stokFisik})`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Klik "Auto dari stok fisik" untuk generate tumpukan otomatis, atau tambah manual.
                </p>
              )}
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
