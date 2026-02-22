import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package } from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, type DosStatus } from "@/lib/stockAnalyticsEngine";

type FilterTab = "ALL" | "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

const STATUS_BADGE: Record<DosStatus, { label: string; className: string }> = {
  CRITICAL: { label: "Restock Sekarang", className: "bg-destructive/15 text-destructive border-destructive/30" },
  WARNING: { label: "Segera Habis", className: "bg-warning/15 text-warning border-warning/30" },
  ATTENTION: { label: "Perhatian", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  SAFE: { label: "Aman", className: "bg-success/15 text-success border-success/30" },
};

const FILTER_CARDS: { key: FilterTab; label: string; color: string; sub: string }[] = [
  { key: "CRITICAL", label: "Critical", color: "bg-destructive", sub: "≤2 hari" },
  { key: "WARNING", label: "Warning", color: "bg-warning", sub: "≤4 hari" },
  { key: "ATTENTION", label: "Attention", color: "bg-amber-500", sub: "≤7 hari" },
  { key: "SAFE", label: "Aman", color: "bg-success", sub: ">7 hari" },
];

const Analisa = () => {
  const { products, stockOutData, isLoading } = useSalesAnalysis();
  const [filter, setFilter] = useState<FilterTab>("ALL");

  const analyses = useMemo(() => {
    if (!products.length) return [];
    return analyzeAllProducts(products, stockOutData);
  }, [products, stockOutData]);

  const counts = useMemo(() => getStatusCounts(analyses), [analyses]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return analyses;
    return analyses.filter((a) => a.dosStatus === filter);
  }, [analyses, filter]);

  const needsReorder = useMemo(() => analyses.filter((a) => a.recommendedQty > 0).length, [analyses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" /> Analisa Restock
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bot-parity mode — cycle 3 hari + safety stock
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {FILTER_CARDS.map((c) => {
          const count = counts[c.key.toLowerCase() as keyof typeof counts];
          const isActive = filter === c.key;
          return (
            <Card
              key={c.key}
              className={`cursor-pointer transition-all hover:scale-[1.02] ${isActive ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFilter(filter === c.key ? "ALL" : c.key)}
            >
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  <span className="text-xs font-medium">{c.label}</span>
                </div>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-[10px] text-muted-foreground">{c.sub}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card
          className={`cursor-pointer transition-all hover:scale-[1.02] ${filter === "ALL" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
              <span className="text-xs font-medium">Total</span>
            </div>
            <p className="text-2xl font-bold">{analyses.length}</p>
            <p className="text-[10px] text-muted-foreground">semua produk</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-muted-foreground">
          Perlu reorder: <strong className="text-foreground">{needsReorder} produk</strong>
        </span>
        <span className="text-muted-foreground">
          Menampilkan: <strong className="text-foreground">{filtered.length} produk</strong>
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Velocity</TableHead>
              <TableHead className="text-right">Sisa Hari</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Rekomendasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a, i) => {
              const badge = STATUS_BADGE[a.dosStatus];
              return (
                <TableRow key={a.productId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{a.kode}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[120px]">{a.nama}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={badge.className}>
                      {a.dosStatus === "CRITICAL" && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono ${a.currentStock === 0 ? "text-destructive font-bold" : ""}`}>
                    {a.currentStock}
                  </TableCell>
                  <TableCell className="text-right font-mono">{a.velocity}/hr</TableCell>
                  <TableCell className={`text-right font-mono ${a.daysOfStock <= 2 ? "text-destructive font-bold" : a.daysOfStock <= 4 ? "text-warning font-bold" : ""}`}>
                    {a.daysOfStock >= 999 ? "∞" : `${a.daysOfStock}hr`}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {a.targetStock} ({a.targetDays}d)
                  </TableCell>
                  <TableCell className="text-right">
                    {a.recommendedQty > 0 ? (
                      <span className="font-bold text-primary">{a.recommendedQty}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Tidak ada produk dalam kategori ini
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Analisa;
