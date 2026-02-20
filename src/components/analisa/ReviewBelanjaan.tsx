import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";

interface ReviewItem {
  kode: string;
  qty: number;
}

interface ReviewBelanjaanProps {
  analysis: AnalysisResult[];
}

export function ReviewBelanjaan({ analysis }: ReviewBelanjaanProps) {
  const [items, setItems] = useState<ReviewItem[]>([{ kode: "", qty: 0 }]);

  const addRow = () => setItems([...items, { kode: "", qty: 0 }]);
  const removeRow = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof ReviewItem, value: string) => {
    const updated = [...items];
    if (field === "kode") updated[i].kode = value.toUpperCase();
    else updated[i].qty = parseInt(value) || 0;
    setItems(updated);
  };

  const reviewed = items
    .filter((item) => item.kode && item.qty > 0)
    .map((item) => {
      const match = analysis.find((a) => a.kode === item.kode);
      if (!match) return { ...item, found: false as const };

      const recommended = match.restockQty;
      const diff = item.qty - recommended;
      const status: "kurang" | "pas" | "lebih" =
        diff < -2 ? "kurang" : diff > 2 ? "lebih" : "pas";

      return {
        ...item,
        found: true as const,
        nama: match.nama,
        stok: match.stok,
        velocity: match.velocity,
        recommended,
        hargaModal: match.hargaModal,
        totalCost: item.qty * match.hargaModal,
        status,
        diff,
      };
    });

  const totalCost = reviewed
    .filter((r) => r.found)
    .reduce((s, r) => s + (r.found ? r.totalCost : 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Review Belanjaan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Masukkan kode & qty yang mau dibeli, sistem akan cek apakah sudah sesuai rekomendasi velocity.
        </p>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                {i === 0 && <Label className="text-xs">Kode</Label>}
                <Input
                  value={item.kode}
                  onChange={(e) => updateRow(i, "kode", e.target.value)}
                  placeholder="Kode produk"
                  className="font-mono"
                />
              </div>
              <div className="w-24">
                {i === 0 && <Label className="text-xs">Qty</Label>}
                <Input
                  type="number"
                  min={0}
                  value={item.qty || ""}
                  onChange={(e) => updateRow(i, "qty", e.target.value)}
                  placeholder="Qty"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)} disabled={items.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> Tambah Item
          </Button>
        </div>

        {reviewed.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Velocity</TableHead>
                  <TableHead className="text-right">Rekomendasi</TableHead>
                  <TableHead className="text-right">Qty Beli</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono font-semibold">{r.kode}</TableCell>
                    {r.found ? (
                      <>
                        <TableCell className="text-sm">{r.nama}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.stok)}</TableCell>
                        <TableCell className="text-right">{r.velocity}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.recommended)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatNumber(r.qty)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={
                            r.status === "pas" ? "bg-success/10 text-success" :
                            r.status === "kurang" ? "bg-warning/10 text-warning" :
                            "bg-destructive/10 text-destructive"
                          }>
                            {r.status === "pas" ? "✓ Pas" :
                             r.status === "kurang" ? `↓ Kurang ${Math.abs(r.diff)}` :
                             `↑ Lebih ${r.diff}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatRupiah(r.totalCost)}</TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={7} className="text-destructive text-sm">Produk tidak ditemukan</TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={7} className="font-semibold">Total Belanjaan</TableCell>
                  <TableCell className="text-right font-bold text-primary">{formatRupiah(totalCost)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
