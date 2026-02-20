import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { RULES } from "@/lib/analysisRules";

interface StockOutItem {
  product_id: string;
  qty_kirim: number;
  created_at: string;
}

interface Props {
  stockOutData: StockOutItem[] | undefined;
  productIdMap: Record<string, string>; // kode -> id
}

export function NaikTurun({ stockOutData, productIdMap }: Props) {
  const { trends, totalThisWeek, totalLastWeek } = useMemo(() => {
    if (!stockOutData) return { trends: [], totalThisWeek: 0, totalLastWeek: 0 };

    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const twoWeeksAgo = now - 14 * 86400000;

    const idToKode: Record<string, string> = {};
    for (const [kode, id] of Object.entries(productIdMap)) {
      idToKode[id] = kode;
    }

    const thisWeek: Record<string, number> = {};
    const lastWeek: Record<string, number> = {};

    for (const s of stockOutData) {
      const kode = idToKode[s.product_id];
      if (!kode) continue;
      const t = new Date(s.created_at).getTime();
      if (t >= weekAgo) {
        thisWeek[kode] = (thisWeek[kode] || 0) + s.qty_kirim;
      } else if (t >= twoWeeksAgo) {
        lastWeek[kode] = (lastWeek[kode] || 0) + s.qty_kirim;
      }
    }

    const allKodes = new Set([...Object.keys(thisWeek), ...Object.keys(lastWeek)]);
    const items: { kode: string; tw: number; lw: number; change: number }[] = [];

    for (const kode of allKodes) {
      const tw = thisWeek[kode] || 0;
      const lw = lastWeek[kode] || 0;
      if (tw === 0 && lw === 0) continue;
      const change = lw > 0 ? ((tw - lw) / lw) * 100 : tw > 0 ? 100 : 0;
      items.push({ kode, tw, lw, change });
    }

    items.sort((a, b) => b.tw - a.tw);

    return {
      trends: items,
      totalThisWeek: items.reduce((s, i) => s + i.tw, 0),
      totalLastWeek: items.reduce((s, i) => s + i.lw, 0),
    };
  }, [stockOutData, productIdMap]);

  const overallChange = totalLastWeek > 0 ? ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Trend Penjualan 7 Hari
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-muted/50 rounded-md text-sm">
          <div>
            <div className="text-muted-foreground">Minggu ini</div>
            <div className="font-bold">{formatNumber(totalThisWeek)} pcs</div>
          </div>
          <div>
            <div className="text-muted-foreground">Minggu lalu</div>
            <div className="font-bold">{formatNumber(totalLastWeek)} pcs</div>
          </div>
          <div>
            <div className="text-muted-foreground">Perubahan</div>
            <div className={`font-bold ${overallChange > 0 ? "text-success" : overallChange < 0 ? "text-destructive" : ""}`}>
              {overallChange >= 0 ? "+" : ""}{overallChange.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-right">Minggu ini</TableHead>
                <TableHead className="text-right">Minggu lalu</TableHead>
                <TableHead className="text-right">Perubahan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trends.map((t, i) => {
                const icon = t.change > 10 ? "📈" : t.change < -10 ? "📉" : "➡️";
                return (
                  <TableRow key={t.kode}>
                    <TableCell>{i + 1}.</TableCell>
                    <TableCell>
                      {icon} <span className="font-mono font-semibold">{t.kode}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(t.tw)}</TableCell>
                    <TableCell className="text-right">{formatNumber(t.lw)}</TableCell>
                    <TableCell className={`text-right font-semibold ${t.change > 10 ? "text-success" : t.change < -10 ? "text-destructive" : ""}`}>
                      {t.change >= 0 ? "+" : ""}{t.change.toFixed(0)}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {trends.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada data penjualan</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
