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
  name: "list_products",
  title: "List products",
  description: "List products in the RRCollections catalog, optionally filtered by category or code/name search.",
  inputSchema: {
    search: z.string().optional().describe("Filter by code (kode) or name (nama), case-insensitive."),
    kategori: z.string().optional().describe("Category filter, e.g. '2 Ons', '3 Ons', '5 Ons', '18g'."),
    only_active: z.boolean().optional().describe("Only return active products (default true)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, kategori, only_active = true, limit = 50 }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx).from("products").select("id,kode,nama,kategori,is_active").limit(limit);
    if (only_active) q = q.eq("is_active", true);
    if (kategori) q = q.eq("kategori", kategori);
    if (search) q = q.or(`kode.ilike.%${search}%,nama.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
