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
  LogOut,
  FileUp,
  Bot,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Home", path: "/", adminOnly: false },
  { icon: PackagePlus, label: "Masuk", path: "/masuk", adminOnly: false },
  { icon: PackageMinus, label: "Jual", path: "/keluar", adminOnly: false },
  { icon: Package, label: "Stok", path: "/stok", adminOnly: false },
  { icon: ClipboardCheck, label: "Opname", path: "/opname", adminOnly: false },
  { icon: BarChart3, label: "Analisa", path: "/analisa", adminOnly: false },
  { icon: Settings, label: "Produk", path: "/produk", adminOnly: false },
  { icon: FileUp, label: "Import", path: "/import-histori", adminOnly: false },
  { icon: Bot, label: "AI", path: "/ai", adminOnly: false },
  { icon: Users, label: "Users", path: "/users", adminOnly: true },
];

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();

  const visibleItems = navItems.filter((item) => !item.adminOnly || role === "admin");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around py-1.5 px-1">
        {visibleItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium transition-all duration-200 ease-out rounded-xl min-w-[44px]",
                active
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground active:scale-95"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.5]")} />
              <span className={cn(active && "font-bold")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
