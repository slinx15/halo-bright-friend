import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Package, Skull,
  BarChart3, DollarSign, Store, ArrowDown,
  ShoppingCart, Clock, Trophy, Activity
} from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, RULES, type DosStatus } from "@/lib/stockAnalyticsEngine";
import {
  calcTrend, calcDeadStock, calcLowStock,
  calcPredictions, calcProfit, calcTokoAnalysis, calcBudgetEstimates, calcStats,
} from "@/lib/analysisFeatures";

// ─── Formatting Helpers ───────────────────────────────────

function formatRp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function formatDaysLeft(d: number): string {
  if (d >= 999) return "∞";
  if (d < 1) return "< 1hr";
  return Math.round(d) + "hr";
}

function urgencyIcon(days: number) {
  if (days <= RULES.CRITICAL_DAYS) return "🔴";
  if (days <= RULES.WARNING_DAYS) return "🟠";
  if (days <= RULES.ATTENTION_DAYS) return "🟡";
  return "🟢";
}

// ─── Status Badge Config ──────────────────────────────────

type FilterTab = "ALL" | "CRITICAL" | "WARNING" | "ATTENTION" | "SAFE";

const STATUS_BADGE: Record<DosStatus, { label: string; className: string }> = {
  CRITICAL: { label: "Restock Sekarang", className: "bg-destructive/15 text-destructive border-destructive/30" },
  WARNING: { label: "Segera Habis", className: "bg-warning/15 text-warning border-warning/30" },
  ATTENTION: { label: "Perhatian", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  SAFE: { label: "Aman", className: "bg-success/15 text-success border-success/30" },
};

const STATUS_CARDS_CONFIG: { key: FilterTab; label: string; icon: string; gradient: string; textColor: string; sub: string }[] = [
  { key: "CRITICAL", label: "Kritis", icon: "🔴", gradient: "from-red-500/10 to-red-500/5", textColor: "text-destructive", sub: "≤2 hari" },
  { key: "WARNING", label: "Warning", icon: "🟠", gradient: "from-orange-500/10 to-orange-500/5", textColor: "text-warning", sub: "≤4 hari" },
  { key: "ATTENTION", label: "Perhatian", icon: "🟡", gradient: "from-amber-500/10 to-amber-500/5", textColor: "text-amber-500", sub: "≤7 hari" },
  { key: "SAFE", label: "Aman", icon: "🟢", gradient: "from-emerald-500/10 to-emerald-500/5", textColor: "text-success", sub: ">7 hari" },
];

// ─── Section Header Component ─────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

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

  const topSellers = useMemo(() => {
    const salesMap: Record<string, { qty: number; days: Set<string> }> = {};
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    for (const s of stockOutData) {
      if (new Date(s.created_at) < thirtyAgo) continue;
      if (!salesMap[s.product_id]) salesMap[s.product_id] = { qty: 0, days: new Set() };
      salesMap[s.product_id].qty += s.qty_kirim;
      salesMap[s.product_id].days.add(s.created_at.slice(0, 10));
    }
    return analyses
      .filter(a => {
        const sm = salesMap[a.productId];
        return sm && sm.qty > 0;
      })
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, RULES.DISPLAY_TOP_ITEMS)
      .map(a => {
        const sm = salesMap[a.productId] ?? { qty: 0, days: new Set() };
        return {
          kode: a.kode, productId: a.productId, totalQty: sm.qty,
          days: sm.days.size, velocity: a.velocity, stok: a.currentStock,
          daysLeft: a.daysOfStock, isBestSeller: a.isBestSeller,
        };
      });
  }, [analyses, stockOutData]);

  const trendItems = useMemo(() => calcTrend(products, stockOutData), [products, stockOutData]);
  const deadStock = useMemo(() => calcDeadStock(products, stockOutData), [products, stockOutData]);
  const lowStock = useMemo(() => calcLowStock(products, stockOutData), [products, stockOutData]);
  const predictions = useMemo(() => calcPredictions(products, stockOutData), [products, stockOutData]);
  const profitItems = useMemo(() => calcProfit(products, stockOutData), [products, stockOutData]);
  const tokoItems = useMemo(() => calcTokoAnalysis(products, stockOutData), [products, stockOutData]);
  const budgetEstimates = useMemo(() => calcBudgetEstimates(products, stockOutData), [products, stockOutData]);
  const stats = useMemo(() => calcStats(products, stockOutData), [products, stockOutData]);

  const totalRestockCost = useMemo(() => analyses.reduce((s, a) => s + a.cost, 0), [analyses]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const predCritical = predictions.filter(p => p.urgency === "critical");
  const predWarning = predictions.filter(p => p.urgency === "warning");
  const predAttention = predictions.filter(p => p.urgency === "attention");
  const predSafe = predictions.filter(p => p.urgency === "safe");

  const totalTW = trendItems.reduce((s, t) => s + t.thisWeek, 0);
  const totalLW = trendItems.reduce((s, t) => s + t.lastWeek, 0);
  const overallChange = totalLW > 0 ? ((totalTW - totalLW) / totalLW * 100) : 0;

  const totalProducts = analyses.length || 1;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Analisa Stok</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          WMA velocity · cycle {RULES.CYCLE_DAYS}d + safety + lead time {RULES.LEAD_TIME_DAYS}d
        </p>
      </div>

      <Tabs defaultValue="restock" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 rounded-xl h-auto gap-0.5">
          <TabsTrigger value="restock" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Restock
          </TabsTrigger>
          <TabsTrigger value="penjualan" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />Penjualan
          </TabsTrigger>
          <TabsTrigger value="profit" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />Profit
          </TabsTrigger>
          <TabsTrigger value="toko" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <Store className="h-3.5 w-3.5 mr-1.5" />Toko
          </TabsTrigger>
          <TabsTrigger value="dead" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <Skull className="h-3.5 w-3.5 mr-1.5" />Dead Stock
          </TabsTrigger>
          <TabsTrigger value="ringkasan" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-2">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Ringkasan
          </TabsTrigger>
        </TabsList>

        {/* ══════════ RESTOCK ══════════ */}
        <TabsContent value="restock" className="space-y-5 mt-5">
          {/* Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUS_CARDS_CONFIG.map((c) => {
              const count = counts[c.key.toLowerCase() as keyof typeof counts];
              const isActive = filter === c.key;
              const pct = Math.round((count / totalProducts) * 100);
              return (
                <Card
                  key={c.key}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md border-0 bg-gradient-to-br ${c.gradient} ${isActive ? "ring-2 ring-primary shadow-md" : "hover:scale-[1.01]"}`}
                  onClick={() => setFilter(filter === c.key ? "ALL" : c.key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                      <span className="text-lg">{c.icon}</span>
                    </div>
                    <p className={`text-2xl font-bold ${c.textColor}`}>{count}</p>
                    <div className="mt-2">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{c.sub} · {pct}%</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Quick Stats Bar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">Perlu reorder:</span>
              <span className="font-semibold">{needsReorder}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Ditampilkan:</span>
              <span className="font-semibold">{filtered.length}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Total biaya:</span>
              <span className="font-semibold">{formatRp(totalRestockCost)}</span>
            </div>
            {filter !== "ALL" && (
              <>
                <div className="h-4 w-px bg-border" />
                <button onClick={() => setFilter("ALL")} className="text-primary hover:underline font-medium">
                  Reset filter
                </button>
              </>
            )}
          </div>

          {/* Restock Table */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs">Kode</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Stok</TableHead>
                    <TableHead className="text-right text-xs">Velocity</TableHead>
                    <TableHead className="text-right text-xs">Sisa Hari</TableHead>
                    <TableHead className="text-right text-xs">Target</TableHead>
                    <TableHead className="text-right text-xs">Rekomendasi</TableHead>
                    <TableHead className="text-right text-xs">Biaya</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a, i) => {
                    const badge = STATUS_BADGE[a.dosStatus];
                    const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
                    return (
                      <TableRow key={a.productId} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/20"}>
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-sm">
                            {a.kode}
                            {a.isBestSeller && " 🔥"}
                            {a.isStockOut && " 🚨"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[100px]">{a.nama}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${badge.className}`}>
                            {a.dosStatus === "CRITICAL" && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${a.currentStock === 0 ? "text-destructive font-bold" : ""}`}>
                          {a.currentStock}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{velPerCycle.toFixed(0)}/{RULES.DISPLAY_CYCLE_DAYS}hr</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${a.daysOfStock <= 2 ? "text-destructive font-bold" : a.daysOfStock <= 4 ? "text-warning font-bold" : ""}`}>
                          {formatDaysLeft(a.daysOfStock)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {a.targetStock} <span className="opacity-60">({a.targetDays}d)</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {a.recommendedQty > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-sm">
                              {a.recommendedQty}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {a.cost > 0 ? formatRp(a.cost) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                        Tidak ada produk dalam kategori ini
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Prediksi */}
          <Card className="border-0 shadow-sm p-5 space-y-4">
            <SectionHeader icon={Clock} title="Prediksi Kehabisan Stok" subtitle="Berdasarkan velocity saat ini" />
            {[
              { items: predCritical, label: `Kritis — ≤${RULES.CRITICAL_DAYS} hari`, color: "text-destructive", dot: "bg-destructive" },
              { items: predWarning, label: `Warning — ${RULES.CRITICAL_DAYS + 1}-${RULES.WARNING_DAYS} hari`, color: "text-warning", dot: "bg-warning" },
              { items: predAttention, label: `Perhatian — ${RULES.WARNING_DAYS + 1}-${RULES.ATTENTION_DAYS} hari`, color: "text-amber-500", dot: "bg-amber-500" },
            ].map(({ items, label, color, dot }) => items.length > 0 && (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <h4 className={`text-xs font-semibold ${color}`}>{label} ({items.length})</h4>
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="text-xs">Kode</TableHead>
                        <TableHead className="text-right text-xs">Stok</TableHead>
                        <TableHead className="text-right text-xs">Velocity</TableHead>
                        <TableHead className="text-right text-xs">Habis Dalam</TableHead>
                        <TableHead className="text-xs">Tanggal Habis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(p => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{p.stok}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{p.velocity.toFixed(1)}/hr</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatDaysLeft(p.daysLeft)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.predictedDate.toLocaleDateString("id-ID")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">🟢 Aman ({`>${RULES.ATTENTION_DAYS} hari`}): {predSafe.length} item</p>
          </Card>

          {/* Low Stock */}
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={ArrowDown} title="10 Stok Paling Sedikit" />
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs">Kode</TableHead>
                    <TableHead className="text-right text-xs">Stok</TableHead>
                    <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((l, i) => {
                    const icon = l.stok === 0 ? "🔴" : l.stok < 10 ? "🟡" : "🟢";
                    return (
                      <TableRow key={l.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                        <TableCell className="text-xs">{i + 1}</TableCell>
                        <TableCell className="font-semibold text-sm">{icon} {l.kode}{l.isBestSeller ? " 🔥" : ""}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${l.stok === 0 ? "text-destructive font-bold" : ""}`}>{l.stok}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(l.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════ PENJUALAN ══════════ */}
        <TabsContent value="penjualan" className="space-y-5 mt-5">
          {/* Top Seller */}
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={Trophy} title={`${RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris`} subtitle="30 hari terakhir" />
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs">Kode</TableHead>
                    <TableHead className="text-right text-xs">Terjual</TableHead>
                    <TableHead className="text-right text-xs">Hari Data</TableHead>
                    <TableHead className="text-right text-xs">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                    <TableHead className="text-right text-xs">Stok</TableHead>
                    <TableHead className="text-right text-xs">Sisa Hari</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSellers.map((t, i) => {
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                    return (
                      <TableRow key={t.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                        <TableCell className="font-medium">{medal}</TableCell>
                        <TableCell className="font-semibold text-sm">
                          {t.kode}{t.isBestSeller ? " 🔥" : ""}{t.days < 7 ? " ⚠️" : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.totalQty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.days}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(t.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.stok}</TableCell>
                        <TableCell className="text-right text-sm">{urgencyIcon(t.daysLeft)} {formatDaysLeft(t.daysLeft)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">⚠️ = data &lt; 7 hari (mungkin belum akurat)</p>
          </Card>

          {/* Trend */}
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={Activity} title="Trend Penjualan 7 Hari" />
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Minggu ini", value: `${totalTW} pcs`, color: "" },
                { label: "Minggu lalu", value: `${totalLW} pcs`, color: "" },
                { label: "Perubahan", value: `${overallChange >= 0 ? "+" : ""}${overallChange.toFixed(1)}%`, color: overallChange >= 0 ? "text-success" : "text-destructive" },
              ].map(s => (
                <div key={s.label} className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                  <span className="text-muted-foreground">{s.label}: </span>
                  <span className={`font-semibold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="w-10 text-xs">#</TableHead>
                    <TableHead className="text-xs">Kode</TableHead>
                    <TableHead className="text-right text-xs">Minggu Ini</TableHead>
                    <TableHead className="text-right text-xs">Minggu Lalu</TableHead>
                    <TableHead className="text-right text-xs">Perubahan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendItems.map((t, i) => {
                    const icon = t.changePct > 10 ? "📈" : t.changePct < -10 ? "📉" : "➡️";
                    return (
                      <TableRow key={t.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                        <TableCell className="text-xs">{i + 1}</TableCell>
                        <TableCell className="font-semibold text-sm">{icon} {t.kode}{t.isBestSeller ? " 🔥" : ""}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.thisWeek}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.lastWeek}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${t.changePct > 0 ? "text-success" : t.changePct < 0 ? "text-destructive" : ""}`}>
                          {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════ PROFIT ══════════ */}
        <TabsContent value="profit" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={DollarSign} title="Barang Paling Untung" subtitle="30 hari terakhir" />
            {profitItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data profit. Pastikan data harga sudah diisi.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <div className="px-3 py-2 rounded-lg bg-success/10 text-xs">
                    <span className="text-muted-foreground">Total Untung: </span>
                    <span className="font-semibold text-success">{formatRp(profitItems.reduce((s, p) => s + p.totalProfit, 0))}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                    <span className="text-muted-foreground">Produk: </span>
                    <span className="font-semibold">{profitItems.length}</span>
                  </div>
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="w-10 text-xs">#</TableHead>
                        <TableHead className="text-xs">Kode</TableHead>
                        <TableHead className="text-right text-xs">Total Untung</TableHead>
                        <TableHead className="text-right text-xs">Terjual</TableHead>
                        <TableHead className="text-right text-xs">Margin/pcs</TableHead>
                        <TableHead className="text-right text-xs">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profitItems.slice(0, 20).map((p, i) => {
                        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                        return (
                          <TableRow key={p.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                            <TableCell>{medal}</TableCell>
                            <TableCell className="font-semibold text-sm">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold text-success">{formatRp(p.totalProfit)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.totalQty}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatRp(p.margin)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{p.marginPersen.toFixed(0)}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ TOKO ══════════ */}
        <TabsContent value="toko" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={Store} title="Top Pelanggan" subtitle="30 hari terakhir" />
            {tokoItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data transaksi per toko.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Pelanggan", value: String(tokoItems.length) },
                    { label: "Total Penjualan", value: `${tokoItems.reduce((s, t) => s + t.totalQty, 0)} pcs` },
                    { label: "Total Nilai", value: formatRp(tokoItems.reduce((s, t) => s + t.totalNilai, 0)) },
                  ].map(s => (
                    <div key={s.label} className="px-3 py-2 rounded-lg bg-muted/40 text-xs">
                      <span className="text-muted-foreground">{s.label}: </span>
                      <span className="font-semibold">{s.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="w-10 text-xs">#</TableHead>
                        <TableHead className="text-xs">Toko</TableHead>
                        <TableHead className="text-right text-xs">Qty</TableHead>
                        <TableHead className="text-right text-xs">Nilai</TableHead>
                        <TableHead className="text-right text-xs">Transaksi</TableHead>
                        <TableHead className="text-right text-xs">Hari Aktif</TableHead>
                        <TableHead className="text-xs">Favorit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokoItems.slice(0, 15).map((t, i) => {
                        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                        return (
                          <TableRow key={t.nama} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                            <TableCell>{medal}</TableCell>
                            <TableCell className="font-semibold text-sm">{t.nama}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{t.totalQty}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatRp(t.totalNilai)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{t.transaksiCount}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{t.hariAktif}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{t.favorit.join(", ")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ DEAD STOCK ══════════ */}
        <TabsContent value="dead" className="space-y-5 mt-5">
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={Skull} title={`Barang Tidak Laku (${RULES.DEAD_STOCK_DAYS}+ hari)`} />
            {deadStock.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-success text-lg">✅</p>
                <p className="text-sm font-medium mt-1">Semua barang laku!</p>
                <p className="text-xs text-muted-foreground">Tidak ada yang macet</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Jumlah", value: `${deadStock.length} barang` },
                    { label: "Stok macet", value: `${deadStock.reduce((s, d) => s + d.stok, 0)} pcs` },
                    { label: "Uang nyangkut", value: formatRp(deadStock.reduce((s, d) => s + d.nilai, 0)) },
                  ].map(s => (
                    <div key={s.label} className="px-3 py-2 rounded-lg bg-destructive/10 text-xs">
                      <span className="text-muted-foreground">{s.label}: </span>
                      <span className="font-semibold">{s.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="w-10 text-xs">#</TableHead>
                        <TableHead className="text-xs">Kode</TableHead>
                        <TableHead className="text-right text-xs">Stok</TableHead>
                        <TableHead className="text-right text-xs">Nilai</TableHead>
                        <TableHead className="text-right text-xs">Tidak Laku</TableHead>
                        <TableHead className="text-xs">Terakhir Laku</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deadStock.map((d, i) => (
                        <TableRow key={d.productId} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="font-semibold text-sm">{d.kode}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{d.stok}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(d.nilai)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-destructive">{d.daysSinceLastSale} hari</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.lastSaleDate ? d.lastSaleDate.toLocaleDateString("id-ID") : "Tidak pernah"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">💡 Saran: jual obral atau kasih promo untuk barang-barang ini</p>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ══════════ RINGKASAN ══════════ */}
        <TabsContent value="ringkasan" className="space-y-5 mt-5">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: "📦", label: "Jenis Barang", value: String(stats.totalSKU), color: "" },
              { icon: "🧵", label: "Total Stok", value: `${stats.totalStock.toLocaleString("id-ID")} pcs`, color: "" },
              { icon: "💵", label: "Nilai Barang", value: formatRp(stats.totalValue), color: "" },
              { icon: "🔴", label: "Habis", value: String(stats.outOfStock), color: "text-destructive" },
              { icon: "⚠️", label: "Mau Habis", value: String(stats.criticalCount), color: "text-warning" },
              { icon: "🔥", label: "Laris", value: String(stats.bestSellerCount), color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{s.icon}</span>
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Budget */}
          <Card className="border-0 shadow-sm p-5 space-y-3">
            <SectionHeader icon={DollarSign} title="Estimasi Budget Restock" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {budgetEstimates.map((e) => {
                const label = e.days === 4 ? "1 siklus" : e.days === 7 ? "1 minggu" : e.days === 14 ? "2 minggu" : e.days === 21 ? "3 minggu" : "1 bulan";
                return (
                  <div key={e.days} className="p-4 rounded-xl bg-muted/30 space-y-1">
                    <p className="text-xs text-muted-foreground">{e.days} hari · {label}</p>
                    <p className="text-lg font-bold">{formatRp(e.cost)}</p>
                    <p className="text-[11px] text-muted-foreground">{e.items} item · {e.qty} pcs</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Settings */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground text-sm">⚙️ Pengaturan Analisa</p>
              <div className="grid grid-cols-2 gap-1">
                <p>Siklus belanja: {RULES.CYCLE_DAYS} hari</p>
                <p>Laris jika laku: {RULES.BESTSELLER_VELOCITY}/hari</p>
                <p>Dead stock setelah: {RULES.DEAD_STOCK_DAYS} hari</p>
                <p>Beli minimal: {RULES.BATCH} pcs (BW: {RULES.BATCH_BW})</p>
                <p>Lead time: {RULES.LEAD_TIME_DAYS} hari</p>
                <p>WMA: {RULES.WMA_PERIOD1_DAYS}hr ({RULES.WMA_PERIOD1_WEIGHT * 100}%) + sisa ({RULES.WMA_PERIOD2_WEIGHT * 100}%)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analisa;
