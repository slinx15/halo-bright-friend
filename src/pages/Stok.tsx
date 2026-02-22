import { useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Search, AlertTriangle, TrendingUp } from "lucide-react";
import { formatNumber, formatRupiah, getStockStatus, getStockStatusColor } from "@/lib/formatters";
import { StokSkeleton } from "@/components/LoadingSkeletons";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { useIsMobile } from "@/hooks/use-mobile";
import { Progress } from "@/components/ui/progress";

const Stok = () => {
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const filtered = products?.filter(
    (p) =>
      p.kode.toLowerCase().includes(search.toLowerCase()) ||
      p.nama.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = filtered?.length ?? 0;
  const totalStok = filtered?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;
  const kritis = filtered?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "kritis").length ?? 0;
  const warning = filtered?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length ?? 0;

  if (isLoading) return <StokSkeleton />;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Manajemen Stok</h1>
          <p className="text-muted-foreground text-sm">Lihat semua stok produk</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:overflow-visible">
        {[
          { icon: Package, label: "Total Item", value: formatNumber(totalItems), color: "text-primary", bg: "bg-primary/10" },
          { icon: TrendingUp, label: "Total Stok", value: formatNumber(totalStok), color: "text-success", bg: "bg-success/10" },
          { icon: AlertTriangle, label: "Warning", value: String(warning), color: "text-warning", bg: "bg-warning/10" },
          { icon: AlertTriangle, label: "Kritis", value: String(kritis), color: "text-destructive", bg: "bg-destructive/10" },
        ].map((kpi) => (
          <Card key={kpi.label} className="boss-card min-w-[150px] snap-start">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-xl font-extrabold tabular-nums">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{kpi.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daftar Stok */}
      <Card className="boss-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold">Daftar Stok</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 rounded-lg" placeholder="Cari kode / nama..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            /* Mobile: Cards */
            <div className="space-y-2.5">
              {filtered?.length === 0 && (
                <div className="py-8 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Tidak ada data</p>
                </div>
              )}
              {filtered?.map((p) => {
                const jumlah = p.stock?.jumlah ?? 0;
                const status = getStockStatus(jumlah);
                const stacks = (p.stock?.tumpukan_detail as number[]) ?? [];
                const pct = Math.min((jumlah / 50) * 100, 100);
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3.5 space-y-2 press-scale transition-all duration-200 ${
                      status === "kritis" ? "border-l-[3px] border-l-destructive border-border/60" :
                      status === "warning" ? "border-l-[3px] border-l-warning border-border/60" :
                      "border-border/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-sm">{p.kode}</span>
                        <Badge variant="secondary" className={`text-[10px] rounded-full px-2 ${getStockStatusColor(status)}`}>
                          {status === "kritis" ? "Kritis" : status === "warning" ? "Warning" : "Aman"}
                        </Badge>
                      </div>
                      <span className="font-extrabold text-lg tabular-nums">{formatNumber(jumlah)}</span>
                    </div>
                    <Progress
                      value={pct}
                      className={`h-1.5 ${
                        status === "kritis" ? "[&>div]:bg-destructive" :
                        status === "warning" ? "[&>div]:bg-warning" :
                        "[&>div]:bg-success"
                      }`}
                    />
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Modal</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Normal</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Grosir</span>
                        <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</p>
                      </div>
                    </div>
                    {stacks.length > 0 && (
                      <div className="text-xs">
                        <TumpukanBadges stacks={stacks} kode={p.kode} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop: Table */
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
                  {filtered?.map((p) => {
                    const jumlah = p.stock?.jumlah ?? 0;
                    const status = getStockStatus(jumlah);
                    const stacks = (p.stock?.tumpukan_detail as number[]) ?? [];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-semibold">{p.kode}</TableCell>
                        <TableCell>{p.nama}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatNumber(jumlah)}</TableCell>
                        <TableCell><TumpukanBadges stacks={stacks} kode={p.kode} /></TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${getStockStatusColor(status)} rounded-full`}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Stok;
