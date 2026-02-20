import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";
import { RULES } from "@/lib/analysisRules";

interface StockOutItem {
  product_id: string;
  qty_kirim: number;
  created_at: string;
}

interface Props {
  analysis: AnalysisResult[];
  stockOutData: StockOutItem[] | undefined;
  productIdMap: Record<string, string>; // kode -> id
}

export function PalingLaris({ analysis, stockOutData, productIdMap }: Props) {
  const topItems = useMemo(() => {
    if (!stockOutData) return [];

    // Build id -> kode reverse map
    const idToKode: Record<string, string> = {};
    for (const [kode, id] of Object.entries(productIdMap)) {
      idToKode[id] = kode;
    }

    // Calculate total sales per product
    const salesMap: Record<string, { qty: number; dates: Set<string> }> = {};
    for (const s of stockOutData) {
      const kode = idToKode[s.product_id];
      if (!kode) continue;
      if (!salesMap[kode]) salesMap[kode] = { qty: 0, dates: new Set() };
      salesMap[kode].qty += s.qty_kirim;
      salesMap[kode].dates.add(s.created_at.slice(0, 10));
    }

    return analysis
      .filter((a) => a.velocity > 0)
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, RULES.DISPLAY_TOP_ITEMS)
      .map((a) => {
        const sales = salesMap[a.kode];
        const totalSold = sales?.qty ?? 0;
        const dataDays = sales ? sales.dates.size : 0;
        return { ...a, totalSold, dataDays };
      });
  }, [analysis, stockOutData, productIdMap]);

  const getMedal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" /> {RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris 🔥
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-right">Terjual</TableHead>
                <TableHead className="text-right">Laku/4hari</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Habis dlm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topItems.map((item, i) => {
                const velPerCycle = item.velocity * RULES.DISPLAY_CYCLE_DAYS;
                const isBs = item.velocity >= RULES.BESTSELLER_VELOCITY;
                return (
                  <TableRow key={item.kode}>
                    <TableCell>{getMedal(i)}</TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold">{item.kode}</span>
                      {isBs && <span className="ml-1">🔥</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(item.totalSold)} pcs
                      {item.dataDays < 7 && <span className="ml-1 text-warning" title="Data < 7 hari">⚠️</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{velPerCycle.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.stok)}</TableCell>
                    <TableCell className="text-right">
                      {item.daysToDeplete !== null ? (
                        <span className={item.daysToDeplete <= RULES.CRITICAL_DAYS ? "text-destructive font-bold" : item.daysToDeplete <= RULES.WARNING_DAYS ? "text-warning font-semibold" : ""}>
                          {item.daysToDeplete} hari
                        </span>
                      ) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {topItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data penjualan</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">⚠️ = data &lt; 7 hari (mungkin belum akurat)</p>
      </CardContent>
    </Card>
  );
}
