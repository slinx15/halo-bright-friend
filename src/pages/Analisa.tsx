import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, TrendingUp, TrendingDown, Minus, Package, Skull,
  ShoppingCart, Calendar, ArrowUpDown, Flame, Info
} from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import {
  analyzeAllProducts,
  getStatusCounts,
  getTotalRestockCost,
  type ProductAnalysis,
} from "@/lib/stockAnalyticsEngine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FilterTab = "ALL" | "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE" | "DEAD";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  CRITICAL: { label: "Restock Sekarang", icon: <AlertTriangle className="h-3.5 w-3.5" />, className: "bg-destructive/15 text-destructive border-destructive/30" },
  WARNING: { label: "Segera Habis", icon: <AlertTriangle className="h-3.5 w-3.5" />, className: "bg-warning/15 text-warning border-warning/30" },
  ATTENTION: { label: "Perhatian", icon: <Package className="h-3.5 w-3.5" />, className: "bg-accent/15 text-accent-foreground border-accent/30" },
  SAFE: { label: "Aman", icon: <Package className="h-3.5 w-3.5" />, className: "bg-success/15 text-success border-success/30" },
  DEAD: { label: "Dead Stock", icon: <Skull className="h-3.5 w-3.5" />, className: "bg-muted text-muted-foreground border-border" },
};

const TREND_ICONS: Record<string, React.ReactNode> = {
  UP: <TrendingUp className="h-3.5 w-3.5 text-success" />,
  DOWN: <TrendingDown className="h-3.5 w-3.5 text-destructive" />,
  STABLE: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
};

type SortKey = "priority" | "dos" | "velocity" | "stock" | "kode";

const Analisa = () => {
  const { products, stockOutData, isLoading } = useSalesAnalysis(9999);
  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(false);

  const analyses = useMemo(() => {
    if (!products || !stockOutData) return [];
    return analyzeAllProducts(products, stockOutData);
  }, [products, stockOutData]);

  const counts = useMemo(() => getStatusCounts(analyses), [analyses]);

  const totalCost = useMemo(() => {
    if (!products) return 0;
    return getTotalRestockCost(analyses, products);
  }, [analyses, products]);

  const filtered = useMemo(() => {
    let list = analyses;
    if (filter === "DEAD") list = list.filter((a) => a.isDeadStock);
    else if (filter !== "ALL") list = list.filter((a) => !a.isDeadStock && a.dosStatus === filter);

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "priority": cmp = a.priorityScore - b.priorityScore; break;
        case "dos": cmp = a.daysOfStock - b.daysOfStock; break;
        case "velocity": cmp = a.velocity - b.velocity; break;
        case "stock": cmp = a.currentStock - b.currentStock; break;
        case "kode": cmp = a.kode.localeCompare(b.kode); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [analyses, filter, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const needsRestock = analyses.filter((a) => a.recommendedQty > 0 && !a.isDeadStock);
  const topSellers = [...analyses].sort((a, b) => b.velocity - a.velocity).slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Analisa Stok & Restock
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sistem rule-based deterministik — semua angka transparan & bisa dilacak
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatusCard
            label="🔴 Critical" count={counts.critical}
            sub={`≤${2} hari`}
            onClick={() => setFilter("CRITICAL")}
            active={filter === "CRITICAL"}
            className="border-destructive/30"
          />
          <StatusCard
            label="🟠 Warning" count={counts.warning}
            sub={`≤${4} hari`}
            onClick={() => setFilter("WARNING")}
            active={filter === "WARNING"}
            className="border-warning/30"
          />
          <StatusCard
            label="🟡 Attention" count={counts.attention}
            sub={`≤${7} hari`}
            onClick={() => setFilter("ATTENTION")}
            active={filter === "ATTENTION"}
            className="border-accent/30"
          />
          <StatusCard
            label="🟢 Aman" count={counts.safe}
            sub=">7 hari"
            onClick={() => setFilter("SAFE")}
            active={filter === "SAFE"}
            className="border-success/30"
          />
          <StatusCard
            label="💀 Dead" count={counts.dead}
            sub="≥60 hari"
            onClick={() => setFilter("DEAD")}
            active={filter === "DEAD"}
            className="border-border"
          />
          <StatusCard
            label="📦 Total" count={analyses.length}
            sub="semua produk"
            onClick={() => setFilter("ALL")}
            active={filter === "ALL"}
            className="border-primary/30"
          />
        </div>

        {/* Quick Info Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">🛒 Perlu Restock</p>
              <p className="text-lg font-bold">{needsRestock.length} produk</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">💰 Estimasi Biaya Restock</p>
              <p className="text-lg font-bold">{formatRupiah(totalCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">🔥 Top Seller</p>
              <p className="text-lg font-bold truncate">
                {topSellers[0]?.kode ?? "-"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({topSellers[0] ? `${topSellers[0].velocity}/hari` : ""})
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg">Detail Analisa Produk</CardTitle>
              <p className="text-xs text-muted-foreground">
                {filtered.length} produk ditampilkan • Klik kolom untuk sort
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <SortableHead label="Kode" sortKey="kode" current={sortKey} asc={sortAsc} onClick={handleSort} />
                    <TableHead>Status</TableHead>
                    <SortableHead label="Stok" sortKey="stock" current={sortKey} asc={sortAsc} onClick={handleSort} className="text-right" />
                    <SortableHead label="Velocity" sortKey="velocity" current={sortKey} asc={sortAsc} onClick={handleSort} className="text-right" />
                    <SortableHead label="Sisa Hari" sortKey="dos" current={sortKey} asc={sortAsc} onClick={handleSort} className="text-right" />
                    <TableHead className="text-center">Tren</TableHead>
                    <SortableHead label="Skor" sortKey="priority" current={sortKey} asc={sortAsc} onClick={handleSort} className="text-right" />
                    <TableHead className="text-right">Rekomendasi Beli</TableHead>
                    <TableHead>Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a, i) => {
                    const statusKey = a.isDeadStock ? "DEAD" : a.dosStatus;
                    const cfg = STATUS_CONFIG[statusKey];
                    return (
                      <TableRow key={a.productId}>
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-mono font-semibold text-sm">{a.kode}</span>
                            {a.isSpecialColor && (
                              <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">
                                {a.isSpecialColor === "black" ? "⬛" : "⬜"}
                              </Badge>
                            )}
                            {a.isNewProduct && (
                              <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-primary/40 text-primary">NEW</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">{a.nama}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] gap-1 ${cfg.className}`}>
                            {cfg.icon} {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatNumber(a.currentStock)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                                {a.velocity}/hr
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-[200px]">
                              <p>WMA: (avg14 × 0.7) + (avg30 × 0.3)</p>
                              <p>Avg 14hr: {a.avgDaily14}/hr</p>
                              <p>Avg 15-30hr: {a.avgDaily15_30}/hr</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={
                            a.dosStatus === "CRITICAL" ? "text-destructive font-bold" :
                            a.dosStatus === "WARNING" ? "text-warning font-semibold" : ""
                          }>
                            {a.daysOfStock >= 999 ? "∞" : `${a.daysOfStock}hr`}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1">
                            {TREND_ICONS[a.trend]}
                            {a.trendPct !== 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {a.trendPct > 0 ? "+" : ""}{a.trendPct}%
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <PriorityBar score={a.priorityScore} />
                        </TableCell>
                        <TableCell className="text-right">
                          {a.recommendedQty > 0 ? (
                            <span className="font-bold text-primary tabular-nums">
                              {formatNumber(a.recommendedQty)}
                              <span className="text-[10px] text-muted-foreground ml-0.5">
                                ({a.batchSize}×)
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {a.recommendedQty > 0 && !a.isDeadStock ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs cursor-help border-b border-dotted border-muted-foreground/40">
                                  <Calendar className="h-3 w-3 inline mr-0.5" />
                                  {formatOrderDate(a.recommendedOrderDate)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                <p>Order: {a.recommendedOrderDate}</p>
                                <p>Tiba: {a.nextRestockDay}</p>
                                <p>Lead time: 3 hari</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Tidak ada produk dalam kategori ini
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p><strong>Velocity:</strong> WMA (14hr × 70% + 15-30hr × 30%), anomali &gt;3x rata-rata dikeluarkan</p>
                <p><strong>Rekomendasi:</strong> (velocity × (lead time + safety days)) – stok, dibulatkan ke kelipatan batch</p>
                <p><strong>Jadwal:</strong> Order hanya Selasa/Kamis, lead time 3 hari</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

// ─── Sub-components ───────────────────────────────────────

function StatusCard({ label, count, sub, onClick, active, className }: {
  label: string; count: number; sub: string; onClick: () => void; active: boolean; className?: string;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${active ? "ring-2 ring-primary" : ""} ${className ?? ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-3 pb-2 px-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{count}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function SortableHead({ label, sortKey, current, asc, onClick, className }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean;
  onClick: (key: SortKey) => void; className?: string;
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ""}`}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {current === sortKey && (
          <ArrowUpDown className={`h-3 w-3 ${asc ? "rotate-180" : ""} transition-transform`} />
        )}
      </span>
    </TableHead>
  );
}

function PriorityBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-destructive" : score >= 40 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">{score}</span>
    </div>
  );
}

function formatOrderDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export default Analisa;
