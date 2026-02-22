import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, Package, TrendingUp, TrendingDown, Skull,
  BarChart3, DollarSign, Store, ArrowDown, Minus,
  ShoppingCart, Clock, Trophy, Activity
} from "lucide-react";
import { useSalesAnalysis } from "@/hooks/useSalesAnalysis";
import { analyzeAllProducts, getStatusCounts, RULES, type DosStatus } from "@/lib/stockAnalyticsEngine";
import {
  calcTopSellers, calcTrend, calcDeadStock, calcLowStock,
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

const FILTER_CARDS: { key: FilterTab; label: string; color: string; sub: string }[] = [
  { key: "CRITICAL", label: "Critical", color: "bg-destructive", sub: "≤2 hari" },
  { key: "WARNING", label: "Warning", color: "bg-warning", sub: "≤4 hari" },
  { key: "ATTENTION", label: "Attention", color: "bg-amber-500", sub: "≤7 hari" },
  { key: "SAFE", label: "Aman", color: "bg-success", sub: ">7 hari" },
];

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

  // Additional analysis features
  // Top Seller derived from engine analyses (single source of truth for velocity)
  const topSellers = useMemo(() => {
    // Build sales qty map for "Terjual" column
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
          kode: a.kode,
          productId: a.productId,
          totalQty: sm.qty,
          days: sm.days.size,
          velocity: a.velocity,
          stok: a.currentStock,
          daysLeft: a.daysOfStock,
          isBestSeller: a.isBestSeller,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" /> Analisa
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bot-parity mode — WMA velocity, cycle {RULES.CYCLE_DAYS}d + safety + lead time {RULES.LEAD_TIME_DAYS}d
        </p>
      </div>

      <Tabs defaultValue="restock" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="restock" className="text-xs"><ShoppingCart className="h-3 w-3 mr-1" />Restock</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Budget</TabsTrigger>
          <TabsTrigger value="prediksi" className="text-xs"><Clock className="h-3 w-3 mr-1" />Prediksi</TabsTrigger>
          <TabsTrigger value="top" className="text-xs"><Trophy className="h-3 w-3 mr-1" />Top Seller</TabsTrigger>
          <TabsTrigger value="trend" className="text-xs"><Activity className="h-3 w-3 mr-1" />Trend</TabsTrigger>
          <TabsTrigger value="profit" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Profit</TabsTrigger>
          <TabsTrigger value="toko" className="text-xs"><Store className="h-3 w-3 mr-1" />Toko</TabsTrigger>
          <TabsTrigger value="dead" className="text-xs"><Skull className="h-3 w-3 mr-1" />Dead Stock</TabsTrigger>
          <TabsTrigger value="low" className="text-xs"><ArrowDown className="h-3 w-3 mr-1" />Low Stock</TabsTrigger>
          <TabsTrigger value="stats" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Ringkasan</TabsTrigger>
        </TabsList>

        {/* === RESTOCK TAB === */}
        <TabsContent value="restock" className="space-y-4">
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
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              Perlu reorder: <strong className="text-foreground">{needsReorder} produk</strong>
            </span>
            <span className="text-muted-foreground">
              Menampilkan: <strong className="text-foreground">{filtered.length} produk</strong>
            </span>
            <span className="text-muted-foreground">
              Total biaya: <strong className="text-foreground">{formatRp(totalRestockCost)}</strong>
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
                  <TableHead className="text-right">Biaya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a, i) => {
                  const badge = STATUS_BADGE[a.dosStatus];
                  const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
                  return (
                    <TableRow key={a.productId}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-semibold">
                          {a.kode}
                          {a.isBestSeller && " 🔥"}
                          {a.isStockOut && " 🚨"}
                        </div>
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
                      <TableCell className="text-right font-mono">{velPerCycle.toFixed(0)}/{RULES.DISPLAY_CYCLE_DAYS}hr</TableCell>
                      <TableCell className={`text-right font-mono ${a.daysOfStock <= 2 ? "text-destructive font-bold" : a.daysOfStock <= 4 ? "text-warning font-bold" : ""}`}>
                        {formatDaysLeft(a.daysOfStock)}
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
                      <TableCell className="text-right font-mono text-xs">
                        {a.cost > 0 ? formatRp(a.cost) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Tidak ada produk dalam kategori ini
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* === BUDGET TAB === */}
        <TabsContent value="budget" className="space-y-4">
          <h2 className="text-lg font-bold">📊 Estimasi Budget Restock</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {budgetEstimates.map((e) => {
              const label = e.days === 4 ? "1 siklus" : e.days === 7 ? "1 minggu" : e.days === 14 ? "2 minggu" : e.days === 21 ? "3 minggu" : "1 bulan";
              return (
                <Card key={e.days}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">📅 {e.days} hari ({label})</p>
                    <p className="text-xl font-bold mt-1">{formatRp(e.cost)}</p>
                    <p className="text-xs text-muted-foreground">{e.items} item | {e.qty} pcs</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* === PREDIKSI TAB === */}
        <TabsContent value="prediksi" className="space-y-4">
          <h2 className="text-lg font-bold">🔮 Prediksi Kehabisan Stok</h2>
          {(() => {
            const critical = predictions.filter(p => p.urgency === "critical");
            const warning = predictions.filter(p => p.urgency === "warning");
            const attention = predictions.filter(p => p.urgency === "attention");
            const safe = predictions.filter(p => p.urgency === "safe");
            return (
              <div className="space-y-4">
                {[
                  { items: critical, label: `🔴 KRITIS (≤${RULES.CRITICAL_DAYS} hari)`, color: "text-destructive" },
                  { items: warning, label: `🟠 WARNING (${RULES.CRITICAL_DAYS+1}-${RULES.WARNING_DAYS} hari)`, color: "text-warning" },
                  { items: attention, label: `🟡 PERHATIAN (${RULES.WARNING_DAYS+1}-${RULES.ATTENTION_DAYS} hari)`, color: "text-amber-600" },
                ].map(({ items, label, color }) => items.length > 0 && (
                  <div key={label}>
                    <h3 className={`font-semibold ${color}`}>{label} ({items.length})</h3>
                    <div className="rounded-lg border mt-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead className="text-right">Stok</TableHead>
                            <TableHead className="text-right">Velocity</TableHead>
                            <TableHead className="text-right">Habis Dalam</TableHead>
                            <TableHead>Tanggal Habis</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map(p => (
                            <TableRow key={p.productId}>
                              <TableCell className="font-semibold">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
                              <TableCell className="text-right font-mono">{p.stok}</TableCell>
                              <TableCell className="text-right font-mono">{p.velocity.toFixed(1)}/hr</TableCell>
                              <TableCell className="text-right font-mono">{formatDaysLeft(p.daysLeft)}</TableCell>
                              <TableCell className="text-xs">{p.predictedDate.toLocaleDateString("id-ID")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground">🟢 AMAN ({`>${RULES.ATTENTION_DAYS} hari`}): {safe.length} item</p>
                <p className="text-xs text-muted-foreground">Total dipantau: {predictions.length} item | Perlu perhatian: {predictions.length - safe.length} item</p>
              </div>
            );
          })()}
        </TabsContent>

        {/* === TOP SELLER TAB === */}
        <TabsContent value="top" className="space-y-4">
          <h2 className="text-lg font-bold">🏆 {RULES.DISPLAY_TOP_ITEMS} Barang Paling Laris</h2>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead className="text-right">Terjual</TableHead>
                  <TableHead className="text-right">Hari Data</TableHead>
                  <TableHead className="text-right">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Sisa Hari</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSellers.map((t, i) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                  return (
                    <TableRow key={t.productId}>
                      <TableCell>{medal}</TableCell>
                      <TableCell className="font-semibold">
                        {t.kode}{t.isBestSeller ? " 🔥" : ""}{t.days < 7 ? " ⚠️" : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono">{t.totalQty}</TableCell>
                      <TableCell className="text-right font-mono">{t.days}</TableCell>
                      <TableCell className="text-right font-mono">{(t.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                      <TableCell className="text-right font-mono">{t.stok}</TableCell>
                      <TableCell className="text-right">{urgencyIcon(t.daysLeft)} {formatDaysLeft(t.daysLeft)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">⚠️ = data &lt; 7 hari (mungkin belum akurat)</p>
        </TabsContent>

        {/* === TREND TAB === */}
        <TabsContent value="trend" className="space-y-4">
          <h2 className="text-lg font-bold">📈 Trend Penjualan 7 Hari</h2>
          {(() => {
            const totalTW = trendItems.reduce((s, t) => s + t.thisWeek, 0);
            const totalLW = trendItems.reduce((s, t) => s + t.lastWeek, 0);
            const overallChange = totalLW > 0 ? ((totalTW - totalLW) / totalLW * 100) : 0;
            return (
              <>
                <div className="flex gap-4 text-sm">
                  <span>Minggu ini: <strong>{totalTW} pcs</strong></span>
                  <span>Minggu lalu: <strong>{totalLW} pcs</strong></span>
                  <span>Perubahan: <strong className={overallChange >= 0 ? "text-success" : "text-destructive"}>
                    {overallChange >= 0 ? "+" : ""}{overallChange.toFixed(1)}%
                  </strong></span>
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead className="text-right">Minggu Ini</TableHead>
                        <TableHead className="text-right">Minggu Lalu</TableHead>
                        <TableHead className="text-right">Perubahan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendItems.map((t, i) => {
                        const icon = t.changePct > 10 ? "📈" : t.changePct < -10 ? "📉" : "➡️";
                        return (
                          <TableRow key={t.productId}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell className="font-semibold">{icon} {t.kode}{t.isBestSeller ? " 🔥" : ""}</TableCell>
                            <TableCell className="text-right font-mono">{t.thisWeek}</TableCell>
                            <TableCell className="text-right font-mono">{t.lastWeek}</TableCell>
                            <TableCell className={`text-right font-mono ${t.changePct > 0 ? "text-success" : t.changePct < 0 ? "text-destructive" : ""}`}>
                              {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(0)}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* === PROFIT TAB === */}
        <TabsContent value="profit" className="space-y-4">
          <h2 className="text-lg font-bold">💵 Barang Paling Untung (30 Hari)</h2>
          {profitItems.length === 0 ? (
            <p className="text-muted-foreground">Belum ada data profit. Pastikan data harga (modal & jual) sudah diisi.</p>
          ) : (
            <>
              <div className="flex gap-4 text-sm">
                <span>Total Untung: <strong>{formatRp(profitItems.reduce((s, p) => s + p.totalProfit, 0))}</strong></span>
                <span>Produk: <strong>{profitItems.length}</strong></span>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead className="text-right">Total Untung</TableHead>
                      <TableHead className="text-right">Terjual</TableHead>
                      <TableHead className="text-right">Margin/pcs</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitItems.slice(0, 20).map((p, i) => {
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                      return (
                        <TableRow key={p.productId}>
                          <TableCell>{medal}</TableCell>
                          <TableCell className="font-semibold">{p.kode}{p.isBestSeller ? " 🔥" : ""}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-success">{formatRp(p.totalProfit)}</TableCell>
                          <TableCell className="text-right font-mono">{p.totalQty}</TableCell>
                          <TableCell className="text-right font-mono">{formatRp(p.margin)}</TableCell>
                          <TableCell className="text-right font-mono">{p.marginPersen.toFixed(0)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* === TOKO TAB === */}
        <TabsContent value="toko" className="space-y-4">
          <h2 className="text-lg font-bold">🏪 Top Pelanggan (30 Hari)</h2>
          {tokoItems.length === 0 ? (
            <p className="text-muted-foreground">Belum ada data transaksi per toko.</p>
          ) : (
            <>
              <div className="flex gap-4 text-sm">
                <span>Total Pelanggan: <strong>{tokoItems.length}</strong></span>
                <span>Total Penjualan: <strong>{tokoItems.reduce((s, t) => s + t.totalQty, 0)} pcs</strong></span>
                <span>Total Nilai: <strong>{formatRp(tokoItems.reduce((s, t) => s + t.totalNilai, 0))}</strong></span>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Toko</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                      <TableHead className="text-right">Transaksi</TableHead>
                      <TableHead className="text-right">Hari Aktif</TableHead>
                      <TableHead>Favorit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokoItems.slice(0, 15).map((t, i) => {
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                      return (
                        <TableRow key={t.nama}>
                          <TableCell>{medal}</TableCell>
                          <TableCell className="font-semibold">{t.nama}</TableCell>
                          <TableCell className="text-right font-mono">{t.totalQty}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatRp(t.totalNilai)}</TableCell>
                          <TableCell className="text-right font-mono">{t.transaksiCount}</TableCell>
                          <TableCell className="text-right font-mono">{t.hariAktif}</TableCell>
                          <TableCell className="text-xs">{t.favorit.join(", ")}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* === DEAD STOCK TAB === */}
        <TabsContent value="dead" className="space-y-4">
          <h2 className="text-lg font-bold">💀 Barang Tidak Laku ({RULES.DEAD_STOCK_DAYS}+ hari)</h2>
          {deadStock.length === 0 ? (
            <p className="text-success">✅ Semua barang laku! Tidak ada yang macet.</p>
          ) : (
            <>
              <div className="flex gap-4 text-sm">
                <span>Jumlah: <strong>{deadStock.length} barang</strong></span>
                <span>Total stok macet: <strong>{deadStock.reduce((s, d) => s + d.stok, 0)} pcs</strong></span>
                <span>Uang nyangkut: <strong>{formatRp(deadStock.reduce((s, d) => s + d.nilai, 0))}</strong></span>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                      <TableHead className="text-right">Tidak Laku</TableHead>
                      <TableHead>Terakhir Laku</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadStock.map((d, i) => (
                      <TableRow key={d.productId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-semibold">{d.kode}</TableCell>
                        <TableCell className="text-right font-mono">{d.stok}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatRp(d.nilai)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{d.daysSinceLastSale} hari</TableCell>
                        <TableCell className="text-xs">{d.lastSaleDate ? d.lastSaleDate.toLocaleDateString("id-ID") : "Tidak pernah"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground">⚠️ Jangan beli lagi barang ini. Saran: jual obral atau kasih promo!</p>
            </>
          )}
        </TabsContent>

        {/* === LOW STOCK TAB === */}
        <TabsContent value="low" className="space-y-4">
          <h2 className="text-lg font-bold">📉 10 Stok Paling Sedikit</h2>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Laku/{RULES.DISPLAY_CYCLE_DAYS}hr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((l, i) => {
                  const icon = l.stok === 0 ? "🔴" : l.stok < 10 ? "🟡" : "🟢";
                  return (
                    <TableRow key={l.productId}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-semibold">{icon} {l.kode}{l.isBestSeller ? " 🔥" : ""}</TableCell>
                      <TableCell className={`text-right font-mono ${l.stok === 0 ? "text-destructive font-bold" : ""}`}>{l.stok}</TableCell>
                      <TableCell className="text-right font-mono">{(l.velocity * RULES.DISPLAY_CYCLE_DAYS).toFixed(0)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* === STATS TAB === */}
        <TabsContent value="stats" className="space-y-4">
          <h2 className="text-lg font-bold">📊 Ringkasan Stok</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">📦 Jenis Barang</p>
              <p className="text-2xl font-bold">{stats.totalSKU}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">🧵 Total Stok</p>
              <p className="text-2xl font-bold">{stats.totalStock.toLocaleString("id-ID")} pcs</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">💵 Nilai Barang</p>
              <p className="text-2xl font-bold">{formatRp(stats.totalValue)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">🔴 Habis</p>
              <p className="text-2xl font-bold text-destructive">{stats.outOfStock}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">⚠️ Mau Habis</p>
              <p className="text-2xl font-bold text-warning">{stats.criticalCount}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">🔥 Laris</p>
              <p className="text-2xl font-bold text-primary">{stats.bestSellerCount}</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-4 space-y-1 text-sm">
              <p className="font-semibold">⚙️ Pengaturan Analisa:</p>
              <p>📊 Siklus belanja: {RULES.CYCLE_DAYS} hari</p>
              <p>🔥 Laris kalau laku: {RULES.BESTSELLER_VELOCITY}/hari</p>
              <p>💀 Tidak laku setelah: {RULES.DEAD_STOCK_DAYS} hari</p>
              <p>📦 Beli minimal: {RULES.BATCH} pcs (BW: {RULES.BATCH_BW} pcs)</p>
              <p>🚚 Lead time: {RULES.LEAD_TIME_DAYS} hari</p>
              <p>📈 WMA: {RULES.WMA_PERIOD1_DAYS}hr ({RULES.WMA_PERIOD1_WEIGHT * 100}%) + sisa ({RULES.WMA_PERIOD2_WEIGHT * 100}%)</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analisa;
