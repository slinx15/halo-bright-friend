import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getAuthHeaders() {
  const storageKey = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
  let token = SUPABASE_KEY;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      token = parsed?.access_token || SUPABASE_KEY;
    }
  } catch {}
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
  };
}

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

  // Find header line
  const headerLine = lines[0].toLowerCase();
  const sep = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  // Map columns
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
        headers: getAuthHeaders(),
        body: JSON.stringify({ rows }),
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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Import Histori Penjualan</h1>
        <p className="text-muted-foreground text-sm">Upload file CSV/Excel untuk import data penjualan lama</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Format CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            File CSV harus memiliki header dengan kolom berikut:
          </p>
          <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
            TANGGAL, TOKO, KODE, PESANAN, KIRIMAN
            <br />
            21/02/2026, BU DIAN, 855, 10, 10
            <br />
            21/02/2026, BU DIAN, A71, 5, 5
          </div>
          <p className="text-xs text-muted-foreground">
            • Separator: koma (,), tab, atau titik koma (;)
            <br />
            • Format tanggal: DD/MM/YYYY atau YYYY-MM-DD
            <br />
            • Harga otomatis pakai harga normal produk
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFile}
              className="max-w-xs"
            />
          </div>

          {rows.length > 0 && (
            <>
              <div className="text-sm">
                <span className="font-medium">{fileName}</span> — {rows.length} baris data
              </div>

              {/* Preview */}
              <div className="border rounded-lg overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Tanggal</th>
                      <th className="p-2 text-left">Toko</th>
                      <th className="p-2 text-left">Kode</th>
                      <th className="p-2 text-right">Pesanan</th>
                      <th className="p-2 text-right">Kiriman</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.tanggal}</td>
                        <td className="p-2">{r.toko}</td>
                        <td className="p-2 font-mono font-medium">{r.kode}</td>
                        <td className="p-2 text-right">{r.pesanan}</td>
                        <td className="p-2 text-right">{r.kiriman}</td>
                      </tr>
                    ))}
                    {rows.length > 50 && (
                      <tr>
                        <td colSpan={5} className="p-2 text-center text-muted-foreground">
                          ...dan {rows.length - 50} baris lainnya
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Button onClick={handleImport} disabled={importing} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                {importing ? "Mengimport..." : `Import ${rows.length} Transaksi`}
              </Button>
            </>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="h-4 w-4" />
                {result.inserted} transaksi berhasil diimport
              </div>
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-warning text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {result.skipped} baris dilewati (qty 0 atau kode tidak ditemukan)
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
    </div>
  );
};

export default ImportHistori;
