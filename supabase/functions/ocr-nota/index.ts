import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { image_base64, mode, master_codes } = await req.json();
    if (!image_base64) throw new Error("image_base64 is required");

    // Build master codes hint for AI
    const codesHint = master_codes && master_codes.length > 0
      ? `\nDaftar kode produk yang ada di master: ${master_codes.join(", ")}.\nCocokkan kode di nota ke kode master terdekat. Misalnya jika nota tulis "HITAM" atau "BLCK" tapi master punya "BLK", gunakan "BLK". Jika nota tulis "0533" tapi master punya "533", gunakan "533". Abaikan leading zero. Selalu gunakan kode dari daftar master jika cocok.`
      : "";

    const prompts: Record<string, string> = {
      masuk: `Baca foto formulir order/nota pembelian kain/tekstil.
Format tabel biasanya: NO | KETERANGAN (kode) | ISI | BAL | JUMLAH.
Ekstrak HANYA baris yang ada isinya (JUMLAH > 0 atau ada kode di KETERANGAN).
Untuk setiap item: kode = KETERANGAN, qty = JUMLAH.
PENTING:
- Kolom KETERANGAN berisi kode produk. Jika ada tambahan teks seperti "G-29", "G-19", atau keterangan lain setelah kode angka, ABAIKAN teks tambahannya. Contoh: "110 G-29" → kode = "110", "2135 G-19" → kode = "2135".
- Abaikan baris header/judul seperti "B.OBRAS", "REKAPAN", "TOTAL" dsb.
- Strip leading zero dari kode: "004" → "4", "035" → "35".
- KONVERSI BAL: Untuk produk HITAM (kode mengandung "HITAM", "HTM", "BLK", "BLACK") dan PUTIH (kode mengandung "PUTIH", "PTH", "WHT", "WHITE"), 1 bal = 50. Jadi jika tertulis "2 bal" untuk hitam/putih, qty = 100. Untuk produk lain, gunakan angka JUMLAH langsung seperti biasa.${codesHint}
Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"533","qty":25},{"kode":"BLK","qty":100}]
Jika tidak bisa membaca, kembalikan [].`,

      keluar: `Baca foto nota penjualan kain/tekstil.
Ekstrak setiap item: kode, qty_pesan, qty_kirim, harga_type ("normal"/"grosir"), toko.${codesHint}
Kembalikan HANYA JSON array tanpa markdown. Contoh:
[{"kode":"R533","qty_pesan":10,"qty_kirim":10,"harga_type":"normal","toko":"Toko ABC"}]
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
Ekstrak setiap item: kode produk dan jumlah/qty yang mau dipesan.${codesHint}
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
