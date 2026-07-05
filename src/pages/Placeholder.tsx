import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/masuk": "Barang Masuk",
  "/keluar": "Barang Keluar",
  "/stok": "Manajemen Stok",
  "/opname": "Stock Opname",
  "/analisa": "Analisa & Restock",
};

const Placeholder = () => {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] || "Halaman";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <Construction className="h-16 w-16 text-muted-foreground/40" />
      <div className="text-center">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1">Fitur ini sedang dalam pengembangan</p>
      </div>
    </div>
  );
};

export default Placeholder;
