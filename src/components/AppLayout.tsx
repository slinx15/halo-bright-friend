import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.jpg";

const AppLayout = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    // Remove only supabase auth tokens
    const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
    keysToRemove.forEach(k => localStorage.removeItem(k));
    supabase.auth.signOut({ scope: 'local' }).finally(() => {
      window.location.href = "/auth";
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        {/* Mobile header with logout */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <img src={logo} alt="RRCollections" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <h1 className="font-bold text-sm">RRCollections</h1>
              <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive">
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </header>
        <main className="flex-1 pb-20 md:pb-0 overflow-auto">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
