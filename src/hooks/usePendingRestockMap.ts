import { useQuery } from "@tanstack/react-query";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";

function getAuthToken(): string {
  const storageKey = Object.keys(localStorage).find((key) => key.includes("auth-token"));
  if (!storageKey) return "";
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "") as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    return parsed.access_token || parsed.currentSession?.access_token || "";
  } catch {
    return "";
  }
}

interface PendingRestockItemRow {
  kode: string;
  qty: number;
}

interface PendingRestockRow {
  pending_restock_items?: PendingRestockItemRow[] | null;
}

const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

export function usePendingRestockMap() {
  return useQuery({
    queryKey: ["pending-restock-map"],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/pending_restock?select=status,pending_restock_items(kode,qty)&status=in.(pending,active)`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token || SUPABASE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Fetch error: ${response.status}`);
      }

      const rows = (await response.json()) as PendingRestockRow[];
      const map = new Map<string, number>();

      rows.forEach((row) => {
        (row.pending_restock_items ?? []).forEach((item) => {
          const key = item.kode.toUpperCase().trim();
          map.set(key, (map.get(key) ?? 0) + item.qty);
        });
      });

      return map;
    },
    staleTime: 60 * 1000,
  });
}
