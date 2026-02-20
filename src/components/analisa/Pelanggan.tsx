import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";

interface StockOutRecord {
  product_id: string;
  qty_kirim: number;
  created_at: string;
  toko: string | null;
  total_harga: number;
  harga_satuan: number;
}

interface Product {
  id: string;
  kode: string;
  nama: string;
}

interface PelangganProps {
  stockOutData: StockOutRecord[] | undefined;
  products: Product[] | undefined;
}

interface TokoSummary {
  toko: string;
  totalQty: number;
  totalOmzet: number;
  transaksiCount: number;
  avgPerTransaksi: number;
  produkFavorit: string; // kode produk paling sering dibeli
  produkFavoritNama: string;
}

export function Pelanggan({ stockOutData, products }: PelangganProps) {
  const tokoData = useMemo<TokoSummary[]>(() => {
    if (!stockOutData || !products) return [];

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Group by toko
    const grouped: Record<string, StockOutRecord[]> = {};
    for (const s of stockOutData) {
      const name = s.toko?.trim() || "Tanpa Nama";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(s);
    }

    return Object.entries(grouped)
      .map(([toko, records]) => {
        const totalQty = records.reduce((s, r) => s + r.qty_kirim, 0);
        const totalOmzet = records.reduce((s, r) => s + r.total_harga, 0);
        const transaksiCount = records.length;
        const avgPerTransaksi = transaksiCount > 0 ? Math.round(totalOmzet / transaksiCount) : 0;

        // Produk favorit: most purchased product_id by qty
        const prodQty: Record<string, number> = {};
        for (const r of records) {
          prodQty[r.product_id] = (prodQty[r.product_id] || 0) + r.qty_kirim;
        }
        const favId = Object.entries(prodQty).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        const favProduct = productMap.get(favId);

        return {
          toko,
          totalQty,
          totalOmzet,
          transaksiCount,
          avgPerTransaksi,
          produkFavorit: favProduct?.kode || "-",
          produkFavoritNama: favProduct?.nama || "-",
        };
      })
      .sort((a, b) => b.totalOmzet - a.totalOmzet);
  }, [stockOutData, products]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" /> Analisa Pelanggan / Toko ({tokoData.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tokoData.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Toko / Pelanggan</TableHead>
                  <TableHead className="text-right">Transaksi</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Total Omzet</TableHead>
                  <TableHead className="text-right">Rata-rata/Trx</TableHead>
                  <TableHead>Produk Favorit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokoData.map((t, i) => (
                  <TableRow key={t.toko}>
                    <TableCell className="font-semibold">{i + 1}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{t.toko}</span>
                      {t.toko === "Tanpa Nama" && (
                        <Badge variant="secondary" className="ml-2 text-xs bg-muted text-muted-foreground">
                          Tanpa nama
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(t.transaksiCount)}</TableCell>
                    <TableCell className="text-right">{formatNumber(t.totalQty)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatRupiah(t.totalOmzet)}</TableCell>
                    <TableCell className="text-right text-sm">{formatRupiah(t.avgPerTransaksi)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono">{t.produkFavorit}</span>
                      {t.produkFavoritNama !== "-" && (
                        <span className="text-muted-foreground ml-1">({t.produkFavoritNama})</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            Belum ada data penjualan untuk analisa pelanggan
          </p>
        )}
      </CardContent>
    </Card>
  );
}
