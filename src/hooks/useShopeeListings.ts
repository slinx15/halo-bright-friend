import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShopeeListing {
  id: string;
  shopee_product_id: string;
  shopee_product_name: string;
  variation_id: string;
  variation_name: string;
  parent_sku: string | null;
  sku: string | null;
  price: string | null;
  min_qty: string | null;
  max_qty: string | null;
  kode: string;
  kategori: string;
  product_id: string | null;
  is_active: boolean;
}

export function useShopeeListings() {
  return useQuery({
    queryKey: ["shopee_listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopee_listings")
        .select("*")
        .order("shopee_product_name", { ascending: true })
        .order("variation_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShopeeListing[];
    },
    staleTime: 60_000,
  });
}

export function useToggleShopeeListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      productId: string;
      kode: string;
      kategori: string;
      enable: boolean;
      existingId?: string;
    }) => {
      if (!payload.enable) {
        if (!payload.existingId) return;
        const { error } = await supabase
          .from("shopee_listings")
          .update({ is_active: false })
          .eq("id", payload.existingId);
        if (error) throw error;
        return;
      }

      if (payload.existingId) {
        const { error } = await supabase
          .from("shopee_listings")
          .update({ is_active: true })
          .eq("id", payload.existingId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("shopee_listings").insert({
        shopee_product_id: "",
        shopee_product_name: "",
        variation_id: `manual-${payload.productId}`,
        variation_name: payload.kode,
        kode: payload.kode,
        kategori: payload.kategori,
        product_id: payload.productId,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopee_listings"] });
    },
  });
}
