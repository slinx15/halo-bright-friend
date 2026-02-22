import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { doLogout } from "./AppLayout";
import {
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  Package,
  ClipboardCheck,
  BarChart3,
  Settings,
  FileUp,
  Bot,
  Users,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNav = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: PackagePlus, label: "Masuk", path: "/masuk" },
  { icon: PackageMinus, label: "Jual", path: "/keluar" },
  { icon: Package, label: "Stok", path: "/stok" },
  { icon: ClipboardCheck, label: "Opname", path: "/opname" },
];

const secondaryNav = [
  { icon: BarChart3, label: "Analisa", path: "/analisa", adminOnly: false },
  { icon: Settings, label: "Produk", path: "/produk", adminOnly: false },
  { icon: FileUp, label: "Import", path: "/import-histori", adminOnly: false },
  { icon: Bot, label: "AI Assistant", path: "/ai", adminOnly: false },
  { icon: Users, label: "Kelola User", path: "/users", adminOnly: true },
];

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleSecondary = secondaryNav.filter((item) => !item.adminOnly || role === "admin");
  const isSecondaryActive = visibleSecondary.some((item) => item.path === location.pathname);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-3 right-3 bg-card rounded-2xl border border-border/50 shadow-xl p-2 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {visibleSecondary.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMoreOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium transition-all",
                    active
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-foreground/70 active:bg-muted"
                  )}
                >
                  <item.icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.5]")} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around px-1 py-1">
          {primaryNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] rounded-xl transition-colors duration-150",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:scale-95"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span className={cn("text-[11px]", active ? "font-semibold" : "font-medium")}>{item.label}</span>
              </button>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] rounded-xl transition-colors duration-150",
              moreOpen || isSecondaryActive
                ? "text-primary"
                : "text-muted-foreground active:scale-95"
            )}
          >
            {moreOpen ? (
              <X className="h-5 w-5 stroke-[2.5]" />
            ) : (
              <MoreHorizontal className={cn("h-5 w-5", isSecondaryActive && "stroke-[2.5]")} />
            )}
            <span className={cn("text-[11px]", (moreOpen || isSecondaryActive) ? "font-semibold" : "font-medium")}>Lainnya</span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
