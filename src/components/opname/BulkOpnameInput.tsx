import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TumpukanBadges } from "@/components/TumpukanBadges";
import { Send, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseOpnameText, type ParsedOpnameItem } from "@/lib/opnameParser";
import { formatNumber } from "@/lib/formatters";
import type { ProductWithDetails } from "@/hooks/useProducts";
import { OcrUpload } from "@/components/OcrUpload";

interface BulkOpnameInputProps {
  products: ProductWithDetails[];
  onSubmit: (items: ParsedOpnameItem[]) => Promise<void>;
  submitting: boolean;
}

export function BulkOpnameInput({ products, onSubmit, submitting }: BulkOpnameInputProps) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedOpnameItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Convert OCR results to textarea text format
  const handleOcrResult = (ocrItems: any[]) => {
    const lines = ocrItems.map((item) => {
      const kode = String(item.kode || "").toUpperCase();
      const qty = item.qty || item.stok_fisik || 0;
      return `${kode} ${qty}`;
    });
    const newText = text ? text.trimEnd() + "\n" + lines.join("\n") : lines.join("\n");
    setText(newText);
  };

  const handleParse = () => {
    const items = parseOpnameText(text);
    setParsed(items);
    setShowPreview(true);
  };

  const findProduct = (kode: string) =>
    products.find((p) => p.kode.toUpperCase() === kode.toUpperCase());

  const handleSubmit = async () => {
    await onSubmit(parsed);
    setText("");
    setParsed([]);
    setShowPreview(false);
  };

  const validItems = parsed.filter((item) => findProduct(item.kode));
  const invalidItems = parsed.filter((item) => !findProduct(item.kode));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Input Cepat Stock Opname
          </CardTitle>
          <OcrUpload mode="opname" onResult={handleOcrResult} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showPreview ? (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ketik satu baris per tumpukan: <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">KODE JUMLAH</code>
              </p>
              <p className="text-xs text-muted-foreground">
                Produk yang sama di baris berbeda otomatis digabung jadi tumpukan terpisah.
              </p>
              <Textarea
                placeholder={`Contoh:\nR533 10\nR533 15\n2115 10\n055 5`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="font-mono text-base md:text-sm"
              />
            </div>
            <Button
              onClick={handleParse}
              disabled={!text.trim()}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" /> Preview Hasil
            </Button>
          </>
        ) : (
          <>
            {invalidItems.length > 0 && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <AlertTriangle className="h-4 w-4" /> Kode tidak ditemukan:
                </div>
                {invalidItems.map((item) => (
                  <span key={item.kode} className="font-mono mr-2">{item.kode}</span>
                ))}
              </div>
            )}

            {validItems.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Tumpukan Fisik</TableHead>
                      <TableHead className="text-right">Total Fisik</TableHead>
                      <TableHead className="text-right">Stok Sistem</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validItems.map((item) => {
                      const product = findProduct(item.kode)!;
                      const stokSistem = product.stock?.jumlah ?? 0;
                      const selisih = item.total - stokSistem;
                      return (
                        <TableRow key={item.kode}>
                          <TableCell className="font-mono text-sm font-medium">{item.kode}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{product.nama}</TableCell>
                          <TableCell>
                            <TumpukanBadges stacks={item.stacks} kode={item.kode} compact />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(item.total)}</TableCell>
                          <TableCell className="text-right">{formatNumber(stokSistem)}</TableCell>
                          <TableCell className={`text-right font-semibold ${
                            selisih === 0 ? "text-success" : "text-destructive"
                          }`}>
                            {selisih > 0 ? "+" : ""}{selisih}
                            {selisih === 0 && " ✓"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {validItems.length} produk valid
                {invalidItems.length > 0 && `, ${invalidItems.length} tidak ditemukan`}
              </span>
              <Badge variant="secondary" className="bg-success/10 text-success">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validItems.filter((i) => i.total === (findProduct(i.kode)?.stock?.jumlah ?? 0)).length} sesuai
              </Badge>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-xl"
              >
                Edit Ulang
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || validItems.length === 0}
                className="flex-1 rounded-xl"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitting ? "Menyimpan..." : `Simpan ${validItems.length} Opname`}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
