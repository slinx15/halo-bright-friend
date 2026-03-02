import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, AlertTriangle, CheckCircle2, Plus, Flame, Package, ArrowDown
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

// "kurang" = need to add more. "pas"/"lebih"/"ok" = all good (already ordered, can't reduce)
function isNeedMore(card: ReviewCard): boolean {
  return card.verdict === "kurang";
}

function isTooMuch(card: ReviewCard): boolean {
  return card.verdict === "lebih";
}

function getShortfall(card: ReviewCard): number {
  return Math.max(0, card.ideal_qty - card.qty_boss);
}

function getExcess(card: ReviewCard): number {
  return Math.max(0, card.qty_boss - card.ideal_qty);
}

function describeSpeed(velocity: number): string {
  if (velocity >= 10) return "laris banget";
  if (velocity >= 5) return "laris";
  if (velocity >= 2) return "lumayan laku";
  if (velocity >= 0.5) return "agak jarang laku";
  if (velocity > 0) return "jarang laku";
  return "ga pernah laku";
}

function describeDays(dos: number): string {
  if (dos > 999) return "masih lama";
  if (dos <= 1) return "bisa habis hari ini";
  if (dos <= 2) return "tinggal 1-2 hari lagi";
  if (dos <= 3) return "tinggal 3 hari lagi";
  if (dos <= 5) return "tinggal beberapa hari";
  if (dos <= 7) return "cukup buat seminggu";
  if (dos <= 14) return "cukup buat 2 minggu";
  return "masih banyak";
}

function getReason(card: ReviewCard, alreadySent: boolean): string {
  const speed = describeSpeed(card.velocity);
  const timeLeft = describeDays(card.dos);
  
  if (card.verdict === "kurang") {
    if (card.dos <= 2) return `Barang ${speed}, stok ${timeLeft} — kurang ${formatNumber(getShortfall(card))} pcs biar aman`;
    return `Barang ${speed}, pesan segini ${timeLeft} aja — tambahin biar ga kehabisan`;
  }
  
  if (card.verdict === "lebih" && !alreadySent) {
    if (card.ideal_qty === 0) return `Stok masih banyak (${formatNumber(card.stok)} pcs), belum perlu nambah`;
    if (card.velocity < 1) return `Barang ${speed}, pesan kebanyakan nanti numpuk di gudang`;
    return `Cukup pesan ${formatNumber(card.ideal_qty)} aja, sisanya bisa buat barang lain`;
  }
  
  // OK / cukup
  if (card.is_bestseller) return `Barang ${speed}, qty segini udah pas 👍`;
  if (card.velocity > 0) return `Barang ${speed}, qty segini cukup`;
  return `Stok masih aman`;
}

function getMissedReason(card: MissedCard): string {
  const speed = describeSpeed(card.velocity);
  const timeLeft = describeDays(card.dos);
  return `Barang ${speed} tapi ${timeLeft}, harus pesan sebelum kehabisan`;
}

function ProductCard({ card, alreadySent }: { card: ReviewCard; alreadySent: boolean }) {
  const needMore = isNeedMore(card);
  const tooMuch = !alreadySent && isTooMuch(card);
  const shortfall = getShortfall(card);
  const excess = getExcess(card);

  return (
    <div className={`rounded-xl border p-3 space-y-1.5 transition-all ${
      needMore 
        ? "border-l-[3px] border-l-orange-500 border-border/60 bg-orange-500/5" 
        : tooMuch
        ? "border-l-[3px] border-l-blue-500 border-border/60 bg-blue-500/5"
        : "border-l-[3px] border-l-success border-border/60 bg-success/5"
    }`}>
      {/* Row 1: kode + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-sm">{card.kode}</span>
          {card.is_bestseller && (
            <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
        </div>
        {needMore ? (
          <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[11px] px-2 gap-1 font-bold">
            <Plus className="h-3 w-3" /> Tambah {formatNumber(shortfall)}
          </Badge>
        ) : tooMuch ? (
          <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[11px] px-2 gap-1 font-bold">
            <ArrowDown className="h-3 w-3" /> Kurangi {formatNumber(excess)}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-success/10 text-success text-[11px] px-2 gap-0.5">
            <CheckCircle2 className="h-3 w-3" /> Cukup
          </Badge>
        )}
      </div>

      {/* Row 2: info */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{card.nama}</span>
        <span className="shrink-0 ml-2 tabular-nums">
          Pesan <strong className="text-foreground">{formatNumber(card.qty_boss)}</strong>
          {needMore && <> → <strong className="text-orange-600 dark:text-orange-400">{formatNumber(card.ideal_qty)}</strong></>}
          {tooMuch && <> → <strong className="text-blue-600 dark:text-blue-400">{formatNumber(card.ideal_qty)}</strong></>}
        </span>
      </div>

      {/* Row 3: reason */}
      <p className="text-[11px] text-muted-foreground leading-snug italic">
        💬 {getReason(card, alreadySent)}
      </p>
    </div>
  );
}

function MissedProductCard({ card }: { card: MissedCard }) {
  return (
    <div className="rounded-xl border border-l-[3px] border-l-destructive border-border/60 p-3 space-y-1 bg-destructive/5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-bold text-sm">{card.kode}</span>
        <Badge className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-[11px] px-2 gap-1 font-bold">
          <Plus className="h-3 w-3" /> Pesan {formatNumber(card.ideal_qty)}
        </Badge>
      </div>
      <div className="text-[11px] text-muted-foreground truncate">{card.nama}</div>
      <p className="text-[11px] text-muted-foreground leading-snug italic">
        💬 {getMissedReason(card)}
      </p>
    </div>
  );
}

export function ReviewResultCards({ result, alreadySent }: { result: ReviewResult; alreadySent: boolean }) {
  const { score, summary, cards, missed, unknown_codes, total_cost } = result;

  const needMoreCards = cards.filter(c => isNeedMore(c)).sort((a, b) => a.dos - b.dos);
  const tooMuchCards = !alreadySent ? cards.filter(c => isTooMuch(c)) : [];
  const okCards = cards.filter(c => !isNeedMore(c) && !(isTooMuch(c) && !alreadySent));

  const totalTambah = needMoreCards.reduce((sum, c) => sum + getShortfall(c), 0);

  return (
    <div className="space-y-3 animate-fade-in" style={{ animationFillMode: "both" }}>
      {/* Summary */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Hasil Review</span>
          <span className="ml-auto text-lg font-black tabular-nums">{score}<span className="text-xs font-normal text-muted-foreground">/10</span></span>
        </div>
        <CardContent className="p-4 space-y-2">
          {summary && <p className="text-sm leading-relaxed">{summary}</p>}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
            <span>Budget: <strong className="text-foreground">{formatRupiah(total_cost)}</strong></span>
            {needMoreCards.length > 0 && (
              <span className="text-orange-600 dark:text-orange-400 font-semibold">
                ⚠ {needMoreCards.length} item perlu ditambah (+{formatNumber(totalTambah)} pcs)
              </span>
            )}
            {tooMuchCards.length > 0 && (
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                💡 {tooMuchCards.length} item bisa dikurangi
              </span>
            )}
            {missed.length > 0 && (
              <span className="text-destructive font-semibold">
                🚨 {missed.length} item belum dipesan
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items that need more */}
      {needMoreCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold">Perlu Ditambah ({needMoreCards.length})</span>
          </div>
          {needMoreCards.map(card => <ProductCard key={card.kode} card={card} alreadySent={alreadySent} />)}
        </div>
      )}

      {/* Missed critical */}
      {missed.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Belum Dipesan tapi Kritis ({missed.length})</span>
          </div>
          {missed.map(card => <MissedProductCard key={card.kode} card={card} />)}
        </div>
      )}

      {/* Items that are too much (only when not sent) */}
      {tooMuchCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <ArrowDown className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Bisa Dikurangi ({tooMuchCards.length})</span>
          </div>
          {tooMuchCards.map(card => <ProductCard key={card.kode} card={card} alreadySent={alreadySent} />)}
        </div>
      )}

      {/* Items that are OK */}
      {okCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-semibold">Sudah Cukup ({okCards.length})</span>
          </div>
          {okCards.map(card => <ProductCard key={card.kode} card={card} alreadySent={alreadySent} />)}
        </div>
      )}

      {/* Unknown codes */}
      {unknown_codes.length > 0 && (
        <div className="flex items-center gap-2 px-1 flex-wrap">
          <span className="text-xs text-destructive font-medium">Kode tidak dikenal:</span>
          {unknown_codes.map(code => (
            <Badge key={code} variant="secondary" className="font-mono bg-destructive/10 text-destructive text-[10px]">{code}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
