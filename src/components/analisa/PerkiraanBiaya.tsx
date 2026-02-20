import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";
import { RULES } from "@/lib/analysisRules";

interface Props {
  analysis: AnalysisResult[];
}

const TARGETS = [
  { days: 4, label: "4 hari (1 siklus)" },
  { days: 7, label: "7 hari (1 minggu)" },
  { days: 14, label: "14 hari (2 minggu)" },
  { days: 21, label: "21 hari (3 minggu)" },
  { days: 30, label: "30 hari (1 bulan)" },
];

export function PerkiraanBiaya({ analysis }: Props) {
  const estimates = useMemo(() => {
    return TARGETS.map(({ days, label }) => {
      let totalCost = 0;
      let totalItems = 0;
      let totalQty = 0;

      for (const a of analysis) {
        if (a.velocity <= 0) continue;
        const targetStock = Math.ceil(a.velocity * days);
        const butuh = targetStock - a.stok;
        if (butuh <= 0) continue;

        const qtyToBuy = Math.ceil(butuh / RULES.BATCH) * RULES.BATCH;
        const cost = qtyToBuy * a.hargaModal;
        totalCost += cost;
        totalItems++;
        totalQty += qtyToBuy;
      }

      return { days, label, totalCost, totalItems, totalQty };
    });
  }, [analysis]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Perkiraan Biaya Restock
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Estimasi budget yang dibutuhkan untuk stok di berbagai target hari.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Item</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimates.map((e) => (
              <TableRow key={e.days}>
                <TableCell className="font-medium">📅 {e.label}</TableCell>
                <TableCell className="text-right font-bold text-primary">{formatRupiah(e.totalCost)}</TableCell>
                <TableCell className="text-right">{e.totalItems} item</TableCell>
                <TableCell className="text-right">{formatNumber(e.totalQty)} pcs</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-4">
          💡 Pilih menu Budget lalu ketik nominal untuk belanja sesuai budget Anda.
        </p>
      </CardContent>
    </Card>
  );
}
