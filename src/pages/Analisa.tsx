import { useState, useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingDown, AlertTriangle, ShoppingCart } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";

// WMA weights: 70% recent, 30% older (from Telegram bot script)
const WMA_RECENT = 0.7;
const WMA_OLDER = 0.3;
const DEAD_STOCK_DAYS = 60;
const CYCLE_DAYS = 3;

interface AnalysisResult {
  kode: string;
  nama: string;
  stok: number;
  velocity: number;
  daysToDeplete: number | null;
  trend: "naik" | "turun" | "stabil";
  isDead: boolean;
  hargaModal: number;
  restockQty: number;
  restockCost: number;
  priorityScore: number;
}

const Analisa = () => {
  const { data: products } = useProducts();
  const [budget, setBudget] = useState(0);
  const [showBudget, setShowBudget] = useState(false);

  // Fetch stock_out data for velocity calculation
  const { data: stockOutData } = useQuery({
    queryKey: ["stock_out_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_out")
        .select("product_id, qty_kirim, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const analysis = useMemo<AnalysisResult[]>(() => {
    if (!products || !stockOutData) return [];

    const now = new Date();

    return products.map((p) => {
      const sales = stockOutData
        .filter((s) => s.product_id === p.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Calculate WMA velocity
      const recentDays = 7;
      const olderDays = 14;
      const recentCutoff = new Date(now.getTime() - recentDays * 86400000);
      const olderCutoff = new Date(now.getTime() - olderDays * 86400000);

      const recentSales = sales
        .filter((s) => new Date(s.created_at) >= recentCutoff)
        .reduce((sum, s) => sum + s.qty_kirim, 0);
      const olderSales = sales
        .filter((s) => new Date(s.created_at) >= olderCutoff && new Date(s.created_at) < recentCutoff)
        .reduce((sum, s) => sum + s.qty_kirim, 0);

      const recentVelocity = recentSales / recentDays;
      const olderVelocity = olderSales / (olderDays - recentDays);
      const velocity = recentVelocity * WMA_RECENT + olderVelocity * WMA_OLDER;

      // Days to deplete
      const stok = p.stock?.jumlah ?? 0;
      const daysToDeplete = velocity > 0 ? stok / velocity : null;

      // Trend
      const trend: "naik" | "turun" | "stabil" =
        recentVelocity > olderVelocity * 1.2 ? "naik" :
        recentVelocity < olderVelocity * 0.8 ? "turun" : "stabil";

      // Dead stock detection
      const lastSale = sales[0];
      const daysSinceLastSale = lastSale
        ? (now.getTime() - new Date(lastSale.created_at).getTime()) / 86400000
        : 999;
      const isDead = daysSinceLastSale >= DEAD_STOCK_DAYS;

      // Safety stock & restock qty
      const safetyStock = Math.ceil(velocity * CYCLE_DAYS * 1.5);
      const restockQty = Math.max(0, safetyStock + Math.ceil(velocity * CYCLE_DAYS) - stok);
      const hargaModal = p.prices?.harga_modal ?? 0;
      const restockCost = restockQty * hargaModal;

      // Priority scoring: 40% velocity, 30% urgency, 20% trend, 10% stock level
      const urgency = daysToDeplete !== null ? Math.max(0, 1 - daysToDeplete / 30) : 0;
      const trendScore = trend === "naik" ? 1 : trend === "stabil" ? 0.5 : 0.2;
      const stockScore = stok <= 5 ? 1 : stok <= 15 ? 0.6 : 0.2;
      const priorityScore =
        velocity * 0.4 + urgency * 30 * 0.3 + trendScore * 10 * 0.2 + stockScore * 10 * 0.1;

      return {
        kode: p.kode,
        nama: p.nama,
        stok,
        velocity: Math.round(velocity * 100) / 100,
        daysToDeplete: daysToDeplete !== null ? Math.round(daysToDeplete) : null,
        trend,
        isDead,
        hargaModal,
        restockQty,
        restockCost,
        priorityScore: Math.round(priorityScore * 100) / 100,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [products, stockOutData]);

  // Budget allocation
  const budgetPlan = useMemo(() => {
    if (budget <= 0) return [];
    let remaining = budget;
    const plan: (AnalysisResult & { allocatedQty: number; allocatedCost: number })[] = [];
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
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Analisa & Restock</h1>
          <p className="text-muted-foreground text-sm">Velocity, prediksi, dan rekomendasi belanja</p>
        </div>
      </div>

      <Tabs defaultValue="velocity">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="budget">Budget Plan</TabsTrigger>
          <TabsTrigger value="deadstock">Dead Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="velocity" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="budget" className="space-y-4">
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
                      {budgetPlan.map((item) => (
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
                          {formatRupiah(budgetPlan.reduce((s, i) => s + i.allocatedCost, 0))}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={4} className="text-sm">Sisa Budget</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatRupiah(budget - budgetPlan.reduce((s, i) => s + i.allocatedCost, 0))}
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
        </TabsContent>

        <TabsContent value="deadstock" className="space-y-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analisa;
