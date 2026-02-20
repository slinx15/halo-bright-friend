import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageMinus } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";
import { RULES } from "@/lib/analysisRules";

interface Props {
  analysis: AnalysisResult[];
}

export function StokSedikit({ analysis }: Props) {
  const lowStock = useMemo(() => {
    return [...analysis]
      .sort((a, b) => a.stok - b.stok)
      .slice(0, 10);
  }, [analysis]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <PackageMinus className="h-5 w-5 text-destructive" /> 10 Stok Paling Sedikit
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Laku/4hari</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock.map((item, i) => {
                const icon = item.stok === 0 ? "🔴" : item.stok < 10 ? "🟡" : "🟢";
                const isBs = item.velocity >= RULES.BESTSELLER_VELOCITY;
                const velPerCycle = item.velocity * RULES.DISPLAY_CYCLE_DAYS;
                return (
                  <TableRow key={item.kode}>
                    <TableCell>{i + 1}.</TableCell>
                    <TableCell>
                      {icon} <span className="font-mono font-semibold">{item.kode}</span>
                      {isBs && <span className="ml-1">🔥</span>}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${item.stok === 0 ? "text-destructive" : item.stok < 10 ? "text-warning" : ""}`}>
                      {formatNumber(item.stok)}
                    </TableCell>
                    <TableCell className="text-right">{velPerCycle.toFixed(0)}</TableCell>
                  </TableRow>
                );
              })}
              {lowStock.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada data produk</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
