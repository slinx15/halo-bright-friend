import { createClient, type PostgrestError, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ParsedRow = {
  tanggal: string;
  toko: string;
  kode: string;
  pesanan: number;
  kiriman: number;
};

type ProductPrice = {
  harga_normal: number | null;
  harga_grosir: number | null;
  harga_modal: number | null;
};

type ProductRecord = {
  id: string;
  kode: string;
  kategori: string | null;
  prices: ProductPrice | ProductPrice[] | null;
};

type ProductAliasRecord = {
  alias: string;
  product_id: string;
};

type ProductLookup = {
  id: string;
  harga_normal: number;
};

type PreparedImportRow = {
  createdAt: string;
  kode: string;
  qtyPesan: number;
  qtyKirim: number;
  toko: string;
  product: ProductLookup;
};

type ImportFailure = {
  kode: string;
  tanggal: string;
  error: string;
};

type DeleteTransactionRow = {
  id: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getHargaNormal(prices: ProductPrice | ProductPrice[] | null) {
  const price = Array.isArray(prices) ? prices[0] : prices;
  return price?.harga_normal ?? 0;
}

function getErrorMessage(error: PostgrestError | Error | string | unknown, fallback = "Terjadi kesalahan") {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;

  if (error && typeof error === "object") {
    const candidate = error as { message?: string; details?: string; hint?: string };
    if (candidate.message?.trim()) return candidate.message;
    if (candidate.details?.trim()) return candidate.details;
    if (candidate.hint?.trim()) return candidate.hint;
  }

  return fallback;
}

async function fetchAllStockOutIds(supabase: SupabaseClient) {
  const pageSize = 1000;
  const rows: DeleteTransactionRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("stock_out")
      .select("id")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...(data as DeleteTransactionRow[]));

    if (data.length < pageSize) {
      break;
    }
  }

  return rows.map((row) => row.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Admin-only: import histori penjualan mengubah stok secara massal
    const { data: roleData } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const { rows, clear_before_import } = (await req.json()) as {
      rows: ParsedRow[];
      clear_before_import?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ error: "No data rows" }, 400);
    }

    const { data: products, error: productsError } = await adminSupabase
      .from("products")
      .select("id, kode, kategori, prices(harga_normal, harga_grosir, harga_modal)")
      .eq("is_active", true);

    if (productsError || !products) {
      return jsonResponse({ error: getErrorMessage(productsError, "Failed to fetch products") }, 500);
    }

    const { data: aliases, error: aliasesError } = await adminSupabase
      .from("product_aliases")
      .select("alias, product_id");

    if (aliasesError) {
      return jsonResponse({ error: getErrorMessage(aliasesError, "Failed to fetch product aliases") }, 500);
    }

    const productByKode = new Map<string, ProductLookup>();
    const typedProducts = products as ProductRecord[];
    const typedAliases = (aliases ?? []) as ProductAliasRecord[];

    for (const product of typedProducts) {
      const hargaNormal = getHargaNormal(product.prices);
      const key = product.kode.toUpperCase();
      const existing = productByKode.get(key);

      if (!existing || product.kategori === "2 Ons") {
        productByKode.set(key, { id: product.id, harga_normal: hargaNormal });
      }
    }

    for (const alias of typedAliases) {
      const matchedProduct = typedProducts.find((product) => product.id === alias.product_id);
      if (!matchedProduct) continue;

      productByKode.set(alias.alias.toUpperCase(), {
        id: matchedProduct.id,
        harga_normal: getHargaNormal(matchedProduct.prices),
      });
    }

    const notFound: string[] = [];
    const preparedRows: PreparedImportRow[] = [];

    for (const row of rows) {
      const kode = (row.kode || "").trim().toUpperCase();
      const product = productByKode.get(kode);

      if (!product) {
        if (kode && !notFound.includes(kode)) {
          notFound.push(kode);
        }
        continue;
      }

      let createdAt: string;
      try {
        createdAt = parseDate(row.tanggal).toISOString();
      } catch {
        createdAt = new Date().toISOString();
      }

      preparedRows.push({
        createdAt,
        kode,
        qtyPesan: row.pesanan || 0,
        qtyKirim: row.kiriman || 0,
        toko: (row.toko || "").trim(),
        product,
      });
    }

    preparedRows.sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    if (clear_before_import) {
      const existingTransactionIds = await fetchAllStockOutIds(adminSupabase);

      for (const transactionId of existingTransactionIds) {
        const { error } = await userSupabase.rpc("delete_stock_out_transaction", {
          p_stock_out_id: transactionId,
        });

        if (error) {
          return jsonResponse(
            {
              error: `Gagal menghapus histori lama: ${getErrorMessage(error)}`,
              inserted: 0,
              skipped: rows.length - preparedRows.length,
              not_found: notFound,
            },
            500,
          );
        }
      }
    }

    let inserted = 0;
    const failed: ImportFailure[] = [];

    for (const row of preparedRows) {
      const { error } = await userSupabase.rpc("register_stock_out", {
        p_product_id: row.product.id,
        p_qty_pesan: row.qtyPesan,
        p_qty_kirim: row.qtyKirim,
        p_harga_type: "normal",
        p_harga_satuan: row.product.harga_normal,
        p_catatan: "Import histori penjualan",
        p_toko: row.toko,
        p_created_at: row.createdAt,
      });

      if (error) {
        failed.push({
          kode: row.kode,
          tanggal: row.createdAt,
          error: getErrorMessage(error, "Gagal mengimpor transaksi"),
        });
        continue;
      }

      inserted += 1;
    }

    return jsonResponse({
      success: failed.length === 0,
      inserted,
      skipped: rows.length - preparedRows.length,
      not_found: notFound,
      failed,
    });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});

function parseDate(str: string): Date {
  if (!str) return new Date();
  const s = str.trim();

  const dmyTime = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyTime) {
    const year = dmyTime[3].length === 2 ? 2000 + parseInt(dmyTime[3], 10) : parseInt(dmyTime[3], 10);
    return new Date(
      year,
      parseInt(dmyTime[2], 10) - 1,
      parseInt(dmyTime[1], 10),
      parseInt(dmyTime[4], 10),
      parseInt(dmyTime[5], 10),
      parseInt(dmyTime[6] || "0", 10),
    );
  }

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return new Date(year, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 12, 0, 0);
  }

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0);
  }

  return new Date();
}
