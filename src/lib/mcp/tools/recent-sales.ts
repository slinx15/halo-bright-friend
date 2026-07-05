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
  name: "recent_sales",
  title: "Recent sales",
  description: "List the most recent sales (barang keluar) transactions with product info.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 20)."),
    toko: z.string().optional().describe("Filter by toko (store) name."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit = 20, toko }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx)
      .from("stock_out")
      .select("id,created_at,toko,qty_pesan,qty_kirim,harga_type,harga_satuan,total_harga,catatan,product_id,products(kode,nama,kategori)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (toko) q = q.ilike("toko", `%${toko}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { sales: data ?? [] },
    };
  },
});
