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
  Printer,
  ChevronLeft,
  Store,
  Package,
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

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Nota - ${selectedNota?.toko} - ${selectedNota?.dateLabel}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Arial', sans-serif; padding: 16px; color: #000; font-size: 12px; }
          .nota-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
          .nota-header h1 { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; }
          .nota-header .address { font-size: 10px; margin-top: 2px; }
          .nota-info { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; }
          .nota-info .label { min-width: 70px; }
          table { width: 100%; border-collapse: collapse; }
          th { border: 1px solid #000; padding: 4px 6px; font-size: 11px; font-weight: 700; text-align: center; }
          td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .nota-footer { display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; }
          .nota-footer .sign { text-align: center; min-width: 100px; }
          .nota-footer .sign .line { border-top: 1px solid #000; margin-top: 40px; width: 80px; display: inline-block; }
          .nota-summary { text-align: right; font-size: 11px; }
          .nota-summary td { border: 1px solid #000; padding: 2px 6px; }
          @media print { body { padding: 8px; } }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
        <script>window.print(); window.close();<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
            className="rounded-xl gap-1.5"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>

        {/* Printable content */}
        <div ref={printRef}>
          <Card className="card-premium overflow-hidden">
            <CardContent className="p-5 space-y-4">
              {/* Header */}
              <div className="text-center space-y-1 pb-3 border-b-2 border-foreground/20">
                <h2 className="text-xl font-extrabold tracking-tight">
                  RRCollections
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Nota Penjualan
                </p>
              </div>

              {/* Info */}
              <div className="flex justify-between text-xs">
                <div className="space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">Toko:</span>{" "}
                    <span className="font-bold">{selectedNota.toko}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Tanggal:</span>{" "}
                    <span className="font-bold">{selectedNota.dateLabel}</span>
                  </p>
                </div>
                <div className="text-right space-y-0.5">
                  <p>
                    <span className="text-muted-foreground">Total Item:</span>{" "}
                    <span className="font-bold">
                      {selectedNota.items.length}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Total Pcs:</span>{" "}
                    <span className="font-bold">
                      {formatNumber(selectedNota.totalQty)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-foreground/15">
                      <th className="text-left py-2 font-bold text-muted-foreground">
                        No
                      </th>
                      <th className="text-left py-2 font-bold text-muted-foreground">
                        Kode
                      </th>
                      <th className="text-left py-2 font-bold text-muted-foreground">
                        Nama
                      </th>
                      <th className="text-right py-2 font-bold text-muted-foreground">
                        Qty
                      </th>
                      <th className="text-right py-2 font-bold text-muted-foreground">
                        Harga
                      </th>
                      <th className="text-right py-2 font-bold text-muted-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedNota.items.map((item, i) => (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-border/30",
                          i % 2 === 1 && "bg-muted/30"
                        )}
                      >
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-mono font-bold">
                          {item.products?.kode ?? "-"}
                        </td>
                        <td className="py-2 text-muted-foreground max-w-[120px] truncate">
                          {item.products?.nama ?? "-"}
                        </td>
                        <td className="py-2 text-right font-bold tabular-nums">
                          {item.qty_kirim}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatRupiah(item.harga_satuan)}
                        </td>
                        <td className="py-2 text-right font-bold tabular-nums">
                          {formatRupiah(item.total_harga)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground/20">
                      <td
                        colSpan={3}
                        className="py-2.5 font-extrabold text-sm"
                      >
                        TOTAL
                      </td>
                      <td className="py-2.5 text-right font-extrabold text-sm tabular-nums">
                        {formatNumber(selectedNota.totalQty)}
                      </td>
                      <td></td>
                      <td className="py-2.5 text-right font-extrabold text-sm tabular-nums text-primary">
                        {formatRupiah(selectedNota.totalHarga)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
