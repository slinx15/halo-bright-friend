import { Package, PackagePlus, PackageMinus, ClipboardCheck, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { formatNumber, getStockStatus } from "@/lib/formatters";

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: products, isLoading } = useProducts();

  const totalItems = products?.length ?? 0;
  const totalStok = products?.reduce((sum, p) => sum + (p.stock?.jumlah ?? 0), 0) ?? 0;
  const warning = products?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "warning").length ?? 0;
  const kritis = products?.filter((p) => getStockStatus(p.stock?.jumlah ?? 0) === "kritis").length ?? 0;

  const quickActions = [
    { icon: PackagePlus, label: "Barang Masuk", path: "/masuk", color: "text-success" },
    { icon: PackageMinus, label: "Barang Keluar", path: "/keluar", color: "text-destructive" },
    { icon: ClipboardCheck, label: "Stock Opname", path: "/opname", color: "text-warning" },
    { icon: Package, label: "Cek Stok", path: "/stok", color: "text-primary" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Ringkasan stok RRCollections</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : formatNumber(totalItems)}</p>
                <p className="text-xs text-muted-foreground">Total Item</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : formatNumber(totalStok)}</p>
                <p className="text-xs text-muted-foreground">Total Stok</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : warning}</p>
                <p className="text-xs text-muted-foreground">Stok Warning</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{isLoading ? "..." : kritis}</p>
                <p className="text-xs text-muted-foreground">Stok Kritis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aksi Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => navigate(action.path)}
              >
                <action.icon className={`h-6 w-6 ${action.color}`} />
                <span className="text-sm">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
