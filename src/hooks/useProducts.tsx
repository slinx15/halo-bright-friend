import { useQuery } from "@tanstack/react-query";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRelation, type ProductRowWithRelations } from "@/lib/supabaseRows";

export interface ProductWithDetails {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  is_active: boolean;
  stock?: { jumlah: number; tumpukan: string | null; tumpukan_detail: number[] | null };
  prices?: { harga_modal: number; harga_normal: number; harga_grosir: number; harga_grosir2: number };
}

async function getAuthToken(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}

const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

async function fetchFromSupabase<T>(path: string): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token || SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  return res.json() as Promise<T>;
}

function mapProductWithDetails(product: ProductRowWithRelations): ProductWithDetails {
  return {
    id: product.id,
    kode: product.kode,
    nama: product.nama,
    kategori: product.kategori,
    is_active: product.is_active,
    stock: normalizeRelation(product.stock),
    prices: normalizeRelation(product.prices),
  };
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const data = await fetchFromSupabase<ProductRowWithRelations[]>(
        "products?is_active=eq.true&order=kode.asc,kategori.asc&select=*,stock(*),prices(*)"
      );
      return (data ?? []).map(mapProductWithDetails);
    },
  });
}

export function useProductByKode(kode: string) {
  return useQuery({
    queryKey: ["product", kode],
    enabled: !!kode && kode.length > 0,
    queryFn: async () => {
      const data = await fetchFromSupabase<ProductRowWithRelations[]>(
        `products?kode=eq.${encodeURIComponent(kode.toUpperCase())}&is_active=eq.true&select=*,stock(*),prices(*)&limit=1`
      );
      if (!data || data.length === 0) return null;
      return mapProductWithDetails(data[0]);
    },
  });
}
