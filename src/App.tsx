import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import BarangMasuk from "@/pages/BarangMasuk";
import BarangKeluar from "@/pages/BarangKeluar";
import Stok from "@/pages/Stok";
import Opname from "@/pages/Opname";
import ManajemenProduk from "@/pages/ManajemenProduk";
import ImportHistori from "@/pages/ImportHistori";
import AiChat from "@/pages/AiChat";
import ManajemenUser from "@/pages/ManajemenUser";
import Laporan from "@/pages/Laporan";
import Nota from "@/pages/Nota";
import NotFound from "@/pages/NotFound";
import LogAktivitas from "@/pages/LogAktivitas";
import DashboardKeuangan from "@/pages/DashboardKeuangan";
import AuditStok from "@/pages/AuditStok";
import RekonsiliasiStok from "@/pages/RekonsiliasiStok";

const Analisa = lazy(() => import("@/pages/Analisa"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Dashboard />} />
                <Route path="/masuk" element={<BarangMasuk />} />
                <Route path="/keluar" element={<BarangKeluar />} />
                <Route path="/stok" element={<Stok />} />
                <Route path="/opname" element={<Opname />} />
                <Route path="/analisa" element={<Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}><Analisa /></Suspense>} />
                <Route path="/produk" element={<ManajemenProduk />} />
                <Route path="/import-histori" element={<ImportHistori />} />
                <Route path="/ai" element={<AiChat />} />
                <Route path="/users" element={<ManajemenUser />} />
                <Route path="/laporan" element={<Laporan />} />
                <Route path="/nota" element={<Nota />} />
                <Route path="/log" element={<LogAktivitas />} />
                <Route path="/audit-stok" element={<AuditStok />} />
                <Route path="/rekonsiliasi-stok" element={<RekonsiliasiStok />} />
                <Route path="/keuangan" element={<DashboardKeuangan />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
