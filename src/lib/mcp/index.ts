import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProducts from "./tools/list-products";
import getStock from "./tools/get-stock";
import recentSales from "./tools/recent-sales";
import salesSummary from "./tools/sales-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "rrcollections-mcp",
  title: "RRCollections Stok",
  version: "0.1.0",
  instructions:
    "Read-only tools over the RRCollections stock manager. Use list_products to browse the catalog, get_stock for current quantities per product code, recent_sales for the latest barang keluar, and sales_summary for omzet and top movers.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProducts, getStock, recentSales, salesSummary],
});
