import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_IMAGE_BASE64_CHARS = 8_000_000;
const ALLOWED_MODES = new Set(["masuk", "keluar", "opname", "review"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image_base64, mode, master_codes } = await req.json();
    if (!image_base64) throw new Error("image_base64 is required");
    if (typeof image_base64 !== "string") throw new Error("image_base64 must be a string");
    if (image_base64.length > MAX_IMAGE_BASE64_CHARS) {
      return new Response(
        JSON.stringify({ error: "Ukuran gambar terlalu besar. Kompres atau crop lalu coba lagi." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (mode && !ALLOWED_MODES.has(mode)) {
      return new Response(
        JSON.stringify({ error: "Mode OCR tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build master codes hint for AI - only send BASE codes (without category suffix)
    let codesHint = "";
    if (master_codes && master_codes.length > 0) {
      // Extract unique base codes (strip category suffixes like " 2 Ons", " 5 Ons", " 18 Gram", " 3 Ons")
      const baseCodes = [...new Set(master_codes.map((c: string) =>
        c.replace(/\s+(2 Ons|3 Ons|5 Ons|18 Gram)$/i, "")
      ))];
      codesHint = `\nDaftar KODE DASAR produk di master: ${baseCodes.join(", ")}.\nCocokkan kode di nota ke kode dasar master terdekat. Misalnya jika nota tulis "HITAM" atau "BLCK" tapi master punya "BLK", gunakan "BLK". Jika nota tulis "0533" tapi master punya "533", gunakan "533". Abaikan leading zero. JANGAN tambahkan suffix ukuran ke kode — cukup kode dasar saja. Kategori/ukuran HARUS ditentukan terpisah dari HEADER BAGIAN di nota.`;
    }

    const prompts: Record<string, string> = {
      masuk: `Baca foto formulir order/nota pembelian benang obras.
Format tabel biasanya: NO | KETERANGAN (kode) | ISI | BAL | JUMLAH.
Ekstrak HANYA baris yang ada isinya (JUMLAH > 0 atau ada kode di KETERANGAN).
Untuk setiap item: kode = KETERANGAN (kode dasar TANPA ukuran), qty = JUMLAH.

SANGAT PENTING - DETEKSI KATEGORI/UKURAN DARI HEADER:
Faktur benang SELALU memiliki HEADER PEMISAH yang membagi item berdasarkan ukuran:
  - "B.OBRAS 18 GR" / "B.OBRAS 18 GRAM" / "18 GR" / "18 GRAM" → kategori = "18 Gram"
  - "B.OBRAS 2 ONS" / "B.OBRAS 2 OZ" / "2 ONS" → kategori = "2 Ons"
  - "B.OBRAS 3 ONS" / "3 ONS" → kategori = "3 Ons"
  - "B.OBRAS 5 ONS" / "5 ONS" → kategori = "5 Ons"

ATURAN KATEGORI:
1. Kode produk yang SAMA (contoh: BLCK, WHT, 53) BISA muncul di BEBERAPA bagian ukuran berbeda.
2. Setiap item WAJIB mendapat kategori dari header bagian di atasnya.
3. JANGAN default ke "2 Ons" — baca header bagian dengan teliti.
4. Jika TIDAK ADA header ukuran yang terdeteksi, set kategori = null.
5. Kode yang sama di bagian berbeda = item TERPISAH dengan kategori masing-masing.

ATURAN KODE:
- Kolom KETERANGAN berisi kode produk. Jika ada tambahan teks seperti "G-29", "G-19", ABAIKAN. Contoh: "110 G-29" → kode = "110".
- Abaikan baris header/judul ("B.OBRAS", "REKAPAN", "TOTAL" dsb) — jangan masukkan sebagai item.
- Strip leading zero dari kode: "004" → "4", "035" → "35", "053" → "53".
- JANGAN masukkan suffix ukuran ke kode. Kode = kode dasar saja. Contoh benar: "BLCK", bukan "BLCK 5 Ons".

ATURAN QTY:
- GUNAKAN KOLOM JUMLAH: Selalu ambil qty dari kolom JUMLAH (kolom terakhir). Kolom ISI dan BAL hanya info tambahan. JANGAN hitung sendiri dari BAL × ISI.
- KONVERSI BAL khusus: HANYA jika kolom JUMLAH tidak ada/kosong/0 DAN ada kolom BAL, maka untuk HITAM (BLK/BLACK/HTM) dan PUTIH (WHT/WHITE/PTH) hitung 1 bal = 50.${codesHint}

Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"53","qty":5,"kategori":"18 Gram"},{"kode":"BLCK","qty":100,"kategori":"2 Ons"},{"kode":"BLCK","qty":32,"kategori":"5 Ons"}]
Jika tidak bisa membaca, kembalikan [].`,

      keluar: `Baca foto nota penjualan benang obras/kain/tekstil.
DETEKSI KATEGORI/UKURAN DARI HEADER BAGIAN (sama seperti nota pembelian):
  - "B.OBRAS 18 GR" / "18 GR" / "18 GRAM" → kategori = "18 Gram"
  - "B.OBRAS 2 ONS" / "2 ONS" → kategori = "2 Ons"
  - "B.OBRAS 3 ONS" / "3 ONS" → kategori = "3 Ons"
  - "B.OBRAS 5 ONS" / "5 ONS" → kategori = "5 Ons"
Jika tidak ada header ukuran, set kategori = null.
Ekstrak setiap item: kode (kode dasar TANPA ukuran), qty_pesan, qty_kirim, harga_type ("normal"/"grosir"), toko, kategori.${codesHint}
Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"R533","qty_pesan":10,"qty_kirim":10,"harga_type":"normal","toko":"Toko ABC","kategori":"2 Ons"}]
Jika tidak bisa membaca, kembalikan [].`,

      opname: `Baca foto catatan stok opname kain/tekstil.
Catatan biasanya ditulis per tumpukan: KODE JUMLAH, satu baris per tumpukan.
Jika produk yang sama ditulis di beberapa baris, itu berarti tumpukan terpisah (JANGAN dijumlahkan).
Ekstrak SETIAP baris sebagai satu entry: kode dan qty (jumlah per tumpukan).${codesHint}
Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"R533","qty":10},{"kode":"R533","qty":15},{"kode":"2115","qty":10}]
Artinya R533 punya 2 tumpukan: 10 dan 15.
Jika tidak bisa membaca, kembalikan [].`,

      review: `Baca foto catatan/daftar pesanan restock kain/tekstil.
Bisa berupa daftar tulisan tangan, WhatsApp screenshot, atau nota.
Ekstrak setiap item: kode produk dan jumlah/qty yang mau dipesan.
KONVERSI BAL: Untuk produk HITAM (kode mengandung "HITAM", "HTM", "BLK", "BLACK") dan PUTIH (kode mengandung "PUTIH", "PTH", "WHT", "WHITE"), 1 bal = 50. Jadi jika tertulis "2 bal" untuk hitam/putih, qty = 100. Untuk produk lain, gunakan angka langsung.${codesHint}
Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"R533","qty":50},{"kode":"BLK","qty":100}]
Jika tidak bisa membaca, kembalikan [].`,
    };

    const systemPrompt = prompts[mode] || prompts.masuk;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Baca nota ini." },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${image_base64}` },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Terlalu banyak permintaan, coba lagi nanti." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Kredit AI habis, silakan top up." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Gagal memproses gambar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    let items = [];
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      items = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse OCR response:", content);
      items = [];
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ocr-nota error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
