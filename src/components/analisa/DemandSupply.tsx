import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";

interface Props {
  analysis: AnalysisResult[];
}

export function DemandSupply({ analysis }: Props) {
  const { items, totalPesan, totalKirim, avgFulfillment } = useMemo(() => {
    const filtered = analysis
      .filter((a) => a.totalPesan > 0)
      .sort((a, b) => b.totalPesan - a.totalPesan);

    const tp = filtered.reduce((s, a) => s + a.totalPesan, 0);
    const tk = filtered.reduce((s, a) => s + a.totalKirim, 0);

    return {
      items: filtered,
      totalPesan: tp,
      totalKirim: tk,
      avgFulfillment: tp > 0 ? Math.round((tk / tp) * 1000) / 10 : 100,
    };
  }, [analysis]);

  const unfulfilled = items.filter((a) => a.fulfillmentRate < 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Demand vs Supply
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
          <div>
            <div className="text-muted-foreground">Total Pesanan</div>
            <div className="font-bold text-lg">{formatNumber(totalPesan)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Kiriman</div>
            <div className="font-bold text-lg">{formatNumber(totalKirim)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Tidak Terpenuhi</div>
            <div className="font-bold text-lg text-destructive">{formatNumber(totalPesan - totalKirim)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fulfillment Rate</div>
            <div className={`font-bold text-lg ${avgFulfillment >= 95 ? "text-success" : avgFulfillment >= 80 ? "text-warning" : "text-destructive"}`}>
              {avgFulfillment}%
            </div>
          </div>
        </div>

        {/* Unfulfilled highlight */}
        {unfulfilled.length > 0 && (
          <div className="text-sm">
            <Badge variant="destructive" className="mb-2">
              ⚠️ {unfulfilled.length} produk tidak terpenuhi 100%
            </Badge>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-right">Pesanan</TableHead>
                <TableHead className="text-right">Kiriman</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
                <TableHead className="text-right">Fulfillment</TableHead>
                <TableHead className="text-right">Demand/hari</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 50).map((a, i) => {
                const selisih = a.totalPesan - a.totalKirim;
                return (
                  <TableRow key={a.kode}>
                    <TableCell>{i + 1}.</TableCell>
                    <TableCell className="font-mono font-semibold">{a.kode}</TableCell>
                    <TableCell className="text-right">{formatNumber(a.totalPesan)}</TableCell>
                    <TableCell className="text-right">{formatNumber(a.totalKirim)}</TableCell>
                    <TableCell className={`text-right font-semibold ${selisih > 0 ? "text-destructive" : ""}`}>
                      {selisih > 0 ? `-${formatNumber(selisih)}` : "✓"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={
                        a.fulfillmentRate >= 100 ? "text-success" :
                        a.fulfillmentRate >= 80 ? "text-warning" :
                        "text-destructive font-semibold"
                      }>
                        {a.fulfillmentRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{a.demandVelocity}</TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Belum ada data pesanan
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          💡 Produk dengan fulfillment rate rendah menunjukkan demand tinggi tapi stok tidak cukup untuk memenuhi pesanan.
        </p>
      </CardContent>
    </Card>
  );
}
