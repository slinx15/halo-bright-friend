import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { ProductWithDetails } from "@/hooks/useProducts";

interface StockOutItem {
  product_id: string;
  qty_kirim: number;
  created_at: string;
}

interface Props {
  products: ProductWithDetails[] | undefined;
  stockOutData: StockOutItem[] | undefined;
}

export function PalingUntung({ products, stockOutData }: Props) {
  const { profitItems, grandTotalProfit, marginItems } = useMemo(() => {
    if (!products || !stockOutData) return { profitItems: [], grandTotalProfit: 0, marginItems: [] };

    // Sales per product_id
    const salesMap: Record<string, number> = {};
    for (const s of stockOutData) {
      salesMap[s.product_id] = (salesMap[s.product_id] || 0) + s.qty_kirim;
    }

    const items: {
      kode: string;
      qty: number;
      modal: number;
      jual: number;
      margin: number;
      marginPersen: number;
      totalProfit: number;
    }[] = [];

    for (const p of products) {
      const qty = salesMap[p.id] || 0;
      if (qty === 0) continue;
      const modal = p.prices?.harga_modal ?? 0;
      const jual = p.prices?.harga_normal ?? 0;
      if (modal === 0 || jual === 0) continue;
      const margin = jual - modal;
      if (margin <= 0) continue;
      const marginPersen = (margin / modal) * 100;
      items.push({ kode: p.kode, qty, modal, jual, margin, marginPersen, totalProfit: qty * margin });
    }

    const byProfit = [...items].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 20);
    const byMargin = [...items].sort((a, b) => b.marginPersen - a.marginPersen).slice(0, 10);
    const grand = items.reduce((s, i) => s + i.totalProfit, 0);

    return { profitItems: byProfit, grandTotalProfit: grand, marginItems: byMargin };
  }, [products, stockOutData]);

  const getMedal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" /> 20 Barang Paling Untung
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
                  <TableHead className="text-right">Untung/pcs</TableHead>
                  <TableHead className="text-right">Total Untung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitItems.map((item, i) => (
                  <TableRow key={item.kode}>
                    <TableCell>{getMedal(i)}</TableCell>
                    <TableCell className="font-mono font-semibold">{item.kode}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.qty)} pcs</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatRupiah(item.margin)}
                      <span className="text-muted-foreground ml-1">({item.marginPersen.toFixed(0)}%)</span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatRupiah(item.totalProfit)}</TableCell>
                  </TableRow>
                ))}
                {profitItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada data profit</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm">
            💵 Total Untung: <span className="font-bold text-primary">{formatRupiah(grandTotalProfit)}</span>
          </div>
        </CardContent>
      </Card>

      {marginItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📈 10 Barang Margin Terbesar (% dari modal)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-right">Modal</TableHead>
                    <TableHead className="text-right">Jual</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginItems.map((item, i) => (
                    <TableRow key={item.kode}>
                      <TableCell>{i + 1}.</TableCell>
                      <TableCell className="font-mono font-semibold">{item.kode}</TableCell>
                      <TableCell className="text-right text-sm">{formatRupiah(item.modal)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRupiah(item.jual)}</TableCell>
                      <TableCell className="text-right font-bold text-success">{item.marginPersen.toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
