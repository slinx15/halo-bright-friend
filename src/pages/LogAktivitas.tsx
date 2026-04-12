import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, PackagePlus, PackageMinus, ClipboardCheck, Settings, Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  stock_in: { label: "Barang Masuk", icon: PackagePlus, color: "bg-success/10 text-success border-success/20" },
  stock_out: { label: "Barang Keluar", icon: PackageMinus, color: "bg-primary/10 text-primary border-primary/20" },
  stock_out_delete: { label: "Hapus Transaksi", icon: PackageMinus, color: "bg-destructive/10 text-destructive border-destructive/20" },
  opname: { label: "Opname", icon: ClipboardCheck, color: "bg-warning/10 text-warning border-warning/20" },
  product_edit: { label: "Edit Produk", icon: Settings, color: "bg-accent/10 text-accent-foreground border-accent/20" },
  price_edit: { label: "Edit Harga", icon: Settings, color: "bg-accent/10 text-accent-foreground border-accent/20" },
  product_create: { label: "Produk Baru", icon: Settings, color: "bg-success/10 text-success border-success/20" },
  product_delete: { label: "Hapus Produk", icon: Settings, color: "bg-destructive/10 text-destructive border-destructive/20" },
};

const PAGE_SIZE = 50;

const LogAktivitas = () => {
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-for-log"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name");
      return data || [];
    },
    enabled: role === "admin",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["activity-log", filterAction, page],
    queryFn: async () => {
      let query = supabase
        .from("activity_log" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction !== "all") {
        query = query.eq("action", filterAction);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return { logs: (data || []) as any[], total: count || 0 };
    },
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = search
    ? logs.filter((l: any) => l.detail?.toLowerCase().includes(search.toLowerCase()))
    : logs;

  const getUserName = (userId: string) => {
    const profile = profiles?.find(p => p.user_id === userId);
    return profile?.name || userId.slice(0, 8);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const wib = new Date(d.getTime() + 7 * 3600000);
    return wib.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateWIB = (dateStr: string) => {
    const d = new Date(dateStr);
    const wib = new Date(d.getTime() + 7 * 3600000);
    const now = new Date(Date.now() + 7 * 3600000);
    const diffDays = Math.floor((now.getTime() - wib.getTime()) / 86400000);
    if (diffDays === 0) return "Hari ini";
    if (diffDays === 1) return "Kemarin";
    return wib.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  // Group by date
  const grouped: Record<string, any[]> = {};
  for (const log of filtered) {
    const d = new Date(log.created_at);
    const wib = new Date(d.getTime() + 7 * 3600000);
    const key = wib.toISOString().slice(0, 10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(log);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Log Aktivitas" icon={History} iconColor="text-primary" iconBg="bg-primary/10" subtitle="Riwayat semua perubahan data" />

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari aktivitas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="stock_in">Barang Masuk</SelectItem>
            <SelectItem value="stock_out">Barang Keluar</SelectItem>
            <SelectItem value="opname">Opname</SelectItem>
            <SelectItem value="product_edit">Edit Produk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Belum ada aktivitas</p>
          <p className="text-sm">Semua perubahan data akan dicatat di sini</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([dateKey, items]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {formatDateWIB(items[0].created_at)}
              </p>
              <Card className="divide-y divide-border/50 overflow-hidden">
                {items.map((log: any) => {
                  const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.stock_in;
                  const Icon = config.icon;
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-3">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", config.color)}>
                            {config.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{formatTime(log.created_at)}</span>
                        </div>
                        <p className="text-sm mt-0.5 line-clamp-2">{log.detail}</p>
                        {role === "admin" && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            oleh {getUserName(log.user_id)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogAktivitas;
