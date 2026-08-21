import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import { useAuth } from "@/hooks/useAuth";
import { Eye } from "lucide-react";

const AppLayout = () => {
  const { isGuest } = useAuth();

  return (
    <div className="flex min-h-[100dvh] bg-background w-full max-w-[100vw] overflow-x-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-hidden">
        {isGuest && (
          <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <Eye className="h-4 w-4 shrink-0" />
            Mode Tamu — hanya bisa melihat, tidak bisa mengubah data.
          </div>
        )}
        <main className="flex-1 min-w-0 md:overflow-y-auto md:overflow-x-hidden md:overscroll-y-contain scroll-smooth pb-24 safe-bottom md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default AppLayout;

