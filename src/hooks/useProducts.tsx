import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductWithDetails {
  id: string;
  kode: string;
  nama: string;
  kategori: string | null;
  is_active: boolean;
  stock?: { jumlah: number; tumpukan: string | null };
  prices?: { harga_modal: number; harga_normal: number; harga_grosir: number };
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, stock(*), prices(*)")
        .eq("is_active", true)
        .order("kode");
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("products")
        .select("*, stock(*), prices(*)")
        .eq("kode", kode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        kode: data.kode,
        nama: data.nama,
        kategori: data.kategori,
        is_active: data.is_active,
        stock: (data as any).stock?.[0] ?? (data as any).stock ?? undefined,
        prices: (data as any).prices?.[0] ?? (data as any).prices ?? undefined,
      } as ProductWithDetails;
    },
  });
}
