import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, ShoppingCart } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { useStockAnalysis } from "@/hooks/useStockAnalysis";
import { PeriodFilter, getPeriodDays } from "@/components/analisa/PeriodFilter";
import { ReviewBelanjaan } from "@/components/analisa/ReviewBelanjaan";
import { PerkiraanBiaya } from "@/components/analisa/PerkiraanBiaya";
import { KapanHabis } from "@/components/analisa/KapanHabis";
import { PalingLaris } from "@/components/analisa/PalingLaris";
import { NaikTurun } from "@/components/analisa/NaikTurun";
import { PalingUntung } from "@/components/analisa/PalingUntung";
import { StokSedikit } from "@/components/analisa/StokSedikit";
import { RingkasanStok } from "@/components/analisa/RingkasanStok";
import { AlertTriangle, TrendingDown } from "lucide-react";

const VIEW_OPTIONS = [
  { value: "velocity", label: "🛒 Perlu Beli Apa?" },
  { value: "budget", label: "💰 Belanja Sesuai Uang" },
  { value: "review", label: "📋 Review Belanjaan" },
  { value: "perkiraan", label: "📊 Perkiraan Biaya" },
  { value: "kapanhabis", label: "🔮 Kapan Habis?" },
  { value: "laris", label: "🏆 Paling Laris" },
  { value: "trend", label: "📈 Naik/Turun" },
  { value: "untung", label: "💵 Paling Untung" },
  { value: "stoksedikit", label: "📉 Stok Sedikit" },
  { value: "deadstock", label: "💀 Tidak Laku" },
  { value: "ringkasan", label: "📊 Ringkasan" },
];

const Analisa = () => {
  const [view, setView] = useState("velocity");
  const [budget, setBudget] = useState(0);
  const [showBudget, setShowBudget] = useState(false);
  const [period, setPeriod] = useState("7");

  const { recentDays, olderDays } = getPeriodDays(period);
  const { analysis, products, stockOutData } = useStockAnalysis(recentDays, olderDays);

  // Build kode -> id map for components
  const productIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (products) {
      for (const p of products) {
        map[p.kode] = p.id;
      }
    }
    return map;
  }, [products]);

  // Budget allocation
  const budgetPlan = useMemo(() => {
    if (budget <= 0) return [];
    let remaining = budget;
    const plan: (typeof analysis[0] & { allocatedQty: number; allocatedCost: number })[] = [];
    for (const item of analysis) {
      if (item.restockQty <= 0 || item.hargaModal <= 0) continue;
      const maxQty = Math.min(item.restockQty, Math.floor(remaining / item.hargaModal));
      if (maxQty <= 0) continue;
      const cost = maxQty * item.hargaModal;
      plan.push({ ...item, allocatedQty: maxQty, allocatedCost: cost });
      remaining -= cost;
      if (remaining <= 0) break;
    }
    return plan;
  }, [analysis, budget]);

  const deadStock = analysis.filter((a) => a.isDead);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Analisa & Restock</h1>
            <p className="text-muted-foreground text-sm">Velocity, prediksi, dan rekomendasi belanja</p>
          </div>
        </div>
        <PeriodFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* View selector */}
      <Select value={view} onValueChange={setView}>
        <SelectTrigger className="w-full sm:w-[300px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEW_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Views */}
      {view === "velocity" && (
        <VelocityTable analysis={analysis} />
      )}

      {view === "budget" && (
        <BudgetView
          budget={budget}
          setBudget={setBudget}
          showBudget={showBudget}
          setShowBudget={setShowBudget}
          budgetPlan={budgetPlan}
        />
      )}

      {view === "review" && <ReviewBelanjaan analysis={analysis} />}
      {view === "perkiraan" && <PerkiraanBiaya analysis={analysis} />}
      {view === "kapanhabis" && <KapanHabis analysis={analysis} />}
      {view === "laris" && <PalingLaris analysis={analysis} stockOutData={stockOutData} productIdMap={productIdMap} />}
      {view === "trend" && <NaikTurun stockOutData={stockOutData} productIdMap={productIdMap} />}
      {view === "untung" && <PalingUntung products={products} stockOutData={stockOutData} />}
      {view === "stoksedikit" && <StokSedikit analysis={analysis} />}

      {view === "deadstock" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Dead Stock ({deadStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deadStock.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Nilai (Modal)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadStock.map((d) => (
                      <TableRow key={d.kode}>
                        <TableCell className="font-mono font-semibold">{d.kode}</TableCell>
                        <TableCell>{d.nama}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.stok)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(d.stok * d.hargaModal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                <TrendingDown className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                Tidak ada dead stock (semua produk terjual dalam 60 hari terakhir)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {view === "ringkasan" && <RingkasanStok analysis={analysis} />}
    </div>
  );
};

// Extracted inline components to keep main component clean
function VelocityTable({ analysis }: { analysis: ReturnType<typeof useStockAnalysis>["analysis"] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Analisa Velocity & Prioritas Restock</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Velocity/hari</TableHead>
                <TableHead className="text-right">Habis dlm</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead className="text-right">Restock</TableHead>
                <TableHead className="text-right">Biaya</TableHead>
                <TableHead className="text-right">Prioritas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.slice(0, 30).map((a) => (
                <TableRow key={a.kode}>
                  <TableCell className="font-mono font-semibold">{a.kode}</TableCell>
                  <TableCell className="text-sm">{a.nama}</TableCell>
                  <TableCell className="text-right">{formatNumber(a.stok)}</TableCell>
                  <TableCell className="text-right">{a.velocity}</TableCell>
                  <TableCell className="text-right">
                    {a.daysToDeplete !== null ? (
                      <span className={a.daysToDeplete <= 3 ? "text-destructive font-bold" : a.daysToDeplete <= 7 ? "text-warning font-semibold" : ""}>
                        {a.daysToDeplete} hari
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={
                      a.trend === "naik" ? "bg-success/10 text-success" :
                      a.trend === "turun" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }>
                      {a.trend === "naik" ? "↑ Naik" : a.trend === "turun" ? "↓ Turun" : "→ Stabil"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatNumber(a.restockQty)}</TableCell>
                  <TableCell className="text-right text-sm">{formatRupiah(a.restockCost)}</TableCell>
                  <TableCell className="text-right font-bold">{a.priorityScore}</TableCell>
                </TableRow>
              ))}
              {analysis.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Belum ada data penjualan untuk analisa</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetView({
  budget, setBudget, showBudget, setShowBudget, budgetPlan,
}: {
  budget: number;
  setBudget: (v: number) => void;
  showBudget: boolean;
  setShowBudget: (v: boolean) => void;
  budgetPlan: any[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Budget Plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label>Budget Belanja (Rp)</Label>
            <Input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
              placeholder="Masukkan budget..."
            />
          </div>
          <Button onClick={() => setShowBudget(true)}>Hitung</Button>
        </div>

        {showBudget && budgetPlan.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Qty Beli</TableHead>
                  <TableHead className="text-right">Harga Modal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetPlan.map((item: any) => (
                  <TableRow key={item.kode}>
                    <TableCell className="font-mono font-semibold">{item.kode}</TableCell>
                    <TableCell className="text-sm">{item.nama}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(item.allocatedQty)}</TableCell>
                    <TableCell className="text-right text-sm">{formatRupiah(item.hargaModal)}</TableCell>
                    <TableCell className="text-right font-bold">{formatRupiah(item.allocatedCost)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="font-semibold">Total Belanja</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {formatRupiah(budgetPlan.reduce((s: number, i: any) => s + i.allocatedCost, 0))}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="text-sm">Sisa Budget</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatRupiah(budget - budgetPlan.reduce((s: number, i: any) => s + i.allocatedCost, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        {showBudget && budgetPlan.length === 0 && (
          <p className="text-muted-foreground text-center py-4">Tidak ada item yang perlu di-restock, atau budget terlalu kecil</p>
        )}
      </CardContent>
    </Card>
  );
}

export default Analisa;
