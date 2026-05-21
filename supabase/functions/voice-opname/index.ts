// Voice Opname: terima audio (base64) dari client, transcribe + parse pakai Lovable AI
// Return list { kode, qty } untuk dikonfirmasi user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParsedItem {
  kode: string;
  qty: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY tidak terkonfigurasi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    const body = await req.json();
    const { audio_base64, mime_type, master_codes } = body as {
      audio_base64?: string;
      mime_type?: string;
      master_codes?: string[];
    };

    if (!audio_base64 || typeof audio_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "audio_base64 wajib diisi" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audioMime = mime_type || "audio/webm";
    const codesHint = Array.isArray(master_codes) && master_codes.length > 0
      ? `\n\nDaftar kode produk yang valid (gunakan ini untuk koreksi typo / kode terdekat):\n${master_codes.slice(0, 800).join(", ")}`
      : "";

    const systemPrompt = `Kamu adalah asisten yang mendengarkan rekaman suara opname stok dalam bahasa Indonesia.

Tugas kamu:
1. Transcribe audio ke teks.
2. Ekstrak SEMUA pasangan {kode produk, jumlah} yang disebut user.
3. User bisa menyebut SATU atau BANYAK produk sekaligus (dipisahkan jeda, koma, atau kata "lalu/terus/dan").
4. Angka bisa berupa kata ("lima", "sepuluh", "dua puluh lima") atau angka langsung — konversi ke integer.
5. Kode produk biasanya kombinasi huruf+angka (contoh: A123, R533, 2115, BLCK, 055). Bisa dieja per huruf atau diucapkan utuh.
6. Jika user menyebut kode yang mirip dengan kode di daftar valid, koreksi ke kode terdekat di daftar.
7. Abaikan kata-kata pengisi seperti "eh", "anu", "stoknya", "ada", "sisa", dll.
8. Jika user salah sebut lalu mengoreksi (misal "tujuh, eh delapan"), pakai angka koreksi.

Return SELALU dalam format tool call extract_opname_items.${codesHint}`;

    const aiBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Tolong transcribe & ekstrak data opname dari rekaman suara berikut." },
            {
              type: "input_audio",
              input_audio: {
                data: audio_base64,
                format: audioMime.includes("webm") ? "webm" : audioMime.includes("mp4") ? "mp4" : audioMime.includes("ogg") ? "ogg" : "wav",
              },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_opname_items",
            description: "Ekstrak daftar item opname dari ucapan user",
            parameters: {
              type: "object",
              properties: {
                transcript: {
                  type: "string",
                  description: "Hasil transcribe lengkap dari audio",
                },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      kode: { type: "string", description: "Kode produk (huruf besar)" },
                      qty: { type: "number", description: "Jumlah / quantity (integer >= 0)" },
                    },
                    required: ["kode", "qty"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["transcript", "items"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_opname_items" } },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Terlalu banyak request, coba lagi sebentar." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Kredit AI habis. Top up di Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "AI gateway error", detail: txt }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call returned", JSON.stringify(aiData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "AI tidak menghasilkan output yang valid", items: [], transcript: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsedArgs: { transcript?: string; items?: ParsedItem[] } = {};
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
    } catch (e) {
      console.error("Failed to parse tool args", e);
    }

    const items: ParsedItem[] = (parsedArgs.items || [])
      .map((it) => ({
        kode: String(it.kode || "").toUpperCase().trim(),
        qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
      }))
      .filter((it) => it.kode.length > 0);

    return new Response(
      JSON.stringify({
        transcript: parsedArgs.transcript || "",
        items,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("voice-opname error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
