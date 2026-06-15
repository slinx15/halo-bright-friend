import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, AlertTriangle, CheckCircle2, Plus, Flame, ArrowDown,
  TrendingUp, ShoppingCart, PackageX, Wallet, CirclePlus, CircleAlert, ChevronDown,
  Package, Info, ShieldCheck, Clock, type LucideIcon
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
  target_days_used?: number | null;
  review_basis?: string;
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

type Priority = "wajib" | "sebaiknya" | "tunda" | "cukup";

function getCardPriority(card: ReviewCard, alreadySent: boolean): Priority {
  if (card.verdict === "kurang") {
    if (card.stok === 0 || card.dos <= 2) return "wajib";
    return "sebaiknya";
  }
  if (card.verdict === "lebih" && !alreadySent) return "tunda";
  return "cukup";
}

function getMissedPriority(card: MissedCard): Priority {
  // Missed = belum dipesan sama sekali. Default wajib kalau stok kritis.
  if (card.stok === 0 || card.dos <= 2) return "wajib";
  return "sebaiknya";
}

const PRIORITY_META: Record<Priority, { label: string; classes: string; icon: LucideIcon }> = {
  wajib:     { label: "Wajib Sekarang",   classes: "bg-destructive text-destructive-foreground",                          icon: AlertTriangle },
  sebaiknya: { label: "Sebaiknya Ditambah", classes: "bg-orange-500 text-white",                                          icon: Plus },
  tunda:     { label: "Bisa Ditunda",     classes: "bg-blue-500 text-white",                                              icon: Clock },
  cukup:     { label: "Sudah Cukup",      classes: "bg-emerald-500 text-white",                                           icon: CheckCircle2 },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${meta.classes}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
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
  icon: LucideIcon; label: string; value: string | number; className?: string; onClick?: () => void;
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
  const priority = getCardPriority(card, alreadySent);

  const accentClass =
    priority === "wajib"
      ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50"
      : priority === "sebaiknya"
      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50"
      : priority === "tunda"
      ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50"
      : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50";

  return (
    <div className={`card-premium p-4 space-y-3 transition-all duration-200 active:scale-[0.98] ${accentClass}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-extrabold text-base">{card.kode}</span>
            {card.is_bestseller && (
              <span className="inline-flex items-center gap-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 text-xs font-bold">
                <Flame className="h-3.5 w-3.5" /> Laris
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{card.nama}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <PriorityBadge priority={priority} />
          {needMore ? (
            <span className="inline-flex items-center gap-1 bg-orange-500/90 text-white rounded-full px-2.5 py-1 text-xs font-bold">
              <Plus className="h-3 w-3" /> +{formatNumber(shortfall)} pcs
            </span>
          ) : tooMuch ? (
            <span className="inline-flex items-center gap-1 bg-blue-500/90 text-white rounded-full px-2.5 py-1 text-xs font-bold">
              <ArrowDown className="h-3 w-3" /> -{formatNumber(excess)} pcs
            </span>
          ) : null}
        </div>
      </div>

      {/* Stock + Qty info */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>Stok:</span>
          <span className={`font-extrabold text-base ${card.stok === 0 ? "text-destructive" : card.stok <= 5 ? "text-warning" : "text-foreground"}`}>{formatNumber(card.stok)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Pesan:</span>
          <span className="font-extrabold text-foreground text-base">{formatNumber(card.qty_boss)}</span>
        </div>
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
        priority === "wajib"
          ? "bg-red-100/80 dark:bg-red-900/30 text-red-800 dark:text-red-300"
          : priority === "sebaiknya"
          ? "bg-orange-100/80 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
          : priority === "tunda"
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
  const priority = getMissedPriority(card);
  const accent = priority === "wajib"
    ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50"
    : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50";
  return (
    <div className={`card-premium p-4 space-y-3 transition-all duration-200 active:scale-[0.98] ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono font-extrabold text-base">{card.kode}</span>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{card.nama}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <PriorityBadge priority={priority} />
          <span className="inline-flex items-center gap-1 bg-destructive/90 text-destructive-foreground rounded-full px-2.5 py-1 text-xs font-bold">
            <Plus className="h-3 w-3" /> Pesan {formatNumber(card.ideal_qty)}
          </span>
        </div>
      </div>
      <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed font-medium ${
        priority === "wajib"
          ? "bg-red-100/80 dark:bg-red-900/30 text-red-800 dark:text-red-300"
          : "bg-orange-100/80 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
      }`}>
        💬 {getMissedReason(card)}
      </div>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>Stok:</span>
          <span className={`font-extrabold text-base ${card.stok === 0 ? "text-destructive" : card.stok <= 5 ? "text-warning" : "text-foreground"}`}>{formatNumber(card.stok)}</span>
        </div>
        {card.cost > 0 && (
          <span className="text-xs text-muted-foreground">Budget: <span className="font-bold text-foreground">{formatRupiah(card.cost)}</span></span>
        )}
      </div>
    </div>
  );
}


// ── Collapsible Section — Bigger touch target ──
function CollapsibleSection({ icon: Icon, title, count, color, sectionRef, isOpen, onToggle, children }: {
  icon: LucideIcon; title: string; count: number; color: string;
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
  const {
    score,
    summary,
    cards,
    missed,
    other_items = [],
    unknown_codes,
    total_cost,
    total_cost_other = 0,
    budget_tambah,
    budget_missed,
    budget_total,
    target_days_used,
    review_basis,
  } = result;

  const needMoreCards = cards.filter(c => isNeedMore(c)).sort((a, b) => a.dos - b.dos);
  const tooMuchCards = !alreadySent ? cards.filter(c => isTooMuch(c)) : [];
  const okCards = cards.filter(c => !isNeedMore(c) && !(isTooMuch(c) && !alreadySent));

  const totalTambah = needMoreCards.reduce((sum, c) => sum + getShortfall(c), 0);
  

  // Group other items by kategori
  const otherByKategori: Record<string, typeof other_items> = {};
  for (const item of other_items) {
    const kat = item.kategori || "Lainnya";
    if (!otherByKategori[kat]) otherByKategori[kat] = [];
    otherByKategori[kat].push(item);
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tambah: true, missed: true, kurangi: false, cukup: false, other: true,
  });
  const tambahRef = useRef<HTMLDivElement>(null);
  const missedRef = useRef<HTMLDivElement>(null);
  const kurangiRef = useRef<HTMLDivElement>(null);
  const cukupRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const scrollToSection = useCallback((key: string, ref: React.RefObject<HTMLDivElement>) => {
    setOpenSections(prev => ({ ...prev, [key]: true }));
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  return (
    <div className="space-y-5">
      {/* ── Summary Card ── */}
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
              {review_basis && (
                <p className="text-xs text-muted-foreground">
                  Patokan review: {review_basis}
                  {target_days_used ? ` (${target_days_used} hari)` : ""}
                </p>
              )}
            </div>
          </div>
          
          {/* ── Total Aman Siapkan — HERO ── */}
          {(() => {
            const myOrder = total_cost + total_cost_other;
            const extras = (budget_tambah || 0) + (budget_missed || 0);
            const totalAman = (budget_total || 0) > 0 ? budget_total : myOrder + extras;
            const delta = Math.max(0, totalAman - myOrder);

            // Top contributors to the delta: combine missed + needMore shortfalls
            type Contributor = { kode: string; nama: string; cost: number; reason: "missed" | "tambah" };
            const contributors: Contributor[] = [
              ...missed
                .filter(m => (m.cost || 0) > 0)
                .map(m => ({ kode: m.kode, nama: m.nama, cost: m.cost, reason: "missed" as const })),
              ...needMoreCards
                .map(c => ({
                  kode: c.kode,
                  nama: c.nama,
                  cost: Math.max(0, getShortfall(c)) * c.harga_modal,
                  reason: "tambah" as const,
                }))
                .filter(c => c.cost > 0),
            ].sort((a, b) => b.cost - a.cost).slice(0, 3);

            return (
              <div className="mt-5 space-y-3">
                {/* Hero: Total Aman Siapkan */}
                <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wide">
                    <ShieldCheck className="h-4 w-4" />
                    Total Aman Disiapkan
                  </div>
                  <div className="mt-1 text-3xl font-black tabular-nums text-primary leading-tight">
                    {formatRupiah(totalAman)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Angka ini = pesanan Boss + item wajib yang belum masuk draft.
                    <strong className="text-foreground"> Pegang angka ini</strong> sebagai budget final sebelum kirim ke supplier.
                  </p>
                </div>

                {/* Breakdown */}
                <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground mb-1">
                    <Wallet className="h-4 w-4 text-primary" />
                    Rincian
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Sudah Boss pesan (2 Ons)
                    </span>
                    <span className="font-bold tabular-nums">{formatRupiah(total_cost)}</span>
                  </div>
                  {total_cost_other > 0 && (
                    <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" /> Sudah Boss pesan (Ukuran lain)
                      </span>
                      <span className="font-bold tabular-nums">+{formatRupiah(total_cost_other)}</span>
                    </div>
                  )}
                  {(budget_tambah || 0) > 0 && (
                    <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                      <span className="flex items-center gap-1.5">
                        <CirclePlus className="h-3.5 w-3.5" /> Sebaiknya ditambah (qty kurang)
                      </span>
                      <span className="font-bold tabular-nums">+{formatRupiah(budget_tambah)}</span>
                    </div>
                  )}
                  {(budget_missed || 0) > 0 && (
                    <div className="flex items-center justify-between text-destructive">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Wajib beli (belum dipesan)
                      </span>
                      <span className="font-bold tabular-nums">+{formatRupiah(budget_missed)}</span>
                    </div>
                  )}
                  <div className="border-t border-border/60 my-1.5" />
                  <div className="flex items-center justify-between font-extrabold">
                    <span className="text-sm">Total Aman</span>
                    <span className="tabular-nums text-primary">{formatRupiah(totalAman)}</span>
                  </div>
                </div>

                {/* Scope explainer + Why higher than Analisa */}
                {delta > 0 && (
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                          Kenapa lebih besar dari Analisa?
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                          <strong>Analisa</strong> = daftar rekomendasi otomatis untuk semua barang yang perlu restok.
                          <br />
                          <strong>Review AI</strong> = cek draft Boss + tambahkan item kritis yang <em>belum</em> masuk daftar Boss.
                          <br />
                          Selisih <strong className="tabular-nums">{formatRupiah(delta)}</strong> berasal dari item di bawah ini:
                        </p>
                      </div>
                    </div>
                    {contributors.length > 0 && (
                      <ul className="space-y-1.5 pl-1">
                        {contributors.map(c => (
                          <li key={c.kode} className="flex items-center justify-between text-xs bg-white/60 dark:bg-blue-950/30 rounded-lg px-2.5 py-1.5">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.reason === "missed" ? "bg-destructive" : "bg-orange-500"}`} />
                              <span className="font-mono font-bold shrink-0">{c.kode}</span>
                              <span className="text-muted-foreground truncate">— {c.reason === "missed" ? "wajib beli" : "kurang qty"}</span>
                            </span>
                            <span className="font-bold tabular-nums shrink-0 ml-2">+{formatRupiah(c.cost)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })()}


          {/* Quick Stats */}
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
            {other_items.length > 0 && (
              <StatPill
                icon={Package}
                label="Ukuran lain"
                value={`${other_items.length}`}
                className="bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400"
                onClick={() => scrollToSection("other", otherRef)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2 Ons Sections */}
      {needMoreCards.length > 0 && (
        <CollapsibleSection icon={Plus} title="Sebaiknya Ditambah (di draft, qty kurang)" count={needMoreCards.length} color="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400" sectionRef={tambahRef} isOpen={openSections.tambah} onToggle={() => toggleSection("tambah")}>
          {needMoreCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {missed.length > 0 && (
        <CollapsibleSection icon={PackageX} title="Wajib Beli Sekarang (belum masuk draft)" count={missed.length} color="bg-red-100 dark:bg-red-900/40 text-destructive" sectionRef={missedRef} isOpen={openSections.missed} onToggle={() => toggleSection("missed")}>
          {missed.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <MissedProductCard card={card} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {tooMuchCards.length > 0 && (
        <CollapsibleSection icon={ArrowDown} title="Bisa Ditunda / Kurangi" count={tooMuchCards.length} color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" sectionRef={kurangiRef} isOpen={openSections.kurangi} onToggle={() => toggleSection("kurangi")}>
          {tooMuchCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {okCards.length > 0 && (
        <CollapsibleSection icon={CheckCircle2} title="Sudah Cukup ✓" count={okCards.length} color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" sectionRef={cukupRef} isOpen={openSections.cukup} onToggle={() => toggleSection("cukup")}>
          {okCards.map((card, i) => (
            <div key={card.kode} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* ── Non-2 Ons Section ── */}
      {other_items.length > 0 && (
        <CollapsibleSection icon={Package} title="Pesanan Ukuran Lain" count={other_items.length} color="bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400" sectionRef={otherRef} isOpen={openSections.other} onToggle={() => toggleSection("other")}>
          {Object.entries(otherByKategori).map(([kategori, items]) => (
            <div key={kategori} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="secondary" className="text-xs font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
                  {kategori}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {items.length} item · {formatRupiah(items.reduce((s, i) => s + i.cost, 0))}
                </span>
              </div>
              {items.map((item, i) => (
                <div key={item.kode} className="card-premium p-4 space-y-2 bg-purple-50/50 dark:bg-purple-950/20 border-purple-200/60 dark:border-purple-800/40 animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-extrabold text-base">{item.kode}</span>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{item.nama}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 bg-purple-500 text-white rounded-full px-3 py-1.5 text-sm font-bold shadow-sm shrink-0">
                      <ShoppingCart className="h-3.5 w-3.5" /> {formatNumber(item.qty)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Modal: {formatRupiah(item.harga_modal)}/pcs</span>
                    <span className="font-bold tabular-nums">{formatRupiah(item.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* Subtotal */}
          <div className="flex items-center justify-between px-2 py-2 rounded-xl bg-purple-100/60 dark:bg-purple-900/30">
            <span className="text-sm font-bold text-purple-700 dark:text-purple-400">Subtotal ukuran lain</span>
            <span className="text-base font-extrabold tabular-nums text-purple-700 dark:text-purple-400">{formatRupiah(total_cost_other)}</span>
          </div>
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
