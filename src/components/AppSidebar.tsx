import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { doLogout } from "@/lib/logout";
import {
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  Package,
  ClipboardCheck,
  BarChart3,
  Settings,
  LogOut,
  User,
  FileUp,
  Bot,
  Users,
  FileBarChart,
  FileText,
  History,
  Wallet,
  ShieldCheck,
  Scale,
} from "lucide-react";
import logo from "@/assets/logo.jpg";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", group: "main" },
  { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", group: "transaksi" },
  { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", group: "transaksi" },
  { icon: FileText, label: "Nota Jual", path: "/nota", group: "transaksi" },
  { icon: Package, label: "Stok", path: "/stok", group: "inventaris" },
  { icon: ClipboardCheck, label: "Opname", path: "/opname", group: "inventaris" },
  { icon: BarChart3, label: "Analisa", path: "/analisa", group: "laporan" },
  { icon: FileBarChart, label: "Laporan Bulanan", path: "/laporan", group: "laporan" },
  { icon: Wallet, label: "Dashboard Keuangan", path: "/keuangan", group: "laporan" },
  { icon: Settings, label: "Produk", path: "/produk", group: "laporan" },
  { icon: FileUp, label: "Import Histori", path: "/import-histori", group: "laporan" },
  { icon: Bot, label: "AI Assistant", path: "/ai", group: "laporan" },
  { icon: Users, label: "Kelola User", path: "/users", group: "admin" },
  { icon: History, label: "Log Aktivitas", path: "/log", group: "admin" },
  { icon: ShieldCheck, label: "Audit Stok", path: "/audit-stok", group: "admin" },
  { icon: Scale, label: "Rekonsiliasi Stok", path: "/rekonsiliasi-stok", group: "admin" },
];

const groups = [
  { key: "main", label: "" },
  { key: "transaksi", label: "Operasional" },
  { key: "inventaris", label: "Stok & Audit" },
  { key: "laporan", label: "Analisa & Data" },
  { key: "admin", label: "Admin" },
];

const AppSidebar = () => {
  const { user, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar/95 text-sidebar-foreground border-r border-sidebar-border/80 min-h-screen backdrop-blur-sm">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="h-10 w-10 rounded-xl overflow-hidden ring-2 ring-sidebar-primary/20">
          <img
            src={logo}
            alt="RRCollections"
            className="h-full w-full object-contain"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/pwa-icon-192.png";
            }}
          />
        </div>
        <div>
          <h1 className="font-extrabold text-lg text-sidebar-primary-foreground tracking-tight">RRCollections</h1>
          <p className="text-[10px] text-sidebar-foreground/40 font-semibold uppercase tracking-widest">Command Center</p>
        </div>
      </div>

      {/* Nav with groups */}
      <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto scrollbar-hide">
        {groups.map((group) => {
          const items = navItems.filter((i) => i.group === group.key);
          if (items.length === 0) return null;
          if (group.key === "admin" && role !== "admin") return null;
          return (
            <div key={group.key} className="rounded-2xl border border-sidebar-border/60 bg-sidebar-accent/10 p-2">
              {group.label && (
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/35">
                  {group.label}
                </p>
              )}
              {items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 ease-out relative native-press",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary font-bold shadow-inner-glow"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-sidebar-primary shadow-glow" />
                    )}
                    <item.icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.5]")} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-sidebar-border/80">
        <div className="mb-3 rounded-2xl border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/35">Akses Cepat</p>
          <p className="mt-1 text-xs text-sidebar-foreground/55">Gunakan Analisa untuk keputusan restock, lalu lanjut ke Review sebelum kirim pesanan.</p>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-2xl bg-sidebar-primary/10 flex items-center justify-center ring-1 ring-sidebar-primary/20">
            <User className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-sidebar-primary-foreground">
              {user?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/40 capitalize font-medium">{role ?? "user"}</p>
          </div>
          <ThemeToggle className="text-sidebar-foreground/50 hover:text-sidebar-primary-foreground hover:bg-sidebar-accent" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-2xl text-sidebar-foreground/45 hover:text-sidebar-primary-foreground hover:bg-sidebar-accent"
          onClick={doLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Keluar
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
