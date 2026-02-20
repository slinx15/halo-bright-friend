import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  PackagePlus,
  PackageMinus,
  Package,
  ClipboardCheck,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Home", path: "/" },
  { icon: PackagePlus, label: "Masuk", path: "/masuk" },
  { icon: PackageMinus, label: "Jual", path: "/keluar" },
  { icon: Package, label: "Stok", path: "/stok" },
  { icon: ClipboardCheck, label: "Opname", path: "/opname" },
  { icon: BarChart3, label: "Analisa", path: "/analisa" },
  { icon: Settings, label: "Produk", path: "/produk" },
];

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
      <div className="flex justify-around py-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-1 py-1 text-[10px] font-medium text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </nav>
  );
};

export default MobileNav;
