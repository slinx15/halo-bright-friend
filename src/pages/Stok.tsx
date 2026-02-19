import { useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Search } from "lucide-react";
import { formatNumber, formatRupiah, getStockStatus, getStockStatusColor } from "@/lib/formatters";

const Stok = () => {
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");

  const filtered = products?.filter(
    (p) =>
      p.kode.toLowerCase().includes(search.toLowerCase()) ||
      p.nama.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = filtered?.length ?? 0;
  const totalStok = filtered?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;
  const kritis = filtered?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "kritis").length ?? 0;
  const warning = filtered?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Manajemen Stok</h1>
          <p className="text-muted-foreground text-sm">Lihat semua stok produk</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{formatNumber(totalItems)}</p>
          <p className="text-xs text-muted-foreground">Total Item</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{formatNumber(totalStok)}</p>
          <p className="text-xs text-muted-foreground">Total Stok</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-warning">{warning}</p>
          <p className="text-xs text-muted-foreground">Warning</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-destructive">{kritis}</p>
          <p className="text-xs text-muted-foreground">Kritis</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Daftar Stok</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari kode / nama..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead>Tumpukan</TableHead>
                  <TableHead className="text-right">Modal</TableHead>
                  <TableHead className="text-right">Normal</TableHead>
                  <TableHead className="text-right">Grosir</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Memuat...</TableCell></TableRow>
                ) : filtered?.map((p) => {
                  const jumlah = p.stock?.jumlah ?? 0;
                  const status = getStockStatus(jumlah);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">{p.kode}</TableCell>
                      <TableCell>{p.nama}</TableCell>
                      <TableCell className="text-right font-bold">{formatNumber(jumlah)}</TableCell>
                      <TableCell>{p.stock?.tumpukan || "-"}</TableCell>
                      <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getStockStatusColor(status)}>
                          {status === "kritis" ? "Kritis" : status === "warning" ? "Warning" : "Aman"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered?.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Tidak ada data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Stok;
