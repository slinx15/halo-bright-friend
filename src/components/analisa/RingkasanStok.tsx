import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";
import { RULES } from "@/lib/analysisRules";

interface Props {
  analysis: AnalysisResult[];
}

export function RingkasanStok({ analysis }: Props) {
  const stats = useMemo(() => {
    let totalSKU = analysis.length;
    let totalStock = 0;
    let totalValue = 0;
    let outOfStock = 0;
    let criticalCount = 0;
    let bestSellerCount = 0;

    for (const a of analysis) {
      totalStock += a.stok;
      totalValue += a.stok * a.hargaModal;
      if (a.stok === 0) outOfStock++;
      if (a.velocity >= RULES.BESTSELLER_VELOCITY) bestSellerCount++;
      if (a.daysToDeplete !== null && a.daysToDeplete <= RULES.CRITICAL_DAYS) criticalCount++;
    }

    return { totalSKU, totalStock, totalValue, outOfStock, criticalCount, bestSellerCount };
  }, [analysis]);

  const items = [
    { label: "Jenis barang", value: `${stats.totalSKU}`, icon: "📦" },
    { label: "Total stok", value: `${formatNumber(stats.totalStock)} pcs`, icon: "🧵" },
    { label: "Nilai barang", value: formatRupiah(stats.totalValue), icon: "💵" },
  ];

  const conditions = [
    { label: "Habis", value: `${stats.outOfStock} barang`, icon: "🔴", color: "text-destructive" },
    { label: "Mau habis", value: `${stats.criticalCount} barang`, icon: "⚠️", color: "text-warning" },
    { label: "Laris", value: `${stats.bestSellerCount} barang`, icon: "🔥", color: "text-success" },
  ];

  const settings = [
    { label: "Siklus belanja", value: `${RULES.CYCLE_DAYS} hari` },
    { label: "Laris kalau laku", value: `${RULES.BESTSELLER_VELOCITY}/hari` },
    { label: "Tidak laku setelah", value: `${RULES.DEAD_STOCK_DAYS} hari` },
    { label: "Beli minimal", value: `${RULES.BATCH} pcs` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Ringkasan Stok
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.label} className="p-4 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">{item.icon} {item.label}</div>
              <div className="text-xl font-bold mt-1">{item.value}</div>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-semibold mb-2">📈 Kondisi</h3>
          <div className="grid grid-cols-3 gap-3">
            {conditions.map((c) => (
              <div key={c.label} className="p-3 bg-muted/50 rounded-lg text-center">
                <div className="text-2xl">{c.icon}</div>
                <div className={`font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">⚙️ Pengaturan Analisa</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {settings.map((s) => (
              <div key={s.label} className="flex justify-between p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          📅 Update: {new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </CardContent>
    </Card>
  );
}
