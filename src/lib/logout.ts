import { supabase } from "@/integrations/supabase/client";

export function doLogout() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("sb-"))
    .forEach((key) => localStorage.removeItem(key));

  sessionStorage.setItem("logging_out", "true");
  supabase.auth.signOut({ scope: "local" }).catch(() => {
    // Ignore local signout failures and still force a fresh auth screen.
  });
  window.location.replace("/auth");
}
