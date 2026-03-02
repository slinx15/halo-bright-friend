import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, ArrowUp, ArrowDown, Minus, Flame, Package
} from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";

type Status = "kritis" | "segera" | "perhatian" | "aman";
type Verdict = "kurang" | "pas" | "lebih" | "ok" | "unknown";

export interface ReviewCard {
  kode: string;
  nama: string;
  qty_boss: number;
  stok: number;
  velocity: number;
  dos: number;
  status: Status;
  ideal_qty: number;
  verdict: Verdict;
  verdict_note: string;
  cost: number;
  harga_modal: number;
  is_bestseller: boolean;
  is_bw: boolean;
  batch: number;
}

export interface MissedCard {
  kode: string;
  nama: string;
  stok: number;
  velocity: number;
  dos: number;
  status: Status;
  ideal_qty: number;
  is_bw: boolean;
}

export interface ReviewResult {
  score: number;
  summary: string;
  cards: ReviewCard[];
  missed: MissedCard[];
  unknown_codes: string[];
  total_cost: number;
  stats: {
    total_items: number;
    pas: number;
    kurang: number;
    lebih: number;
    missed_count: number;
  };
}

const statusConfig: Record<Status, { label: string; emoji: string; color: string; borderColor: string; bgColor: string }> = {
  kritis: { label: "Kritis", emoji: "🔴", color: "text-destructive", borderColor: "border-l-destructive", bgColor: "bg-destructive/5" },
  segera: { label: "Segera", emoji: "🟠", color: "text-orange-600 dark:text-orange-400", borderColor: "border-l-orange-500", bgColor: "bg-orange-500/5" },
  perhatian: { label: "Perhatian", emoji: "🟡", color: "text-warning", borderColor: "border-l-warning", bgColor: "bg-warning/5" },
  aman: { label: "Aman", emoji: "🟢", color: "text-success", borderColor: "border-l-success", bgColor: "bg-success/5" },
};

const verdictConfig: Record<Verdict, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  pas: { label: "Tepat", icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  ok: { label: "OK", icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  kurang: { label: "Kurang", icon: ArrowUp, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  lebih: { label: "Kebanyakan", icon: ArrowDown, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  unknown: { label: "?", icon: Minus, color: "text-muted-foreground", bg: "bg-muted" },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 7 ? "text-success" : score >= 4 ? "text-warning" : "text-destructive";
  return (
    <div className={`relative inline-flex items-center justify-center h-16 w-16 rounded-full border-[3px] ${color} border-current`}>
      <span className={`text-2xl font-black ${color}`}>{score}</span>
      <span className="absolute -bottom-1 text-[9px] font-bold text-muted-foreground bg-background px-1">/10</span>
    </div>
  );
}

function ProductCard({ card }: { card: ReviewCard }) {
  const st = statusConfig[card.status];
  const vd = verdictConfig[card.verdict];
  const VerdictIcon = vd.icon;

  return (
    <div className={`rounded-xl border border-l-[3px] ${st.borderColor} border-border/60 p-3 space-y-2 ${st.bgColor}`}>
      {/* Header: kode + verdict */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-sm">{card.kode}</span>
          {card.is_bestseller && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] px-1.5 gap-0.5">
              <Flame className="h-2.5 w-2.5" /> Laris
            </Badge>
          )}
        </div>
        <Badge variant="secondary" className={`${vd.bg} ${vd.color} text-[10px] px-2 gap-0.5`}>
          <VerdictIcon className="h-3 w-3" />
          {vd.label}
        </Badge>
      </div>

      {/* Product name */}
      <p className="text-xs text-muted-foreground truncate">{card.nama}</p>

      {/* Qty comparison */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] text-muted-foreground">Boss</p>
          <p className="text-base font-extrabold tabular-nums">{formatNumber(card.qty_boss)}</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] text-muted-foreground">Ideal</p>
          <p className={`text-base font-extrabold tabular-nums ${card.verdict === "kurang" ? "text-orange-600 dark:text-orange-400" : ""}`}>
            {formatNumber(card.ideal_qty)}
          </p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="text-[10px] text-muted-foreground">Stok</p>
          <p className={`text-base font-extrabold tabular-nums ${st.color}`}>{formatNumber(card.stok)}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            <TrendingUp className="h-3 w-3 inline mr-0.5" />
            {card.velocity}/hari
          </span>
          <span className="text-muted-foreground">
            Sisa {card.dos} hari
          </span>
        </div>
        <span className={`font-semibold ${st.color}`}>
          {st.emoji} {st.label}
        </span>
      </div>

      {/* Verdict note */}
      <p className={`text-[11px] font-medium ${vd.color} leading-tight`}>{card.verdict_note}</p>
    </div>
  );
}

function MissedProductCard({ card }: { card: MissedCard }) {
  const st = statusConfig[card.status];

  return (
    <div className={`rounded-xl border border-l-[3px] ${st.borderColor} border-border/60 p-3 space-y-1.5 bg-destructive/5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-sm">{card.kode}</span>
          <span className={`font-semibold text-[10px] ${st.color}`}>{st.emoji} {st.label}</span>
        </div>
        <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px] px-2 gap-0.5">
          <AlertTriangle className="h-3 w-3" />
          Belum dipesan
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground truncate">{card.nama}</p>
      <div className="flex items-center gap-4 text-[11px]">
        <span>Stok: <strong>{formatNumber(card.stok)}</strong></span>
        <span>Laku: <strong>{card.velocity}/hari</strong></span>
        <span>Sisa: <strong>{card.dos} hari</strong></span>
        <span className="ml-auto font-bold text-destructive">Pesan {formatNumber(card.ideal_qty)} pcs</span>
      </div>
    </div>
  );
}

export function ReviewResultCards({ result }: { result: ReviewResult }) {
  const { score, summary, cards, missed, unknown_codes, total_cost, stats } = result;

  // Sort cards: kurang first, then kritis
  const sortedCards = [...cards].sort((a, b) => {
    const verdictOrder: Record<Verdict, number> = { kurang: 0, lebih: 1, pas: 2, ok: 3, unknown: 4 };
    const statusOrder: Record<Status, number> = { kritis: 0, segera: 1, perhatian: 2, aman: 3 };
    const vDiff = verdictOrder[a.verdict] - verdictOrder[b.verdict];
    if (vDiff !== 0) return vDiff;
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return (
    <div className="space-y-4 animate-fade-in" style={{ animationFillMode: "both" }}>
      {/* Score + Summary */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Hasil Review AI</span>
        </div>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <ScoreRing score={score} />
            <div className="flex-1 space-y-2">
              {summary && <p className="text-sm leading-relaxed">{summary}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> {stats.pas} tepat
                </Badge>
                {stats.kurang > 0 && (
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px]">
                    <ArrowUp className="h-3 w-3 mr-0.5" /> {stats.kurang} kurang
                  </Badge>
                )}
                {stats.lebih > 0 && (
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                    <ArrowDown className="h-3 w-3 mr-0.5" /> {stats.lebih} kebanyakan
                  </Badge>
                )}
                {stats.missed_count > 0 && (
                  <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-0.5" /> {stats.missed_count} terlewat
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Total budget: <strong>{formatRupiah(total_cost)}</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Cards */}
      {sortedCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Detail Review ({cards.length} item)</span>
          </div>
          <div className="space-y-2">
            {sortedCards.map((card) => (
              <ProductCard key={card.kode} card={card} />
            ))}
          </div>
        </div>
      )}

      {/* Unknown codes */}
      {unknown_codes.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold">Kode Tidak Dikenal ({unknown_codes.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unknown_codes.map((code) => (
                <Badge key={code} variant="secondary" className="font-mono bg-destructive/10 text-destructive text-xs">
                  {code}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missed Critical */}
      {missed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Produk Kritis Belum Dipesan ({missed.length})</span>
          </div>
          <div className="space-y-2">
            {missed.map((card) => (
              <MissedProductCard key={card.kode} card={card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
