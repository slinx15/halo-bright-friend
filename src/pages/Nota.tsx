import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { getAuthHeaders } from "@/lib/authHeaders";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CalendarIcon,
  Search,
  Share2,
  Store,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface StockOutRow {
  id: string;
  product_id: string;
  qty_pesan: number;
  qty_kirim: number;
  harga_satuan: number;
  harga_type: string;
  total_harga: number;
  toko: string | null;
  catatan: string | null;
  created_at: string;
  products: { kode: string; nama: string } | null;
}

interface NotaGroup {
  key: string;
  toko: string;
  date: string;
  dateLabel: string;
  items: StockOutRow[];
  totalQty: number;
  totalHarga: number;
}

const Nota = () => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [selectedNota, setSelectedNota] = useState<NotaGroup | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: history, isLoading } = useQuery({
    queryKey: ["stock_out_nota"],
    queryFn: async () => {
      const headers = await getAuthHeaders("return=representation");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=*,products(kode,nama)&order=created_at.desc,id.desc&limit=500`,
        { headers }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<StockOutRow[]>;
    },
  });

  const groups = useMemo(() => {
    if (!history) return [];
    const map = new Map<string, NotaGroup>();

    for (const row of history) {
      const d = new Date(row.created_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const toko = row.toko?.trim() || "Tanpa Toko";
      const key = `${dateStr}__${toko}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          toko,
          date: dateStr,
          dateLabel: format(d, "dd MMM yyyy", { locale: localeId }),
          items: [],
          totalQty: 0,
          totalHarga: 0,
        });
      }
      const g = map.get(key)!;
      g.items.push(row);
      g.totalQty += row.qty_kirim ?? 0;
      g.totalHarga += row.total_harga ?? 0;
    }

    return Array.from(map.values()).filter((g) => {
      const matchSearch =
        !search ||
        g.toko.toLowerCase().includes(search.toLowerCase()) ||
        g.items.some(
          (i) =>
            i.products?.kode?.toLowerCase().includes(search.toLowerCase()) ||
            i.products?.nama?.toLowerCase().includes(search.toLowerCase())
        );
      const matchDate =
        !dateFilter || g.date === format(dateFilter, "yyyy-MM-dd");
      return matchSearch && matchDate;
    });
  }, [history, search, dateFilter]);

  const handleShareWA = () => {
    if (!selectedNota) return;
    let text = `*NOTA PENJUALAN - RR COLLECTIONS*\n`;
    text += `Toko Perlengkapan Jahit\nJl. Rancabentang Barat Rt.04 Rw.25 No.517\n\n`;
    text += `📅 Tanggal: ${selectedNota.dateLabel}\n`;
    text += `🏪 Nama/Toko: ${selectedNota.toko}\n`;
    text += `No Nota: ${selectedNota.date.replace(/-/g, "")}-${selectedNota.toko.slice(0, 3).toUpperCase()}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;

    selectedNota.items.forEach((item, i) => {
      const kode = item.products?.kode ?? "-";
      text += `${i + 1}. ${kode} x${item.qty_kirim}\n`;
      text += `   ${formatRupiah(item.harga_satuan)} → *${formatRupiah(item.total_harga)}*\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `*TOTAL: ${formatRupiah(selectedNota.totalHarga)}*\n\n`;
    text += `📞 081287922663`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // Detail view
  if (selectedNota) {
    return (
      <div className="p-4 md:p-6 max-w-[800px] mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setSelectedNota(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold">Nota Penjualan</h1>
            <p className="text-xs text-muted-foreground">
              {selectedNota.toko} • {selectedNota.dateLabel}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 text-green-600 border-green-600 hover:bg-green-50"
            onClick={handleShareWA}
          >
            <Share2 className="h-4 w-4" />
            WhatsApp
          </Button>
        </div>

        {/* Printable content */}
        <div ref={printRef}>
          <Card className="card-premium overflow-hidden border-2 border-foreground/20">
            <CardContent className="p-5 space-y-3">
              {/* Header - mirip nota fisik */}
              <div className="text-center border-b-2 border-foreground pb-2">
                <h2 className="text-sm font-black tracking-wider uppercase">
                  TOKO PERLENGKAPAN JAHIT
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  Jl. Rancabentang Barat Rt.04 Rw.25 No.517
                </p>
              </div>

              {/* Info row - Logo area + details */}
              <div className="flex gap-3 items-start">
                <div className="shrink-0 space-y-0.5">
                  <img src={logo} alt="RR Collections" className="w-14 h-14 rounded-lg object-contain" />
                  <p className="text-[8px] text-center font-bold text-muted-foreground">•COLLECTIONS•</p>
                </div>
                <div className="flex-1 text-[10px] space-y-0.5">
                  <p className="text-muted-foreground">
                    Sedia: Benang Obras, Reseleting, Benang Jahit, Dll
                  </p>
                </div>
                <div className="text-right text-xs space-y-1">
                  <p>
                    <span className="text-muted-foreground">Tanggal: </span>
                    <span className="font-bold">{selectedNota.dateLabel}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Nama/Toko: </span>
                    <span className="font-bold">{selectedNota.toko}</span>
                  </p>
                </div>
              </div>

              {/* No Nota & WA */}
              <div className="flex justify-between text-[11px] border-b border-foreground/30 pb-1.5">
                <p>
                  <span className="text-muted-foreground">No Nota: </span>
                  <span className="font-bold font-mono">
                    {selectedNota.date.replace(/-/g, "")}-{selectedNota.toko.slice(0, 3).toUpperCase()}
                  </span>
                </p>
                <p className="text-muted-foreground">📞 081287922663</p>
              </div>

              {/* Table - mirip nota fisik dengan border penuh */}
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-foreground/30 py-1.5 px-2 text-center font-bold text-[11px] bg-muted/50 w-[60px]">
                        Banyak-<br/>nya
                      </th>
                      <th className="border border-foreground/30 py-1.5 px-2 text-center font-bold text-[11px] bg-muted/50">
                        Nama Barang
                      </th>
                      <th className="border border-foreground/30 py-1.5 px-2 text-center font-bold text-[11px] bg-muted/50 w-[90px]">
                        Harga<br/>Satuan
                      </th>
                      <th className="border border-foreground/30 py-1.5 px-2 text-center font-bold text-[11px] bg-muted/50 w-[90px]">
                        Jumlah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedNota.items.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-foreground/30 py-1.5 px-2 text-center font-bold tabular-nums">
                          {item.qty_kirim}
                        </td>
                        <td className="border border-foreground/30 py-1.5 px-2">
                          <span className="font-mono font-bold text-[10px]">{item.products?.kode ?? "-"}</span>
                          {item.products?.nama && (
                            <span className="text-muted-foreground ml-1 text-[10px]">
                              {item.products.nama}
                            </span>
                          )}
                        </td>
                        <td className="border border-foreground/30 py-1.5 px-2 text-right tabular-nums">
                          {formatRupiah(item.harga_satuan)}
                        </td>
                        <td className="border border-foreground/30 py-1.5 px-2 text-right font-bold tabular-nums">
                          {formatRupiah(item.total_harga)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer - Jumlah, Dp, Sisa + tanda tangan */}
              <div className="flex justify-between items-end pt-1">
                <div className="flex gap-8 text-[11px]">
                  <div className="text-center">
                    <p className="text-muted-foreground">Tanda terima,</p>
                    <div className="mt-8 border-t border-foreground/40 w-20"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Hormat kami,</p>
                    <div className="mt-8 border-t border-foreground/40 w-20"></div>
                  </div>
                </div>
                <div className="text-xs">
                  <table className="border-collapse">
                    <tbody>
                      <tr>
                        <td className="border border-foreground/30 py-1 px-2 font-bold text-right">Jumlah Rp.</td>
                        <td className="border border-foreground/30 py-1 px-3 text-right font-bold tabular-nums text-primary min-w-[100px]">
                          {formatRupiah(selectedNota.totalHarga)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-foreground/30 py-1 px-2 text-right text-muted-foreground">Dp</td>
                        <td className="border border-foreground/30 py-1 px-3 text-right tabular-nums">-</td>
                      </tr>
                      <tr>
                        <td className="border border-foreground/30 py-1 px-2 text-right text-muted-foreground">Sisa</td>
                        <td className="border border-foreground/30 py-1 px-3 text-right tabular-nums">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedNota.items.some((i) => i.catatan) && (
                <div className="text-xs text-muted-foreground pt-2 border-t border-border/30">
                  <span className="font-bold">Catatan:</span>{" "}
                  {selectedNota.items
                    .filter((i) => i.catatan)
                    .map((i) => i.catatan)
                    .join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-2xl bg-primary/10 shadow-sm">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-xl font-extrabold tracking-tight leading-tight">
            Nota Penjualan
          </h1>
          <p className="text-muted-foreground text-xs font-medium">
            Lihat & cetak nota per toko per hari
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari toko atau kode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "rounded-xl gap-1.5 shrink-0",
                dateFilter && "text-primary border-primary"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {dateFilter
                ? format(dateFilter, "dd/MM", { locale: localeId })
                : "Tanggal"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={dateFilter}
              onSelect={setDateFilter}
              locale={localeId}
            />
            {dateFilter && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full rounded-lg"
                  onClick={() => setDateFilter(undefined)}
                >
                  Reset
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Belum ada transaksi</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => (
            <button
              key={g.key}
              onClick={() => setSelectedNota(g)}
              className="w-full text-left"
            >
              <Card className="card-premium hover:shadow-lg transition-all duration-200 active:scale-[0.99] cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                    <Store className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-bold text-sm truncate">{g.toko}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {g.dateLabel} • {g.items.length} item
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="font-extrabold text-sm tabular-nums text-primary">
                      {formatRupiah(g.totalHarga)}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatNumber(g.totalQty)} pcs
                    </p>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Nota;
