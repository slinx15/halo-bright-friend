import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabaseEnv";

const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

export async function getAuthHeaders(prefer = "return=minimal") {
  let token = SUPABASE_KEY;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
    }
  } catch {}
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${token}`,
    "Prefer": prefer,
    "Accept": "application/json",
  };
}
