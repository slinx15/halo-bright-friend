import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";

export function doLogout() {
  // 1. Remove supabase auth tokens from storage
  Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
  // 2. Mark that we're logging out so Auth page won't auto-redirect
  sessionStorage.setItem('logging_out', 'true');
  // 3. Sign out (don't await - redirect immediately)
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  // 4. Hard redirect
  window.location.replace("/auth");
}

const AppLayout = () => {

  return (
    <div className="flex min-h-screen bg-background w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-24 md:pb-0 overflow-auto overflow-x-hidden scroll-smooth safe-bottom">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
