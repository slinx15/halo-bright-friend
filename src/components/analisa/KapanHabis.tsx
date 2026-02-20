import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AnalysisResult } from "@/hooks/useStockAnalysis";
import { RULES } from "@/lib/analysisRules";

interface Props {
  analysis: AnalysisResult[];
}

function getPredictedDate(daysLeft: number): string {
  const d = new Date(Date.now() + daysLeft * 86400000);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function KapanHabis({ analysis }: Props) {
  const { critical, warning, attention, safeCount } = useMemo(() => {
    const items = analysis
      .filter((a) => a.velocity > 0 && a.daysToDeplete !== null)
      .sort((a, b) => (a.daysToDeplete ?? 999) - (b.daysToDeplete ?? 999));

    return {
      critical: items.filter((a) => (a.daysToDeplete ?? 999) <= RULES.CRITICAL_DAYS),
      warning: items.filter((a) => {
        const d = a.daysToDeplete ?? 999;
        return d > RULES.CRITICAL_DAYS && d <= RULES.WARNING_DAYS;
      }),
      attention: items.filter((a) => {
        const d = a.daysToDeplete ?? 999;
        return d > RULES.WARNING_DAYS && d <= RULES.ATTENTION_DAYS;
      }),
      safeCount: items.filter((a) => (a.daysToDeplete ?? 999) > RULES.ATTENTION_DAYS).length,
    };
  }, [analysis]);

  const renderItem = (a: AnalysisResult, i: number) => {
    const isBs = a.velocity >= RULES.BESTSELLER_VELOCITY;
    const velPerCycle = a.velocity * RULES.DISPLAY_CYCLE_DAYS;
    return (
      <div key={a.kode} className="flex items-start gap-2 py-2 border-b last:border-0">
        <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold">{a.kode}</span>
            {isBs && <span title="Best seller">🔥</span>}
            {a.stok === 0 && <span title="Stok habis">🚨</span>}
          </div>
          <div className="text-sm text-muted-foreground">
            Stok: {formatNumber(a.stok)} | Laku: {velPerCycle.toFixed(0)}/4hari
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">
            {a.daysToDeplete !== null ? (a.daysToDeplete < 1 ? "< 1 hari" : `${a.daysToDeplete} hari`) : "-"}
          </div>
          <div className="text-xs text-muted-foreground">
            {a.daysToDeplete !== null ? `📅 ${getPredictedDate(a.daysToDeplete)}` : ""}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" /> Prediksi Kehabisan Stok
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {critical.length > 0 && (
          <div>
            <Badge variant="destructive" className="mb-2">🔴 KRITIS (≤ {RULES.CRITICAL_DAYS} hari) — {critical.length} item</Badge>
            {critical.map((a, i) => renderItem(a, i))}
          </div>
        )}

        {warning.length > 0 && (
          <div>
            <Badge className="mb-2 bg-orange-500/10 text-orange-600 border-orange-500/20">
              🟠 WARNING ({RULES.CRITICAL_DAYS + 1}-{RULES.WARNING_DAYS} hari) — {warning.length} item
            </Badge>
            {warning.map((a, i) => renderItem(a, i))}
          </div>
        )}

        {attention.length > 0 && (
          <div>
            <Badge className="mb-2 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              🟡 PERHATIAN ({RULES.WARNING_DAYS + 1}-{RULES.ATTENTION_DAYS} hari) — {attention.length} item
            </Badge>
            {attention.map((a, i) => renderItem(a, i))}
          </div>
        )}

        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
          🟢 AMAN (&gt; {RULES.ATTENTION_DAYS} hari): {safeCount} item
        </div>

        <p className="text-xs text-muted-foreground">
          📊 Total dipantau: {critical.length + warning.length + attention.length + safeCount} item |
          ⚠️ Perlu perhatian: {critical.length + warning.length + attention.length} item
        </p>
      </CardContent>
    </Card>
  );
}
