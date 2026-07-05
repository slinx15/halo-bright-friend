import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_stock",
  title: "Get current stock",
  description: "Get current stock quantity and tumpukan for a product by kode (product code) and optional kategori.",
  inputSchema: {
    kode: z.string().min(1).describe("Product code (kode)."),
    kategori: z.string().optional().describe("Category, e.g. '2 Ons'. Recommended since kode is unique per kategori."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kode, kategori }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    let pq = client.from("products").select("id,kode,nama,kategori").eq("kode", kode);
    if (kategori) pq = pq.eq("kategori", kategori);
    const { data: products, error: pe } = await pq;
    if (pe) return { content: [{ type: "text", text: pe.message }], isError: true };
    if (!products?.length) return { content: [{ type: "text", text: `No product with kode "${kode}"` }], isError: true };

    const ids = products.map((p) => p.id);
    const { data: stocks, error: se } = await client
      .from("stock")
      .select("product_id,jumlah,tumpukan,tumpukan_detail,updated_at")
      .in("product_id", ids);
    if (se) return { content: [{ type: "text", text: se.message }], isError: true };

    const rows = products.map((p) => {
      const s = stocks?.find((x) => x.product_id === p.id);
      return {
        kode: p.kode,
        nama: p.nama,
        kategori: p.kategori,
        jumlah: s?.jumlah ?? 0,
        tumpukan: s?.tumpukan ?? null,
        tumpukan_detail: s?.tumpukan_detail ?? null,
        updated_at: s?.updated_at ?? null,
      };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { stock: rows },
    };
  },
});
