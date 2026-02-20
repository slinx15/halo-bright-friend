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

    const { image_base64, mode } = await req.json();
    if (!image_base64) throw new Error("image_base64 is required");

    // Mode: "masuk" | "keluar" | "opname"
    const prompts: Record<string, string> = {
      masuk: `Kamu adalah OCR untuk nota pembelian barang kain/tekstil.
Dari foto nota ini, ekstrak setiap item pembelian. Untuk setiap item, dapatkan:
- kode: kode produk (biasanya huruf-angka seperti KTN-001, SFN-002, dll)
- nama: nama produk jika terlihat
- qty: jumlah yang dibeli
- harga_modal: harga per satuan (harga beli/modal)
- catatan: info tambahan jika ada

Kembalikan HANYA JSON array, tanpa markdown, tanpa penjelasan. Contoh:
[{"kode":"KTN-001","nama":"Katun Jepang","qty":50,"harga_modal":18000,"catatan":""}]

Jika tidak bisa membaca, kembalikan array kosong [].`,

      keluar: `Kamu adalah OCR untuk nota penjualan barang kain/tekstil.
Dari foto nota ini, ekstrak setiap item penjualan. Untuk setiap item, dapatkan:
- kode: kode produk
- nama: nama produk jika terlihat
- qty_pesan: jumlah yang dipesan
- qty_kirim: jumlah yang dikirim (sama dengan qty_pesan jika tidak ada info)
- harga_type: "normal" atau "grosir"
- toko: nama toko/pelanggan jika terlihat di nota

Kembalikan HANYA JSON array, tanpa markdown, tanpa penjelasan. Contoh:
[{"kode":"KTN-001","nama":"Katun Jepang","qty_pesan":10,"qty_kirim":10,"harga_type":"normal","toko":"Toko ABC"}]

Jika tidak bisa membaca, kembalikan array kosong [].`,

      opname: `Kamu adalah OCR untuk data stok opname barang kain/tekstil.
Dari foto ini, ekstrak setiap item stok fisik. Untuk setiap item, dapatkan:
- kode: kode produk
- nama: nama produk jika terlihat
- stok_fisik: jumlah stok fisik yang terlihat/tercatat
- catatan: info tambahan jika ada

Kembalikan HANYA JSON array, tanpa markdown, tanpa penjelasan. Contoh:
[{"kode":"KTN-001","nama":"Katun Jepang","stok_fisik":45,"catatan":""}]

Jika tidak bisa membaca, kembalikan array kosong [].`,
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
                { type: "text", text: "Baca nota/foto ini dan ekstrak datanya." },
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

    // Try to parse JSON from the response
    let items = [];
    try {
      // Remove markdown code blocks if present
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
