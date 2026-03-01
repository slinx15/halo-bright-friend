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
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNav = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: PackagePlus, label: "Masuk", path: "/masuk" },
  { icon: PackageMinus, label: "Jual", path: "/keluar" },
  { icon: Package, label: "Stok", path: "/stok" },
  { icon: BarChart3, label: "Analisa", path: "/analisa" },
];

const secondaryNav = [
  { icon: ClipboardCheck, label: "Opname", path: "/opname", adminOnly: false },
  { icon: Settings, label: "Produk", path: "/produk", adminOnly: false },
  { icon: FileUp, label: "Import & Export", path: "/import-histori", adminOnly: false },
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
            <div className="border-t border-border/50 my-1" />
            <button
              onClick={() => {
                setMoreOpen(false);
                doLogout();
              }}
              className="flex items-center gap-3 w-full px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium text-destructive active:bg-destructive/10 transition-all"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Keluar
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border/20 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-end px-2 pt-1.5 pb-1">
          {primaryNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[52px] rounded-2xl transition-all duration-200",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:scale-90"
                )}
              >
                {active && (
                  <span className="absolute -top-1.5 w-8 h-1 rounded-full bg-primary animate-fade-in" />
                )}
                <span className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
                  active && "bg-primary/10"
                )}>
                  <item.icon className={cn("h-[20px] w-[20px] transition-all duration-200", active ? "stroke-[2.5]" : "stroke-[1.8]")} />
                </span>
                <span className={cn(
                  "text-[10px] leading-tight transition-all duration-200",
                  active ? "font-bold text-primary" : "font-medium text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[52px] rounded-2xl transition-all duration-200",
              moreOpen || isSecondaryActive
                ? "text-primary"
                : "text-muted-foreground active:scale-90"
            )}
          >
            {(moreOpen || isSecondaryActive) && (
              <span className="absolute -top-1.5 w-8 h-1 rounded-full bg-primary animate-fade-in" />
            )}
            <span className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
              (moreOpen || isSecondaryActive) && "bg-primary/10"
            )}>
              {moreOpen ? (
                <X className="h-[20px] w-[20px] stroke-[2.5]" />
              ) : (
                <MoreHorizontal className={cn("h-[20px] w-[20px] transition-all duration-200", isSecondaryActive ? "stroke-[2.5]" : "stroke-[1.8]")} />
              )}
            </span>
            <span className={cn(
              "text-[10px] leading-tight transition-all duration-200",
              (moreOpen || isSecondaryActive) ? "font-bold text-primary" : "font-medium text-muted-foreground"
            )}>
              Lainnya
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
