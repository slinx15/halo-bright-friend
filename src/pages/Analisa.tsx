import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Package, Receipt, DollarSign } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 Hari" },
  { value: 30, label: "30 Hari" },
  { value: 90, label: "3 Bulan" },
  { value: 365, label: "1 Tahun" },
  { value: 9999, label: "Semua" },
];

const Analisa = () => {
  const [days, setDays] = useState(7);
  const { dailySales, topProducts, summary, isLoading } = useSalesAnalysis(days);

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Analisa Penjualan</h1>
            <p className="text-muted-foreground text-sm">Ringkasan & grafik penjualan</p>
          </div>
        </div>

        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {PERIOD_OPTIONS.map((o) => (
              <TabsTrigger key={o.value} value={String(o.value)}>{o.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Total Pendapatan"
          value={formatRupiah(summary.totalRevenue)}
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total Profit"
          value={formatRupiah(summary.totalProfit)}
          className={summary.totalProfit > 0 ? "text-success" : "text-destructive"}
        />
        <SummaryCard
          icon={<Package className="h-4 w-4" />}
          label="Total Qty Terjual"
          value={formatNumber(summary.totalQty)}
        />
        <SummaryCard
          icon={<Receipt className="h-4 w-4" />}
          label="Jumlah Transaksi"
          value={formatNumber(summary.txCount)}
        />
      </div>

      {/* Daily Sales Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Penjualan Harian</CardTitle>
        </CardHeader>
        <CardContent>
          {dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : String(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === "totalRevenue" ? formatRupiah(value) : formatNumber(value),
                    name === "totalRevenue" ? "Pendapatan" : "Qty",
                  ]}
                  labelFormatter={(label) => `Tanggal: ${label}`}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                />
                <Legend formatter={(value) => (value === "totalRevenue" ? "Pendapatan" : "Qty Terjual")} />
                <Bar dataKey="totalRevenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="totalRevenue" />
                <Bar dataKey="totalQty" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} name="totalQty" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Belum ada data penjualan dalam {days} hari terakhir</p>
          )}
        </CardContent>
      </Card>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🏆 Top 10 Produk Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Pendapatan</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, i) => (
                    <TableRow key={p.kode}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono font-semibold">{p.kode}</TableCell>
                      <TableCell className="text-sm">{p.nama}</TableCell>
                      <TableCell className="text-right font-semibold">{formatNumber(p.totalQty)}</TableCell>
                      <TableCell className="text-right text-sm">{formatRupiah(p.totalRevenue)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-success">{formatRupiah(p.totalProfit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Belum ada data penjualan</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function SummaryCard({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}
          {label}
        </div>
        <p className={`text-lg font-bold truncate ${className ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default Analisa;
