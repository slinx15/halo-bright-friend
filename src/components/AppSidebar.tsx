import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import logo from "@/assets/logo.jpg";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: PackagePlus, label: "Barang Masuk", path: "/masuk" },
  { icon: PackageMinus, label: "Barang Keluar", path: "/keluar" },
  { icon: Package, label: "Stok", path: "/stok" },
  { icon: ClipboardCheck, label: "Opname", path: "/opname" },
  { icon: BarChart3, label: "Analisa", path: "/analisa" },
  { icon: Settings, label: "Produk", path: "/produk" },
];

const AppSidebar = () => {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border min-h-screen">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <img src={logo} alt="RRCollections" className="h-10 w-10 rounded-lg object-contain" />
        <div>
          <h1 className="font-bold text-lg text-sidebar-primary-foreground">RRCollections</h1>
          <p className="text-xs text-sidebar-foreground/60">Manajemen Stok</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <User className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-primary-foreground">
              {user?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{role ?? "user"}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-primary-foreground hover:bg-sidebar-accent"
          onClick={async () => { await signOut(); window.location.href = "/auth"; }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Keluar
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
