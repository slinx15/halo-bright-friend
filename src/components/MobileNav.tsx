import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { doLogout } from "@/lib/logout";
import { useTheme } from "next-themes";
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
  FileBarChart,
  FileText,
  MoreHorizontal,
  X,
  LogOut,
  Moon,
  Sun,
  History,
  Wallet,
  ShieldCheck,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNav = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: PackagePlus, label: "Masuk", path: "/masuk" },
  { icon: PackageMinus, label: "Jual", path: "/keluar" },
  { icon: Package, label: "Stok", path: "/stok?kategori=2%20Ons", activePath: "/stok" },
  { icon: BarChart3, label: "Analisa", path: "/analisa" },
];

const secondaryNav = [
  { icon: FileText, label: "Nota Jual", path: "/nota", adminOnly: false },
  { icon: ClipboardCheck, label: "Opname", path: "/opname", adminOnly: false },
  { icon: FileBarChart, label: "Laporan Bulanan", path: "/laporan", adminOnly: false },
  { icon: Wallet, label: "Dashboard Keuangan", path: "/keuangan", adminOnly: false },
  { icon: Settings, label: "Produk", path: "/produk", adminOnly: false },
  { icon: FileUp, label: "Import Histori", path: "/import-histori", adminOnly: false },
  { icon: Bot, label: "AI Assistant", path: "/ai", adminOnly: false },
  { icon: Users, label: "Kelola User", path: "/users", adminOnly: true },
  { icon: History, label: "Log Aktivitas", path: "/log", adminOnly: true },
  { icon: ShieldCheck, label: "Audit Stok", path: "/audit-stok", adminOnly: true },
  { icon: Scale, label: "Rekonsiliasi Stok", path: "/rekonsiliasi-stok", adminOnly: true },
];

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleSecondary = secondaryNav.filter((item) => !item.adminOnly || role === "admin");
  const isSecondaryActive = visibleSecondary.some((item) => item.path === location.pathname);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
          <div
            className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-3 right-3 max-h-[calc(100svh-7rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-y-contain bg-card rounded-2xl border border-border/30 shadow-2xl p-2 space-y-0.5 animate-slide-up scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
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
                    "flex items-center gap-3 w-full px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium transition-all native-press",
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
            <div className="border-t border-border/30 my-1" />
            <div className="px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tips</p>
              <p className="mt-1 text-xs text-muted-foreground">Pakai Analisa untuk lihat kebutuhan, lalu cek ulang di Review sebelum kirim pesanan.</p>
            </div>
            <div className="border-t border-border/30 my-1" />
            <div className="flex items-center gap-2 px-2">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center gap-3 flex-1 px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium text-foreground/70 active:bg-muted transition-all native-press"
              >
                {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                {theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              </button>
            </div>
            <button
              onClick={() => {
                setMoreOpen(false);
                doLogout();
              }}
              className="flex items-center gap-3 w-full px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium text-destructive active:bg-destructive/10 transition-all native-press"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Keluar
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav bar — glass effect */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/10 shadow-[0_-4px_30px_rgba(0,0,0,0.15)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around items-end px-2 pt-1.5 pb-1">
          {primaryNav.map((item) => {
            const active = item.activePath
              ? location.pathname === item.activePath
              : location.pathname === item.path;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[52px] rounded-2xl transition-all duration-200 native-press",
                  active
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {active && (
                  <span className="absolute -top-1.5 w-8 h-1 rounded-full bg-primary shadow-glow animate-fade-in" />
                )}
                <span className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300",
                  active && "bg-primary/10 shadow-inner-glow"
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
              "relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[52px] rounded-2xl transition-all duration-200 native-press",
              moreOpen || isSecondaryActive
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {(moreOpen || isSecondaryActive) && (
              <span className="absolute -top-1.5 w-8 h-1 rounded-full bg-primary shadow-glow animate-fade-in" />
            )}
            <span className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300",
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
