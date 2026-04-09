import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, AlertTriangle, CheckCircle2, Plus, Flame, ArrowDown,
  TrendingUp, ShoppingCart, PackageX, Wallet, CirclePlus, CircleAlert, ChevronDown
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
  pending_qty?: number;
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
  harga_modal: number;
  cost: number;
  pending_qty?: number;
}

export interface OtherItem {
  kode: string;
  nama: string;
  kategori: string;
  qty: number;
  harga_modal: number;
  cost: number;
}

export interface ReviewResult {
  score: number;
  summary: string;
  cards: ReviewCard[];
  missed: MissedCard[];
  other_items?: OtherItem[];
  unknown_codes: string[];
  total_cost: number;
  total_cost_other?: number;
  budget_tambah: number;
  budget_missed: number;
  budget_total: number;
  stats: {
    total_items: number;
    pas: number;
    kurang: number;
    lebih: number;
    missed_count: number;
  };
}

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
    if (card.stok === 0) return `Stok habis, barang ${speed} — harus pesan ${formatNumber(card.ideal_qty)} pcs`;
    if (card.dos <= 2) return `Barang ${speed}, stok ${timeLeft} — kurang ${formatNumber(getShortfall(card))} pcs biar aman`;
    return `Barang ${speed}, pesan segini ${timeLeft} aja — tambahin biar ga kehabisan`;
  }
  
  if (card.verdict === "lebih" && !alreadySent) {
    if (card.velocity === 0) return `Barang ga pernah laku, pesan segini bakal numpuk di gudang`;
    if (card.stok === 0) return `Stok habis, tapi pesanan Boss lebih dari yang dibutuhkan — cukup ${formatNumber(card.ideal_qty)} aja`;
    if (card.ideal_qty === 0) return `Stok masih ${formatNumber(card.stok)} pcs, belum perlu nambah`;
    if (card.velocity < 1) return `Barang ${speed}, pesan kebanyakan nanti numpuk di gudang`;
    return `Cukup pesan ${formatNumber(card.ideal_qty)} aja, sisanya bisa buat barang lain`;
  }
  
  if (card.stok === 0 && card.velocity > 0) return `Stok habis tapi pesanan Boss udah pas 👍`;
  if (card.is_bestseller) return `Barang ${speed}, qty segini udah pas 👍`;
  if (card.velocity > 0) return `Barang ${speed}, qty segini cukup`;
  if (card.velocity === 0 && card.qty_boss > 0) return `Belum ada data penjualan, tapi Boss udah pesan`;
  return `Stok aman`;
}

function getMissedReason(card: MissedCard): string {
  const speed = describeSpeed(card.velocity);
  const timeLeft = describeDays(card.dos);
  return `Barang ${speed} tapi ${timeLeft}, harus pesan sebelum kehabisan`;
}

// ── Score Ring — BIGGER ──
function ScoreRing({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "text-success" : score >= 5 ? "text-warning" : "text-destructive";
  const strokeColor = score >= 8 ? "stroke-success" : score >= 5 ? "stroke-warning" : "stroke-destructive";
  const bgStroke = "stroke-muted";
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" className={bgStroke} strokeWidth="6" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          className={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className={`absolute inset-0 flex flex-col items-center justify-center ${color}`}>
        <span className="text-3xl font-black leading-none tabular-nums">{score}</span>
        <span className="text-xs font-bold text-muted-foreground">/10</span>
      </div>
    </div>
  );
}

// ── Stat Pill — Bigger ──
function StatPill({ icon: Icon, label, value, className = "", onClick }: {
  icon: any; label: string; value: string | number; className?: string; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all active:scale-95 ${onClick ? "cursor-pointer hover:ring-2 hover:ring-ring/30" : ""} ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-bold">{label}</span>
      <span className="font-extrabold ml-auto tabular-nums">{value}</span>
    </button>
  );
}

// ── Product Card — Bigger text, more spacing ──
function ProductCard({ card, alreadySent }: { card: ReviewCard; alreadySent: boolean }) {
  const needMore = isNeedMore(card);
  const tooMuch = !alreadySent && isTooMuch(card);
  const shortfall = getShortfall(card);
  const excess = getExcess(card);

  const accentClass = needMore
    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50"
    : tooMuch
    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50"
    : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50";

  return (
    <div className={`card-premium p-4 space-y-3 transition-all duration-200 active:scale-[0.98] ${accentClass}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-extrabold text-base">{card.kode}</span>
            {card.is_bestseller && (
              <span className="inline-flex items-center gap-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 text-xs font-bold">
                <Flame className="h-3.5 w-3.5" /> Laris
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{card.nama}</p>
        </div>
        
        {/* Action badge — bigger */}
        {needMore ? (
          <span className="inline-flex items-center gap-1 bg-orange-500 text-white rounded-full px-3 py-1.5 text-sm font-bold shadow-sm shrink-0">
            <Plus className="h-3.5 w-3.5" /> +{formatNumber(shortfall)}
          </span>
        ) : tooMuch ? (
          <span className="inline-flex items-center gap-1 bg-blue-500 text-white rounded-full px-3 py-1.5 text-sm font-bold shadow-sm shrink-0">
            <ArrowDown className="h-3.5 w-3.5" /> -{formatNumber(excess)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 bg-emerald-500 text-white rounded-full px-3 py-1.5 text-sm font-bold shadow-sm shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> OK
          </span>
        )}
      </div>

      {/* Qty info — bigger */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Pesan:</span>
          <span className="font-extrabold text-foreground text-base">{formatNumber(card.qty_boss)}</span>
        </div>
        {(card.pending_qty ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>📦 Pending:</span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400 text-base">{formatNumber(card.pending_qty!)}</span>
          </div>
        )}
        {(needMore || tooMuch) && (
          <>
            <span className="text-muted-foreground">→</span>
            <span className={`font-extrabold text-base ${needMore ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`}>
              {formatNumber(card.ideal_qty)} pcs
            </span>
          </>
        )}
      </div>

      {/* Reason bubble — bigger */}
      <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed font-medium ${
        needMore 
          ? "bg-orange-100/80 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300" 
          : tooMuch
          ? "bg-blue-100/80 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
          : "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300"
      }`}>
        💬 {getReason(card, alreadySent)}
      </div>
    </div>
  );
}

// ── Missed Product Card — Bigger ──
function MissedProductCard({ card }: { card: MissedCard }) {
  return (
    <div className="card-premium p-4 space-y-3 transition-all duration-200 active:scale-[0.98] bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono font-extrabold text-base">{card.kode}</span>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{card.nama}</p>
        </div>
        <span className="inline-flex items-center gap-1 bg-destructive text-destructive-foreground rounded-full px-3 py-1.5 text-sm font-bold shadow-sm shrink-0">
          <Plus className="h-3.5 w-3.5" /> Pesan {formatNumber(card.ideal_qty)}
        </span>
      </div>
      <div className="rounded-xl px-4 py-3 text-sm leading-relaxed font-medium bg-red-100/80 dark:bg-red-900/30 text-red-800 dark:text-red-300">
        💬 {getMissedReason(card)}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground px-1 flex-wrap">
        {(card.pending_qty ?? 0) > 0 && (
          <span>📦 Pending: <span className="font-bold text-purple-600 dark:text-purple-400">{formatNumber(card.pending_qty!)}</span></span>
        )}
        {card.cost > 0 && (
          <span>Budget: <span className="font-bold text-foreground">{formatRupiah(card.cost)}</span></span>
        )}
      </div>
    </div>
  );
}

// ── Collapsible Section — Bigger touch target ──
function CollapsibleSection({ icon: Icon, title, count, color, sectionRef, isOpen, onToggle, children }: {
  icon: any; title: string; count: number; color: string;
  sectionRef?: React.RefObject<HTMLDivElement>; isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5" ref={sectionRef}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2.5 px-1 pt-1 w-full text-left group min-h-[48px] transition-all duration-150 active:scale-[0.98]"
      >
        <div className={`flex items-center justify-center h-8 w-8 rounded-xl ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <span className="text-base font-bold">{title}</span>
        <Badge variant="secondary" className="text-xs font-bold">{count}</Badge>
        <ChevronDown className={`h-5 w-5 ml-auto text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}

export function ReviewResultCards({ result, alreadySent }: { result: ReviewResult; alreadySent: boolean }) {
  const { score, summary, cards, missed, unknown_codes, total_cost, budget_tambah, budget_missed, budget_total } = result;

  const needMoreCards = cards.filter(c => isNeedMore(c)).sort((a, b) => a.dos - b.dos);
  const tooMuchCards = !alreadySent ? cards.filter(c => isTooMuch(c)) : [];
  const okCards = cards.filter(c => !isNeedMore(c) && !(isTooMuch(c) && !alreadySent));

  const totalTambah = needMoreCards.reduce((sum, c) => sum + getShortfall(c), 0);
  const hasBudgetExtra = (budget_tambah || 0) > 0 || (budget_missed || 0) > 0;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tambah: true, missed: true, kurangi: false, cukup: false,
  });
  const tambahRef = useRef<HTMLDivElement>(null);
  const missedRef = useRef<HTMLDivElement>(null);
  const kurangiRef = useRef<HTMLDivElement>(null);
  const cukupRef = useRef<HTMLDivElement>(null);

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const scrollToSection = useCallback((key: string, ref: React.RefObject<HTMLDivElement>) => {
    setOpenSections(prev => ({ ...prev, [key]: true }));
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  return (
    <div className="space-y-5">
      {/* ── Summary Card — BIGGER & BOLDER ── */}
      <Card className="card-premium overflow-hidden shadow-premium">
        <CardContent className="p-5">
          {/* Score + Title */}
          <div className="flex items-center gap-5">
            <ScoreRing score={score} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-lg font-extrabold">Hasil Review</span>
              </div>
              {summary && <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>}
            </div>
          </div>
          
          {/* Budget Breakdown — bigger text */}
          <div className="mt-5 rounded-xl bg-muted/40 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              Rincian Budget
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pesanan awal</span>
                <span className="font-bold tabular-nums text-base">{formatRupiah(total_cost)}</span>
              </div>
              {(budget_tambah || 0) > 0 && (
                <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                  <span className="flex items-center gap-1.5">
                    <CirclePlus className="h-3.5 w-3.5" /> Tambahan
                  </span>
                  <span className="font-bold tabular-nums text-base">+{formatRupiah(budget_tambah)}</span>
                </div>
              )}
              {(budget_missed || 0) > 0 && (
                <div className="flex items-center justify-between text-destructive">
                  <span className="flex items-center gap-1.5">
                    <CircleAlert className="h-3.5 w-3.5" /> Belum dipesan
                  </span>
                  <span className="font-bold tabular-nums text-base">+{formatRupiah(budget_missed)}</span>
                </div>
              )}
              {hasBudgetExtra && (
                <>
                  <div className="border-t border-border/50 my-1.5" />
                  <div className="flex items-center justify-between font-extrabold">
                    <span className="text-base">Total</span>
                    <span className="tabular-nums text-primary text-xl">{formatRupiah(budget_total || total_cost)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Stats — bigger */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {needMoreCards.length > 0 && (
              <StatPill
                icon={Plus}
                label="Tambah"
                value={`${needMoreCards.length} (+${formatNumber(totalTambah)})`}
                className="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400"
                onClick={() => scrollToSection("tambah", tambahRef)}
              />
            )}
            {tooMuchCards.length > 0 && (
              <StatPill
                icon={ArrowDown}
                label="Kurangi"
                value={`${tooMuchCards.length}`}
                className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                onClick={() => scrollToSection("kurangi", kurangiRef)}
              />
            )}
            {missed.length > 0 && (
              <StatPill
                icon={PackageX}
                label="Belum pesan"
                value={`${missed.length}`}
                className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                onClick={() => scrollToSection("missed", missedRef)}
              />
            )}
            {okCards.length > 0 && (
              <StatPill
                icon={CheckCircle2}
                label="Cukup"
                value={`${okCards.length}`}
                className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                onClick={() => scrollToSection("cukup", cukupRef)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {needMoreCards.length > 0 && (
        <CollapsibleSection icon={Plus} title="Perlu Ditambah" count={needMoreCards.length} color="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400" sectionRef={tambahRef} isOpen={openSections.tambah} onToggle={() => toggleSection("tambah")}>
          {needMoreCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {missed.length > 0 && (
        <CollapsibleSection icon={PackageX} title="Belum Dipesan tapi Kritis" count={missed.length} color="bg-red-100 dark:bg-red-900/40 text-destructive" sectionRef={missedRef} isOpen={openSections.missed} onToggle={() => toggleSection("missed")}>
          {missed.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <MissedProductCard card={card} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {tooMuchCards.length > 0 && (
        <CollapsibleSection icon={ArrowDown} title="Bisa Dikurangi" count={tooMuchCards.length} color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" sectionRef={kurangiRef} isOpen={openSections.kurangi} onToggle={() => toggleSection("kurangi")}>
          {tooMuchCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {okCards.length > 0 && (
        <CollapsibleSection icon={CheckCircle2} title="Sudah Cukup" count={okCards.length} color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" sectionRef={cukupRef} isOpen={openSections.cukup} onToggle={() => toggleSection("cukup")}>
          {okCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {unknown_codes.length > 0 && (
        <div className="flex items-center gap-2 px-1 flex-wrap">
          <span className="text-sm text-destructive font-bold">Kode tidak dikenal:</span>
          {unknown_codes.map(code => (
            <Badge key={code} variant="secondary" className="font-mono bg-destructive/10 text-destructive text-xs">{code}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
