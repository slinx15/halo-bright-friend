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
  name: "sales_summary",
  title: "Sales summary",
  description: "Summarize sales (barang keluar) over the last N days: total omzet, transactions, and top products.",
  inputSchema: {
    days: z.number().int().min(1).max(365).optional().describe("Lookback window in days (default 30)."),
    top: z.number().int().min(1).max(50).optional().describe("Number of top products to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days = 30, top = 10 }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb(ctx)
      .from("stock_out")
      .select("qty_kirim,total_harga,product_id,products(kode,nama,kategori)")
      .gte("created_at", since)
      .limit(10000);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    const omzet = rows.reduce((s, r: any) => s + (r.total_harga ?? 0), 0);
    const qty = rows.reduce((s, r: any) => s + (r.qty_kirim ?? 0), 0);
    const byProduct = new Map<string, { kode: string; nama: string; kategori: string; qty: number; omzet: number }>();
    for (const r of rows as any[]) {
      const p = r.products;
      if (!p) continue;
      const key = `${p.kategori}::${p.kode}`;
      const cur = byProduct.get(key) ?? { kode: p.kode, nama: p.nama, kategori: p.kategori, qty: 0, omzet: 0 };
      cur.qty += r.qty_kirim ?? 0;
      cur.omzet += r.total_harga ?? 0;
      byProduct.set(key, cur);
    }
    const top_products = [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, top);

    const summary = {
      window_days: days,
      since,
      transactions: rows.length,
      total_qty: qty,
      total_omzet: omzet,
      top_products,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
