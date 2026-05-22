import { useQuery } from "@tanstack/react-query";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";

export interface ProductWithDetails {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  is_active: boolean;
  stock?: { jumlah: number; tumpukan: string | null; tumpukan_detail: number[] | null };
  prices?: { harga_modal: number; harga_normal: number; harga_grosir: number; harga_grosir2: number };
}

function getAuthToken(): string {
  const storageKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
  if (!storageKey) return "";
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "");
    return parsed.access_token || parsed?.currentSession?.access_token || "";
  } catch {
    return "";
  }
}

const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

async function fetchFromSupabase(path: string) {
  const token = getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token || SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  return res.json();
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const data = await fetchFromSupabase(
        "products?is_active=eq.true&order=kode.asc,kategori.asc&select=*,stock(*),prices(*)"
      );
      return (data ?? []).map((p: any) => ({
        id: p.id,
        kode: p.kode,
        nama: p.nama,
        kategori: p.kategori,
        is_active: p.is_active,
        stock: p.stock?.[0] ?? p.stock ?? undefined,
        prices: p.prices?.[0] ?? p.prices ?? undefined,
      })) as ProductWithDetails[];
    },
  });
}

export function useProductByKode(kode: string) {
  return useQuery({
    queryKey: ["product", kode],
    enabled: !!kode && kode.length > 0,
    queryFn: async () => {
      const data = await fetchFromSupabase(
        `products?kode=eq.${encodeURIComponent(kode.toUpperCase())}&is_active=eq.true&select=*,stock(*),prices(*)&limit=1`
      );
      if (!data || data.length === 0) return null;
      const p = data[0];
      return {
        id: p.id,
        kode: p.kode,
        nama: p.nama,
        kategori: p.kategori,
        is_active: p.is_active,
        stock: p.stock?.[0] ?? p.stock ?? undefined,
        prices: p.prices?.[0] ?? p.prices ?? undefined,
      } as ProductWithDetails;
    },
  });
}
