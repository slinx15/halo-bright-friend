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
import { RULES } from "@/lib/analysisRules";

interface ReviewItem {
  kode: string;
  qty: number;
}

interface ReviewBelanjaanProps {
  analysis: AnalysisResult[];
}

export function ReviewBelanjaan({ analysis }: ReviewBelanjaanProps) {
  const [items, setItems] = useState<ReviewItem[]>([{ kode: "", qty: 0 }]);
  const [targetDays, setTargetDays] = useState(RULES.DISPLAY_CYCLE_DAYS);

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

      // Ideal qty = velocity * targetDays + safety - current stock
      const idealQty = Math.max(
        0,
        Math.ceil(match.velocity * targetDays + match.velocity * RULES.SAFETY_STOCK) - match.stok
      );

      const diff = item.qty - idealQty;

      // Status logic like bot:
      // - Dead stock → "Belum Perlu" (no need to buy)
      // - qty > ideal * 1.3 → "Terlalu Banyak"
      // - qty < ideal * 0.7 → "Terlalu Sedikit"
      // - otherwise → "Pas"
      let status: "dead" | "terlalu_banyak" | "terlalu_sedikit" | "pas" | "belum_perlu";
      if (match.isDead) {
        status = "dead";
      } else if (idealQty <= 0) {
        status = "belum_perlu";
      } else if (item.qty > idealQty * 1.3) {
        status = "terlalu_banyak";
      } else if (item.qty < idealQty * 0.7) {
        status = "terlalu_sedikit";
      } else {
        status = "pas";
      }

      return {
        ...item,
        found: true as const,
        nama: match.nama,
        stok: match.stok,
        velocity: match.velocity,
        idealQty,
        hargaModal: match.hargaModal,
        totalCost: item.qty * match.hargaModal,
        status,
        diff,
        isDead: match.isDead,
      };
    });

  const totalCost = reviewed
    .filter((r) => r.found)
    .reduce((s, r) => s + (r.found ? r.totalCost : 0), 0);

  const statusLabel = (status: string) => {
    switch (status) {
      case "dead": return { text: "💀 Dead Stock", className: "bg-muted text-muted-foreground" };
      case "belum_perlu": return { text: "⏸ Belum Perlu", className: "bg-muted text-muted-foreground" };
      case "terlalu_banyak": return { text: "↑ Terlalu Banyak", className: "bg-destructive/10 text-destructive" };
      case "terlalu_sedikit": return { text: "↓ Terlalu Sedikit", className: "bg-warning/10 text-warning" };
      case "pas": return { text: "✓ Pas", className: "bg-success/10 text-success" };
      default: return { text: status, className: "" };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Review Belanjaan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Masukkan kode & qty yang mau dibeli, sistem akan cek apakah sudah sesuai kebutuhan berdasarkan velocity dan target hari.
        </p>

        {/* Target days */}
        <div className="flex gap-3 items-end">
          <div className="w-40">
            <Label className="text-xs">Target Hari</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={targetDays}
              onChange={(e) => setTargetDays(parseInt(e.target.value) || RULES.DISPLAY_CYCLE_DAYS)}
              placeholder="Target hari"
            />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Stok harus cukup untuk berapa hari ke depan
          </p>
        </div>

        {/* Item input rows */}
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
                  <TableHead className="text-right">Ideal Qty</TableHead>
                  <TableHead className="text-right">Qty Beli</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewed.map((r, i) => {
                  const sl = r.found ? statusLabel(r.status) : null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono font-semibold">{r.kode}</TableCell>
                      {r.found ? (
                        <>
                          <TableCell className="text-sm">{r.nama}</TableCell>
                          <TableCell className="text-right">{formatNumber(r.stok)}</TableCell>
                          <TableCell className="text-right">{r.velocity}</TableCell>
                          <TableCell className="text-right">
                            {r.isDead ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              formatNumber(r.idealQty)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatNumber(r.qty)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={sl?.className}>
                              {sl?.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatRupiah(r.totalCost)}</TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={7} className="text-destructive text-sm">Produk tidak ditemukan</TableCell>
                      )}
                    </TableRow>
                  );
                })}
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
