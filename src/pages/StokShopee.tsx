import { useMemo, useState } from "react";
import { Download, Search, Settings2, ShoppingBag, X } from "lucide-react";

import { useProducts } from "@/hooks/useProducts";
import { useShopeeListings, useToggleShopeeListing } from "@/hooks/useShopeeListings";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { downloadShopeeStockFile } from "@/lib/shopeeTemplate";
import { toast } from "sonner";

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
  const { data: listings, isLoading: loadingListings } = useShopeeListings();
  const toggleListing = useToggleShopeeListing();

  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("Semua");
  const [status, setStatus] = useState<StatusKey>("semua");
  const [showAll, setShowAll] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  const listingByProduct = useMemo(() => {
    const map = new Map<string, { id: string; active: boolean }>();
    (listings ?? []).forEach((l) => {
      if (!l.product_id) return;
      const prev = map.get(l.product_id);
      if (!prev || (!prev.active && l.is_active)) {
        map.set(l.product_id, { id: l.id, active: l.is_active });
      }
    });
    return map;
  }, [listings]);

  const shopeeCount = useMemo(
    () => [...listingByProduct.values()].filter((v) => v.active).length,
    [listingByProduct],
  );

  const kategoriList = useMemo(() => {
    const found = new Set((products ?? []).map((p) => p.kategori || "Lainnya"));
    const ordered = KATEGORI_ORDER.filter((k) => found.has(k));
    const extras = [...found].filter((k) => !KATEGORI_ORDER.includes(k)).sort();
    return ["Semua", ...ordered, ...extras];
  }, [products]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const onlyShopee = !showAll && !manageMode;
    return (products ?? [])
      .map((p) => ({
        id: p.id,
        kode: p.kode,
        kategori: p.kategori || "Lainnya",
        jumlah: p.stock?.jumlah ?? 0,
        listing: listingByProduct.get(p.id),
      }))
      .filter((r) => (onlyShopee ? r.listing?.active : true))
      .filter((r) => (kategori === "Semua" ? true : r.kategori === kategori))
      .filter((r) => (status === "semua" ? true : statusOf(r.jumlah) === status))
      .filter((r) => (term ? r.kode.toLowerCase().includes(term) : true))
      .sort((a, b) => a.jumlah - b.jumlah || a.kode.localeCompare(b.kode));
  }, [products, search, kategori, status, showAll, manageMode, listingByProduct]);

  const habisCount = useMemo(
    () =>
      (products ?? []).filter(
        (p) => (p.stock?.jumlah ?? 0) <= 0 && listingByProduct.get(p.id)?.active,
      ).length,
    [products, listingByProduct],
  );

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    (products ?? []).forEach((p) => map.set(p.id, p.stock?.jumlah ?? 0));
    return map;
  }, [products]);

  const handleExport = () => {
    const exportRows = (listings ?? [])
      .filter((l) => l.is_active && !l.variation_id.startsWith("manual-"))
      .map((l) => ({
        shopee_product_id: l.shopee_product_id,
        shopee_product_name: l.shopee_product_name,
        variation_id: l.variation_id,
        variation_name: l.variation_name,
        parent_sku: l.parent_sku,
        sku: l.sku,
        price: l.price,
        min_qty: l.min_qty,
        max_qty: l.max_qty,
        stok: l.product_id ? (stockByProduct.get(l.product_id) ?? 0) : 0,
      }));

    if (exportRows.length === 0) {
      toast.error("Belum ada produk Shopee untuk diekspor.");
      return;
    }
    downloadShopeeStockFile(exportRows);
    toast.success(`File update stok Shopee dibuat (${exportRows.length} variasi).`);
  };

  const handleToggle = (row: (typeof rows)[number], enable: boolean) => {
    toggleListing.mutate(
      {
        productId: row.id,
        kode: row.kode,
        kategori: row.kategori,
        enable,
        existingId: row.listing?.id,
      },
      {
        onError: () => toast.error("Gagal menyimpan perubahan."),
      },
    );
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-primary/25 bg-primary/10 text-sm font-semibold text-primary">
              {shopeeCount} produk dijual di Shopee
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-10 rounded-full px-4 text-sm font-semibold"
              onClick={handleExport}
              disabled={loadingListings}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export file Shopee
            </Button>
            <Button
              size="sm"
              variant={manageMode ? "default" : "outline"}
              className="h-10 rounded-full px-4 text-sm font-semibold"
              onClick={() => setManageMode((v) => !v)}
            >
              <Settings2 className="mr-1.5 h-4 w-4" />
              {manageMode ? "Selesai atur" : "Atur produk Shopee"}
            </Button>
            {!manageMode && (
              <Button
                size="sm"
                variant="ghost"
                className="h-10 rounded-full px-4 text-sm font-semibold"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Hanya produk Shopee" : "Lihat semua produk"}
              </Button>
            )}
          </div>

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

      {isLoading || loadingListings ? (
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
                {manageMode ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Switch
                      checked={!!r.listing?.active}
                      onCheckedChange={(v) => handleToggle(r, v)}
                      aria-label={`Jual ${r.kode} di Shopee`}
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {r.listing?.active ? "Dijual" : "Tidak"}
                    </span>
                  </div>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className={cn("block text-3xl font-extrabold leading-none", style.value)}>
                      {formatNumber(r.jumlah)}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-muted-foreground">pcs</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StokShopee;
