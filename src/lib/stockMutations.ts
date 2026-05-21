import { getAuthHeaders } from "@/lib/authHeaders";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface StockMutationResult {
  success: boolean;
  transaction_id?: string;
  log_id?: string;
  stock_id?: string;
  old_jumlah?: number;
  new_jumlah?: number;
  new_tumpukan_detail?: number[];
  selisih?: number;
}

interface RegisterStockInParams {
  productId: string;
  qty: number;
  tumpukanDetail: number[];
  catatan?: string;
  createdAt?: string;
}

interface RegisterStockOutParams {
  productId: string;
  qtyPesan: number;
  qtyKirim: number;
  hargaType: string;
  hargaSatuan: number;
  catatan?: string;
  toko?: string;
  createdAt?: string;
}

interface RegisterStockOpnameParams {
  productId: string;
  stokFisik: number;
  tumpukanDetail: number[];
  catatan?: string;
}

async function parseRpcError(res: Response) {
  const text = await res.text();
  if (!text) return res.statusText || "RPC request failed";

  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.details || text;
  } catch {
    return text;
  }
}

async function callStockRpc<T>(functionName: string, payload: Record<string, unknown>): Promise<T> {
  const headers = await getAuthHeaders("return=representation");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseRpcError(res));
  }

  return res.json();
}

export function registerStockIn(params: RegisterStockInParams) {
  return callStockRpc<StockMutationResult>("register_stock_in", {
    p_product_id: params.productId,
    p_qty: params.qty,
    p_tumpukan_detail: params.tumpukanDetail,
    p_catatan: params.catatan || null,
    p_created_at: params.createdAt || null,
  });
}

export function registerStockOut(params: RegisterStockOutParams) {
  return callStockRpc<StockMutationResult>("register_stock_out", {
    p_product_id: params.productId,
    p_qty_pesan: params.qtyPesan,
    p_qty_kirim: params.qtyKirim,
    p_harga_type: params.hargaType,
    p_harga_satuan: params.hargaSatuan,
    p_catatan: params.catatan || null,
    p_toko: params.toko || "",
    p_created_at: params.createdAt || null,
  });
}

export function deleteStockOutTransaction(stockOutId: string) {
  return callStockRpc<StockMutationResult>("delete_stock_out_transaction", {
    p_stock_out_id: stockOutId,
  });
}

export function registerStockOpname(params: RegisterStockOpnameParams) {
  return callStockRpc<StockMutationResult>("register_stock_opname", {
    p_product_id: params.productId,
    p_stok_fisik: params.stokFisik,
    p_tumpukan_detail: params.tumpukanDetail,
    p_catatan: params.catatan || null,
  });
}
