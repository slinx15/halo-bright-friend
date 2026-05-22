import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Download, Loader2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useProducts } from "@/hooks/useProducts";
import * as XLSX from "xlsx";

import { getAuthHeaders } from "@/lib/authHeaders";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

type ParsedRow = {
  tanggal: string;
  toko: string;
  kode: string;
  pesanan: number;
  kiriman: number;
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0].toLowerCase();
  const sep = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const tanggalIdx = headers.findIndex((h) => h.includes("tanggal") || h.includes("date"));
  const tokoIdx = headers.findIndex((h) => h.includes("toko") || h.includes("store"));
  const kodeIdx = headers.findIndex((h) => h.includes("kode") || h.includes("no") || h.includes("benang"));
  const pesananIdx = headers.findIndex((h) => h.includes("pesan") || h.includes("order"));
  const kirimanIdx = headers.findIndex((h) => h.includes("kirim") || h.includes("send") || h.includes("qty"));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim());
    if (cols.length < 3) continue;
    const kode = kodeIdx >= 0 ? cols[kodeIdx] : "";
    if (!kode) continue;
    rows.push({
      tanggal: tanggalIdx >= 0 ? cols[tanggalIdx] : "",
      toko: tokoIdx >= 0 ? cols[tokoIdx] : "",
      kode,
      pesanan: pesananIdx >= 0 ? parseInt(cols[pesananIdx]) || 0 : 0,
      kiriman: kirimanIdx >= 0 ? parseInt(cols[kirimanIdx]) || 0 : 0,
    });
  }
  return rows;
}

const ImportHistori = () => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; not_found: string[] } | null>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      if (parsed.length === 0) {
        toast.error("Tidak ada data valid ditemukan. Pastikan header CSV benar.");
      } else {
        toast.success(`${parsed.length} baris data ditemukan`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-sales-history`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ rows, clear_before_import: clearBeforeImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import gagal");
      setResult(data);
      toast.success(`${data.inserted} transaksi berhasil diimport!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*]:[animation-fill-mode:both]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Import & Export</h1>
          <p className="text-muted-foreground text-sm">Kelola data penjualan masuk & keluar</p>
        </div>
      </div>

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 rounded-xl h-11">
          <TabsTrigger value="import" className="rounded-lg font-semibold">
            <Upload className="h-4 w-4 mr-1.5" /> Import
          </TabsTrigger>
          <TabsTrigger value="export" className="rounded-lg font-semibold">
            <Download className="h-4 w-4 mr-1.5" /> Export
          </TabsTrigger>
        </TabsList>

        {/* ── Import Tab ── */}
        <TabsContent value="import" className="space-y-4">
          <Card className="boss-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Format CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                File CSV harus memiliki header dengan kolom berikut:
              </p>
              <div className="bg-muted/40 rounded-xl p-3.5 font-mono text-xs">
                TANGGAL, TOKO, KODE, PESANAN, KIRIMAN<br />
                21/02/2026, BU DIAN, 855, 10, 10<br />
                21/02/2026, BU DIAN, A71, 5, 5
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                • Separator: koma, tab, atau titik koma<br />
                • Format tanggal: DD/MM/YYYY atau YYYY-MM-DD<br />
                • Harga otomatis pakai harga normal produk
              </p>
            </CardContent>
          </Card>

          <Card className="boss-card">
            <CardContent className="pt-6 space-y-4">
              <Input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFile}
                className="rounded-lg max-w-xs"
              />

              {rows.length > 0 && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="rounded-full px-2.5">{fileName}</Badge>
                    <span className="text-muted-foreground">{rows.length} baris data</span>
                  </div>

                  <div className="border border-border/60 rounded-xl overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="p-2.5 text-left font-semibold">Tanggal</th>
                          <th className="p-2.5 text-left font-semibold">Toko</th>
                          <th className="p-2.5 text-left font-semibold">Kode</th>
                          <th className="p-2.5 text-right font-semibold">Pesanan</th>
                          <th className="p-2.5 text-right font-semibold">Kiriman</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="p-2.5">{r.tanggal}</td>
                            <td className="p-2.5">{r.toko}</td>
                            <td className="p-2.5 font-mono font-bold">{r.kode}</td>
                            <td className="p-2.5 text-right tabular-nums">{r.pesanan}</td>
                            <td className="p-2.5 text-right tabular-nums">{r.kiriman}</td>
                          </tr>
                        ))}
                        {rows.length > 50 && (
                          <tr>
                            <td colSpan={5} className="p-2.5 text-center text-muted-foreground">
                              ...dan {rows.length - 50} baris lainnya
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                    <Checkbox
                      id="clearBefore"
                      checked={clearBeforeImport}
                      onCheckedChange={(v) => setClearBeforeImport(v === true)}
                    />
                    <Label htmlFor="clearBefore" className="text-sm cursor-pointer">
                      <span className="font-semibold text-destructive">Hapus semua data penjualan lama</span>
                      <span className="text-muted-foreground"> sebelum import (untuk menghindari duplikat)</span>
                    </Label>
                  </div>

                  <Button onClick={handleImport} disabled={importing} className="w-full rounded-xl h-12 text-base font-bold press-scale shadow-md hover:shadow-lg">
                    <Upload className="h-5 w-5 mr-2" />
                    {importing ? "Mengimport..." : `Import ${rows.length} Transaksi`}
                  </Button>
                </>
              )}

              {result && (
                <div className="space-y-2 rounded-xl bg-muted/40 p-3.5">
                  <div className="flex items-center gap-2 text-success text-sm font-semibold">
                    <CheckCircle className="h-4 w-4" />
                    {result.inserted} transaksi berhasil diimport
                  </div>
                  {result.skipped > 0 && (
                    <div className="flex items-center gap-2 text-warning text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      {result.skipped} baris dilewati
                    </div>
                  )}
                  {result.not_found.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Kode tidak ditemukan: {result.not_found.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Export Tab ── */}
        <TabsContent value="export" className="space-y-4">
          <ExportSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── Export Section ─────────────────────────────────────────────────
function ExportSection() {
  const { data: products } = useProducts();
  const [period, setPeriod] = useState("7");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const headers = await getAuthHeaders();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));
      daysAgo.setHours(0, 0, 0, 0);

      // Fetch all sales data
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stock_out?select=*&created_at=gte.${daysAgo.toISOString()}&order=created_at.desc`,
        { headers: { ...headers, "Prefer": "return=representation" } }
      );
      if (!res.ok) throw new Error("Gagal mengambil data penjualan");
      const sales: any[] = await res.json();

      if (sales.length === 0) {
        toast.error("Tidak ada data penjualan dalam periode ini");
        return;
      }

      // Map product_id to kode & nama
      const productMap = new Map(products?.map(p => [p.id, p]) ?? []);

      const excelRows = sales.map(s => {
        const product = productMap.get(s.product_id);
        const tanggal = new Date(s.created_at);
        return {
          "Tanggal": tanggal.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
          "Jam": tanggal.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          "Toko": s.toko || "-",
          "Kode": product?.kode ?? "-",
          "Nama Produk": product?.nama ?? "-",
          "Pesanan": s.qty_pesan,
          "Terkirim": s.qty_kirim,
          "Harga Tipe": s.harga_type,
          "Harga Satuan": s.harga_satuan,
          "Total": s.total_harga,
          "Catatan": s.catatan || "",
        };
      });

      // Create Excel workbook
      const ws = XLSX.utils.json_to_sheet(excelRows);

      // Auto-size columns
      const colWidths = Object.keys(excelRows[0]).map(key => ({
        wch: Math.max(key.length, ...excelRows.map(r => String((r as any)[key]).length)) + 2
      }));
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Penjualan");

      const periodLabel = period === "7" ? "7hari" : period === "30" ? "30hari" : period === "90" ? "3bulan" : "semua";
      const fileName = `Penjualan_RRCollections_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`${sales.length} transaksi berhasil diexport!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="boss-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" /> Export Data Penjualan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download data penjualan dalam format Excel (.xlsx) dengan kolom lengkap.
        </p>

        <div className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> Periode
          </Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="rounded-xl max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 hari terakhir</SelectItem>
              <SelectItem value="30">30 hari terakhir</SelectItem>
              <SelectItem value="90">3 bulan terakhir</SelectItem>
              <SelectItem value="365">1 tahun terakhir</SelectItem>
              <SelectItem value="9999">Semua data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleExport}
          disabled={exporting}
          className="w-full rounded-xl h-12 text-base font-bold press-scale shadow-md hover:shadow-lg"
        >
          {exporting ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Download className="h-5 w-5 mr-2" />
          )}
          {exporting ? "Mengexport..." : "Download Excel"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ImportHistori;
