import { useCallback, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flame,
  Info,
  Package,
  PackageX,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/formatters";

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
    if (card.stok === 0) return `Stok habis, barang ${speed} - harus pesan ${formatNumber(card.ideal_qty)} pcs`;
    if (card.dos <= 2) return `Barang ${speed}, stok ${timeLeft} - kurang ${formatNumber(getShortfall(card))} pcs biar aman`;
    return `Barang ${speed}, pesan segini ${timeLeft} aja - tambahin biar ga kehabisan`;
  }

  if (card.verdict === "lebih" && !alreadySent) {
    if (card.velocity === 0) return "Barang ga pernah laku, pesan segini bakal numpuk di gudang";
    if (card.stok === 0) return `Stok habis, tapi pesanan Boss lebih dari yang dibutuhkan - cukup ${formatNumber(card.ideal_qty)} aja`;
    if (card.ideal_qty === 0) return `Stok masih ${formatNumber(card.stok)} pcs, belum perlu nambah`;
    if (card.velocity < 1) return `Barang ${speed}, pesan kebanyakan nanti numpuk di gudang`;
    return `Cukup pesan ${formatNumber(card.ideal_qty)} aja, sisanya bisa buat barang lain`;
  }

  if (card.stok === 0 && card.velocity > 0) return "Stok habis tapi pesanan Boss sudah pas";
  if (card.is_bestseller) return `Barang ${speed}, qty segini sudah pas`;
  if (card.velocity > 0) return `Barang ${speed}, qty segini cukup`;
  if (card.velocity === 0 && card.qty_boss > 0) return "Belum ada data penjualan, tapi Boss udah pesan";
  return "Stok aman";
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
  if (card.stok === 0 || card.dos <= 2) return "wajib";
  return "sebaiknya";
}

const PRIORITY_META: Record<Priority, { label: string; classes: string; icon: LucideIcon }> = {
  wajib: {
    label: "Wajib Sekarang",
    classes: "bg-destructive text-destructive-foreground",
    icon: AlertTriangle,
  },
  sebaiknya: {
    label: "Sebaiknya Ditambah",
    classes: "bg-orange-500 text-white",
    icon: Plus,
  },
  tunda: {
    label: "Bisa Ditunda",
    classes: "bg-blue-500 text-white",
    icon: Clock,
  },
  cukup: {
    label: "Sudah Cukup",
    classes: "bg-emerald-500 text-white",
    icon: CheckCircle2,
  },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${meta.classes}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "text-success" : score >= 5 ? "text-warning" : "text-destructive";
  const strokeColor = score >= 8 ? "stroke-success" : score >= 5 ? "stroke-warning" : "stroke-destructive";
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
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

function StatPill({
  icon: Icon,
  label,
  value,
  className = "",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all active:scale-95 ${onClick ? "cursor-pointer hover:ring-2 hover:ring-ring/20" : ""} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">{label}</span>
      <span className="ml-auto font-bold tabular-nums">{value}</span>
    </button>
  );
}

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
    <div className={`card-premium space-y-2.5 p-3.5 transition-all duration-200 active:scale-[0.98] ${accentClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-extrabold">{card.kode}</span>
            {card.is_bestseller && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                <Flame className="h-3.5 w-3.5" />
                Laris
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{card.nama}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PriorityBadge priority={priority} />
          {needMore ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/90 px-2.5 py-1 text-[11px] font-bold text-white">
              <Plus className="h-3 w-3" /> +{formatNumber(shortfall)} pcs
            </span>
          ) : tooMuch ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/90 px-2.5 py-1 text-[11px] font-bold text-white">
              <ArrowDown className="h-3 w-3" /> -{formatNumber(excess)} pcs
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>Stok:</span>
          <span className={`text-base font-extrabold ${card.stok === 0 ? "text-destructive" : card.stok <= 5 ? "text-warning" : "text-foreground"}`}>
            {formatNumber(card.stok)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Pesan:</span>
          <span className="text-base font-extrabold text-foreground">{formatNumber(card.qty_boss)}</span>
        </div>
        {(needMore || tooMuch) && (
          <>
            <span className="text-muted-foreground">-&gt;</span>
            <span className={`text-base font-extrabold ${needMore ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`}>
              {formatNumber(card.ideal_qty)} pcs
            </span>
          </>
        )}
      </div>

      <div
        className={`rounded-xl px-3.5 py-2.5 text-sm font-medium leading-relaxed ${
          priority === "wajib"
            ? "bg-red-100/80 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            : priority === "sebaiknya"
              ? "bg-orange-100/80 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
              : priority === "tunda"
                ? "bg-blue-100/80 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
        }`}
      >
        💬 {getReason(card, alreadySent)}
      </div>
    </div>
  );
}

function MissedProductCard({ card }: { card: MissedCard }) {
  const priority = getMissedPriority(card);
  const accentClass =
    priority === "wajib"
      ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50"
      : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50";

  return (
    <div className={`card-premium space-y-2.5 p-3.5 transition-all duration-200 active:scale-[0.98] ${accentClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-base font-extrabold">{card.kode}</span>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{card.nama}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PriorityBadge priority={priority} />
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/90 px-2.5 py-1 text-[11px] font-bold text-destructive-foreground">
            <Plus className="h-3 w-3" />
            Pesan {formatNumber(card.ideal_qty)}
          </span>
        </div>
      </div>

      <div
        className={`rounded-xl px-3.5 py-2.5 text-sm font-medium leading-relaxed ${
          priority === "wajib"
            ? "bg-red-100/80 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            : "bg-orange-100/80 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
        }`}
      >
        💬 {getMissedReason(card)}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>Stok:</span>
          <span className={`text-base font-extrabold ${card.stok === 0 ? "text-destructive" : card.stok <= 5 ? "text-warning" : "text-foreground"}`}>
            {formatNumber(card.stok)}
          </span>
        </div>
        {card.cost > 0 && (
          <span className="text-xs text-muted-foreground">
            Budget: <span className="font-bold text-foreground">{formatRupiah(card.cost)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({
  icon: Icon,
  title,
  subtitle,
  count,
  color,
  sectionRef,
  isOpen,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  count: number;
  color: string;
  sectionRef?: React.RefObject<HTMLDivElement>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5" ref={sectionRef}>
      <button
        type="button"
        onClick={onToggle}
        className="group flex min-h-[48px] w-full items-center gap-2.5 px-1 pt-1 text-left transition-all duration-150 active:scale-[0.98]"
      >
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <Badge variant="secondary" className="text-xs font-bold">
          {count}
        </Badge>
        <ChevronDown className={`ml-auto h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
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

  const needMoreCards = cards.filter((card) => isNeedMore(card)).sort((a, b) => a.dos - b.dos);
  const tooMuchCards = !alreadySent ? cards.filter((card) => isTooMuch(card)) : [];
  const okCards = cards.filter((card) => !isNeedMore(card) && !(isTooMuch(card) && !alreadySent));
  const totalTambah = needMoreCards.reduce((sum, card) => sum + getShortfall(card), 0);

  const otherByKategori: Record<string, typeof other_items> = {};
  for (const item of other_items) {
    const kategori = item.kategori || "Lainnya";
    if (!otherByKategori[kategori]) otherByKategori[kategori] = [];
    otherByKategori[kategori].push(item);
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tambah: true,
    missed: true,
    kurangi: false,
    cukup: false,
    other: true,
  });
  const [showDeltaDetails, setShowDeltaDetails] = useState(false);
  const tambahRef = useRef<HTMLDivElement>(null);
  const missedRef = useRef<HTMLDivElement>(null);
  const kurangiRef = useRef<HTMLDivElement>(null);
  const cukupRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const scrollToSection = useCallback((key: string, ref: React.RefObject<HTMLDivElement>) => {
    setOpenSections((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  return (
    <div className="space-y-5">
      <Card className="card-premium overflow-hidden shadow-premium">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ScoreRing score={score} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-lg font-extrabold">Hasil Review</span>
              </div>
              {summary && <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>}
              {review_basis && (
                <p className="text-xs text-muted-foreground">
                  Patokan review: {review_basis}
                  {target_days_used ? ` (${target_days_used} hari)` : ""}
                </p>
              )}
            </div>
          </div>

          {(() => {
            const myOrder = total_cost + total_cost_other;
            const extras = (budget_tambah || 0) + (budget_missed || 0);
            const totalAman = (budget_total || 0) > 0 ? budget_total : myOrder + extras;
            const delta = Math.max(0, totalAman - myOrder);
            const overOrderCost = tooMuchCards.reduce((sum, card) => sum + getExcess(card) * card.harga_modal, 0);
            const baseline2Ons =
              cards.reduce((sum, card) => sum + card.ideal_qty * card.harga_modal, 0) +
              missed.reduce((sum, card) => sum + card.cost, 0);
            const baselineTotal = baseline2Ons + total_cost_other;
            const belumMasukRingkasan = Math.max(0, budget_missed || 0);

            type Contributor = {
              kode: string;
              nama: string;
              cost: number;
              reason: "missed" | "tambah";
            };

            const contributors: Contributor[] = [
              ...missed
                .filter((item) => (item.cost || 0) > 0)
                .map((item) => ({
                  kode: item.kode,
                  nama: item.nama,
                  cost: item.cost,
                  reason: "missed" as const,
                })),
              ...needMoreCards
                .map((item) => ({
                  kode: item.kode,
                  nama: item.nama,
                  cost: getShortfall(item) * item.harga_modal,
                  reason: "tambah" as const,
                }))
                .filter((item) => item.cost > 0),
            ]
              .sort((a, b) => b.cost - a.cost)
              .slice(0, 3);

            return (
              <div className="mt-5 space-y-3">
                <div className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Total Final</p>
                      <div className="mt-1 text-3xl font-black leading-tight text-foreground tabular-nums">
                        {formatRupiah(totalAman)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Ini angka akhir yang bisa langsung Boss pegang.</p>
                    </div>
                    <div className="rounded-full bg-muted p-2.5">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                  </div>

                  <div className="rounded-xl bg-muted/35 p-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Wallet className="h-4 w-4 text-primary" />
                      Ringkasan belanja
                    </div>
                    <div className="mt-3 space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Saya pesan</span>
                        <span className="font-bold tabular-nums">{formatRupiah(myOrder)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Target dari ringkasan</span>
                        <span className="font-bold tabular-nums">{formatRupiah(baselineTotal)}</span>
                      </div>
                      {belumMasukRingkasan > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Belum masuk dari ringkasan</span>
                          <span className="font-bold tabular-nums text-red-600 dark:text-red-400">+{formatRupiah(belumMasukRingkasan)}</span>
                        </div>
                      )}
                      {(budget_tambah || 0) > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Perlu ditambah</span>
                          <span className="font-bold tabular-nums text-orange-600 dark:text-orange-400">+{formatRupiah(budget_tambah)}</span>
                        </div>
                      )}
                      {overOrderCost > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Lebih pesan</span>
                          <span className="font-bold tabular-nums text-blue-600 dark:text-blue-400">+{formatRupiah(overOrderCost)}</span>
                        </div>
                      )}
                      <div className="border-t border-border/60 pt-2.5" />
                      <div className="flex items-center justify-between gap-3 text-base font-extrabold">
                        <span>Total final</span>
                        <span className="text-primary tabular-nums">{formatRupiah(totalAman)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {delta > 0 && (
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-foreground">Kenapa totalnya beda?</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Ada selisih <strong className="text-foreground tabular-nums">{formatRupiah(delta)}</strong> karena masih ada barang dari Ringkasan yang belum masuk, qty yang masih kurang, atau pesanan tambahan di luar Ringkasan.
                        </p>
                      </div>
                    </div>
                    {contributors.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowDeltaDetails((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
                        >
                          <span>{showDeltaDetails ? "Sembunyikan penyebab" : "Lihat penyebab"}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${showDeltaDetails ? "rotate-180" : ""}`} />
                        </button>
                        {showDeltaDetails && (
                          <ul className="mt-3 space-y-2">
                            {contributors.map((item) => (
                              <li key={item.kode} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold">{item.kode}</span>
                                    <span className="text-muted-foreground">
                                      {item.reason === "missed" ? "belum masuk dari ringkasan" : "perlu ditambah"}
                                    </span>
                                  </div>
                                </div>
                                <span className="shrink-0 font-bold tabular-nums">+{formatRupiah(item.cost)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="mt-4 grid grid-cols-2 gap-2">
            {needMoreCards.length > 0 && (
              <StatPill
                icon={Plus}
                label="Tambah"
                value={`${needMoreCards.length} (+${formatNumber(totalTambah)})`}
                className="bg-orange-50 text-orange-700 dark:bg-orange-950/25 dark:text-orange-300"
                onClick={() => scrollToSection("tambah", tambahRef)}
              />
            )}
            {tooMuchCards.length > 0 && (
              <StatPill
                icon={ArrowDown}
                label="Kurangi"
                value={`${tooMuchCards.length}`}
                className="bg-blue-50 text-blue-700 dark:bg-blue-950/25 dark:text-blue-300"
                onClick={() => scrollToSection("kurangi", kurangiRef)}
              />
            )}
            {missed.length > 0 && (
              <StatPill
                icon={PackageX}
                label="Belum masuk"
                value={`${missed.length}`}
                className="bg-red-50 text-red-700 dark:bg-red-950/25 dark:text-red-300"
                onClick={() => scrollToSection("missed", missedRef)}
              />
            )}
            {okCards.length > 0 && (
              <StatPill
                icon={CheckCircle2}
                label="Cukup"
                value={`${okCards.length}`}
                className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300"
                onClick={() => scrollToSection("cukup", cukupRef)}
              />
            )}
            {other_items.length > 0 && (
              <StatPill
                icon={Package}
                label="Ukuran lain"
                value={`${other_items.length}`}
                className="bg-purple-50 text-purple-700 dark:bg-purple-950/25 dark:text-purple-300"
                onClick={() => scrollToSection("other", otherRef)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {needMoreCards.length > 0 && (
        <CollapsibleSection
          icon={Plus}
          title="Perlu ditambah"
          subtitle="Qty di draft masih kurang"
          count={needMoreCards.length}
          color="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
          sectionRef={tambahRef}
          isOpen={openSections.tambah}
          onToggle={() => toggleSection("tambah")}
        >
          {needMoreCards.map((card, index) => (
            <div
              key={card.kode}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
            >
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {missed.length > 0 && (
        <CollapsibleSection
          icon={PackageX}
          title="Belum masuk pesanan"
          subtitle="Masih ada item penting yang belum ikut"
          count={missed.length}
          color="bg-red-100 text-destructive dark:bg-red-900/40"
          sectionRef={missedRef}
          isOpen={openSections.missed}
          onToggle={() => toggleSection("missed")}
        >
          {missed.map((card, index) => (
            <div
              key={card.kode}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
            >
              <MissedProductCard card={card} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {tooMuchCards.length > 0 && (
        <CollapsibleSection
          icon={ArrowDown}
          title="Bisa dikurangi"
          subtitle="Qty yang sudah lebih dari target"
          count={tooMuchCards.length}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          sectionRef={kurangiRef}
          isOpen={openSections.kurangi}
          onToggle={() => toggleSection("kurangi")}
        >
          {tooMuchCards.map((card, index) => (
            <div
              key={card.kode}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
            >
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {okCards.length > 0 && (
        <CollapsibleSection
          icon={CheckCircle2}
          title="Sudah cukup"
          subtitle="Qty sudah pas dengan target"
          count={okCards.length}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
          sectionRef={cukupRef}
          isOpen={openSections.cukup}
          onToggle={() => toggleSection("cukup")}
        >
          {okCards.map((card, index) => (
            <div
              key={card.kode}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
            >
              <ProductCard card={card} alreadySent={alreadySent} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {other_items.length > 0 && (
        <CollapsibleSection
          icon={Package}
          title="Ukuran lain"
          subtitle="Tidak ikut review, hanya dihitung biayanya"
          count={other_items.length}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400"
          sectionRef={otherRef}
          isOpen={openSections.other}
          onToggle={() => toggleSection("other")}
        >
          {Object.entries(otherByKategori).map(([kategori, items]) => (
            <div key={kategori} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge
                  variant="secondary"
                  className="bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
                >
                  {kategori}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {items.length} item | {formatRupiah(items.reduce((sum, item) => sum + item.cost, 0))}
                </span>
              </div>
              {items.map((item, index) => (
                <div
                  key={item.kode}
                  className="card-premium animate-fade-in space-y-2 border-purple-200/60 bg-purple-50/40 p-3.5 dark:border-purple-800/40 dark:bg-purple-950/15"
                  style={{ animationDelay: `${Math.min(index * 30, 300)}ms`, animationFillMode: "both" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-base font-extrabold">{item.kode}</span>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.nama}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {formatNumber(item.qty)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-background/70 px-2.5 py-2">
                      <div className="text-[11px] text-muted-foreground">Qty</div>
                      <div className="mt-0.5 text-base font-extrabold text-foreground">{formatNumber(item.qty)}</div>
                    </div>
                    <div className="rounded-lg bg-background/70 px-2.5 py-2">
                      <div className="text-[11px] text-muted-foreground">Budget</div>
                      <div className="mt-0.5 text-sm font-bold text-foreground">{formatRupiah(item.cost)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-purple-100/60 px-2 py-2 dark:bg-purple-900/30">
            <span className="text-sm font-bold text-purple-700 dark:text-purple-400">Subtotal ukuran lain</span>
            <span className="text-base font-extrabold text-purple-700 tabular-nums dark:text-purple-400">
              {formatRupiah(total_cost_other)}
            </span>
          </div>
        </CollapsibleSection>
      )}

      {unknown_codes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm font-bold text-destructive">Kode tidak dikenal:</span>
          {unknown_codes.map((code) => (
            <Badge key={code} variant="secondary" className="bg-destructive/10 font-mono text-xs text-destructive">
              {code}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
