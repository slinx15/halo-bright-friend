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
  kategori?: string | null;
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
  kode: string;
  kategori: string | null;
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

function normalizeKode(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function normalizeKategori(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function buildLookupKey(kode: string, kategori?: string | null) {
  return `${normalizeKode(kode)}::${normalizeKategori(kategori)}`;
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

const CATEGORY_SUFFIX_RE = /\s+(2\s*ONS|3\s*ONS|5\s*ONS|18\s*GRAM)$/i;
const CATEGORY_LABELS: Record<string, string> = {
  "2 ONS": "2 Ons",
  "3 ONS": "3 Ons",
  "5 ONS": "5 Ons",
  "18 GRAM": "18 Gram",
};

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

    const { data: roleData, error: roleError } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      return jsonResponse({ error: getErrorMessage(roleError, "Failed to validate role") }, 500);
    }

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

    const productByLookup = new Map<string, ProductLookup>();
    const productsByKode = new Map<string, ProductLookup[]>();
    const aliasLookup = new Map<string, ProductLookup>();
    const typedProducts = products as ProductRecord[];
    const typedAliases = (aliases ?? []) as ProductAliasRecord[];

    for (const product of typedProducts) {
      const lookup: ProductLookup = {
        id: product.id,
        kode: product.kode,
        kategori: product.kategori,
        harga_normal: getHargaNormal(product.prices),
      };

      productByLookup.set(buildLookupKey(product.kode, product.kategori), lookup);

      const baseKey = normalizeKode(product.kode);
      const variants = productsByKode.get(baseKey) || [];
      variants.push(lookup);
      productsByKode.set(baseKey, variants);
    }

    for (const alias of typedAliases) {
      const matchedProduct = typedProducts.find((product) => product.id === alias.product_id);
      if (!matchedProduct) continue;

      const lookup: ProductLookup = {
        id: matchedProduct.id,
        kode: matchedProduct.kode,
        kategori: matchedProduct.kategori,
        harga_normal: getHargaNormal(matchedProduct.prices),
      };

      aliasLookup.set(normalizeKode(alias.alias), lookup);
      productByLookup.set(buildLookupKey(alias.alias, matchedProduct.kategori), lookup);

      const aliasKey = normalizeKode(alias.alias);
      const variants = productsByKode.get(aliasKey) || [];
      variants.push(lookup);
      productsByKode.set(aliasKey, variants);
    }

    function resolveProduct(rawKode: string, rawKategori?: string | null): { product?: ProductLookup; reason?: string } {
      const upper = normalizeKode(rawKode);
      const kategori = normalizeKategori(rawKategori);
      if (!upper) return { reason: "kode kosong" };

      const exactAlias = kategori ? productByLookup.get(buildLookupKey(upper, kategori)) : null;
      if (exactAlias) return { product: exactAlias };

      const aliased = aliasLookup.get(upper);
      if (aliased && (!kategori || normalizeKategori(aliased.kategori) === kategori)) {
        return { product: aliased };
      }

      const suffixMatch = upper.match(CATEGORY_SUFFIX_RE);
      const explicitCategory = kategori || (
        suffixMatch
          ? CATEGORY_LABELS[suffixMatch[1].replace(/\s+/g, " ").toUpperCase()]
          : null
      );
      const baseKode = suffixMatch ? upper.replace(CATEGORY_SUFFIX_RE, "").trim() : upper;

      const exactMatch = explicitCategory ? productByLookup.get(buildLookupKey(baseKode, explicitCategory)) : null;
      if (exactMatch) return { product: exactMatch };

      const candidates = productsByKode.get(baseKode) ?? productsByKode.get(upper) ?? [];
      const uniqueCandidates = candidates.filter(
        (candidate, index, arr) => arr.findIndex((item) => item.id === candidate.id) === index,
      );

      if (uniqueCandidates.length === 0) {
        return { reason: "kode tidak ditemukan" };
      }

      if (explicitCategory) {
        const match = uniqueCandidates.find(
          (candidate) => normalizeKategori(candidate.kategori) === normalizeKategori(explicitCategory),
        );
        if (!match) {
          return { reason: `kategori ${explicitCategory} tidak ada untuk kode ${baseKode}` };
        }
        return { product: match };
      }

      if (uniqueCandidates.length === 1) {
        return { product: uniqueCandidates[0] };
      }

      return {
        reason: `kode ambigu (${uniqueCandidates.length} kategori) — tambahkan kategori/ukuran yang lebih spesifik.`,
      };
    }

    const notFound: string[] = [];
    const failed: ImportFailure[] = [];
    const preparedRows: PreparedImportRow[] = [];

    for (const row of rows) {
      const kode = normalizeKode(row.kode);
      const resolved = resolveProduct(kode, row.kategori);

      if (!resolved.product) {
        if (resolved.reason?.includes("ambigu") || resolved.reason?.includes("kategori")) {
          failed.push({
            kode,
            tanggal: row.tanggal,
            error: resolved.reason,
          });
          continue;
        }

        if (kode && !notFound.includes(kode)) {
          notFound.push(kode);
        }
        continue;
      }

      try {
        const createdAt = parseDate(row.tanggal).toISOString();
        preparedRows.push({
          createdAt,
          kode,
          qtyPesan: row.pesanan || 0,
          qtyKirim: row.kiriman || 0,
          toko: (row.toko || "").trim(),
          product: resolved.product,
        });
      } catch (error) {
        failed.push({
          kode,
          tanggal: row.tanggal,
          error: getErrorMessage(error, "Tanggal tidak valid"),
        });
      }
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
  if (!str?.trim()) throw new Error("Tanggal wajib diisi");
  const s = str.trim();

  const dmyTime = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyTime) {
    const year = dmyTime[3].length === 2 ? 2000 + parseInt(dmyTime[3], 10) : parseInt(dmyTime[3], 10);
    const parsed = new Date(
      year,
      parseInt(dmyTime[2], 10) - 1,
      parseInt(dmyTime[1], 10),
      parseInt(dmyTime[4], 10),
      parseInt(dmyTime[5], 10),
      parseInt(dmyTime[6] || "0", 10),
    );
    if (Number.isNaN(parsed.getTime())) throw new Error(`Format tanggal tidak valid: ${str}`);
    return parsed;
  }

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const parsed = new Date(year, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10), 12, 0, 0);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Format tanggal tidak valid: ${str}`);
    return parsed;
  }

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const parsed = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Format tanggal tidak valid: ${str}`);
    return parsed;
  }

  throw new Error(`Format tanggal tidak dikenali: ${str}`);
}
