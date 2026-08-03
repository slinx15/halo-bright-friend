import { useMemo, useState } from "react";
import { Search, ShoppingBag, X } from "lucide-react";

import { useProducts } from "@/hooks/useProducts";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";

const KATEGORI_ORDER = ["2 Ons", "3 Ons", "4 Ons", "5 Ons", "8 Ons", "18 Gram"];
const STATUS_FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "habis", label: "Habis" },
  { key: "tipis", label: "Tipis" },
  { key: "ada", label: "Ada" },
] as const;

type StatusKey = (typeof STATUS_FILTERS)[number]["key"];

function statusOf(jumlah: number): Exclude<StatusKey, "semua"> {
  if (jumlah <= 0) return "habis";
  if (jumlah <= 25) return "tipis";
  return "ada";
}

const STATUS_STYLE: Record<Exclude<StatusKey, "semua">, { label: string; badge: string; value: string }> = {
  habis: {
    label: "Kosongkan di Shopee",
    badge: "border-destructive/25 bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
  tipis: {
    label: "Stok menipis",
    badge: "border-warning/25 bg-warning/10 text-warning",
    value: "text-warning",
  },
  ada: {
    label: "Aman dijual",
    badge: "border-success/25 bg-success/10 text-success",
    value: "text-foreground",
  },
};

const StokShopee = () => {
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("Semua");
  const [status, setStatus] = useState<StatusKey>("semua");

  const kategoriList = useMemo(() => {
    const found = new Set((products ?? []).map((p) => p.kategori || "Lainnya"));
    const ordered = KATEGORI_ORDER.filter((k) => found.has(k));
    const extras = [...found].filter((k) => !KATEGORI_ORDER.includes(k)).sort();
    return ["Semua", ...ordered, ...extras];
  }, [products]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? [])
      .map((p) => ({
        id: p.id,
        kode: p.kode,
        kategori: p.kategori || "Lainnya",
        jumlah: p.stock?.jumlah ?? 0,
      }))
      .filter((r) => (kategori === "Semua" ? true : r.kategori === kategori))
      .filter((r) => (status === "semua" ? true : statusOf(r.jumlah) === status))
      .filter((r) => (term ? r.kode.toLowerCase().includes(term) : true))
      .sort((a, b) => a.jumlah - b.jumlah || a.kode.localeCompare(b.kode));
  }, [products, search, kategori, status]);

  const habisCount = useMemo(
    () => (products ?? []).filter((p) => (p.stock?.jumlah ?? 0) <= 0).length,
    [products],
  );

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        icon={ShoppingBag}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        title="Cek Stok untuk Shopee"
        subtitle="Lihat stok gudang di sini, lalu ubah sendiri di aplikasi Shopee."
      />

      <Card className="rounded-2xl">
        <CardContent className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode produk..."
              className="h-12 rounded-xl pl-9 pr-9 text-base"
            />
            {search && (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {kategoriList.map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kategori === k ? "default" : "outline"}
                className="h-10 shrink-0 rounded-full px-4 text-sm font-semibold"
                onClick={() => setKategori(k)}
              >
                {k}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={status === s.key ? "secondary" : "ghost"}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-semibold",
                  status === s.key && "ring-1 ring-border",
                )}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
                {s.key === "habis" && habisCount > 0 ? ` (${habisCount})` : ""}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-base text-muted-foreground">
            Tidak ada produk yang cocok dengan filter ini.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const st = statusOf(r.jumlah);
            const style = STATUS_STYLE[st];
            return (
              <article
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-lg font-bold text-foreground">{r.kode}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.kategori}</p>
                  <Badge className={cn("mt-2 rounded-full text-xs font-semibold", style.badge)}>
                    {style.label}
                  </Badge>
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn("block text-3xl font-extrabold leading-none", style.value)}>
                    {formatNumber(r.jumlah)}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-muted-foreground">pcs</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StokShopee;
