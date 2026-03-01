import { Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";

export function doLogout() {
  Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
  sessionStorage.setItem('logging_out', 'true');
  supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  window.location.replace("/auth");
}

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main
          key={location.pathname}
          className="flex-1 pb-24 md:pb-0 overflow-auto overflow-x-hidden scroll-smooth safe-bottom page-enter"
        >
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
