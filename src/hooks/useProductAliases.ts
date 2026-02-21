import { useQuery } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

export interface ProductAlias {
  id: string;
  product_id: string;
  alias: string;
}

export function useProductAliases() {
  return useQuery({
    queryKey: ["product_aliases"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/product_aliases?select=*`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token || SUPABASE_KEY}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
      return (await res.json()) as ProductAlias[];
    },
  });
}
