import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Plus, Pencil, Trash2, Search, Package, Tags, DollarSign, BoxIcon, Loader2 } from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { ProdukSkeleton } from "@/components/LoadingSkeletons";
import { BulkInputDialog } from "@/components/produk/BulkInputDialog";
import { useIsMobile } from "@/hooks/use-mobile";

const PAGE_SIZE = 30;

const ManajemenProduk = () => {
  const { role } = useAuth();
  const { data: products, isLoading } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [kode, setKode] = useState("");
  const [kategori, setKategori] = useState("");
  const [hargaModal, setHargaModal] = useState(0);
  const [hargaNormal, setHargaNormal] = useState(0);
  const [hargaGrosir, setHargaGrosir] = useState(0);
  const [stokAwal, setStokAwal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() =>
    products?.filter(
      (p) =>
        p.kode.toLowerCase().includes(search.toLowerCase()) ||
        (p.kategori || "").toLowerCase().includes(search.toLowerCase())
    ) ?? [],
    [products, search]
  );

  const visibleItems = useMemo(() =>
    filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const hasMore = visibleCount < filtered.length;

  const handleSearch = (val: string) => {
    setSearch(val);
    setVisibleCount(PAGE_SIZE);
  };

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const totalProducts = filtered.length;
  const categories = new Set(filtered.map(p => p.kategori).filter(Boolean));
  const totalNilai = filtered.reduce((s, p) => s + ((p.stock?.jumlah ?? 0) * (p.prices?.harga_modal ?? 0)), 0);

  const resetForm = () => {
    setKode(""); setKategori("");
    setHargaModal(0); setHargaNormal(0); setHargaGrosir(0); setStokAwal(0);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!kode.trim()) {
      toast({ title: "Error", description: "Kode wajib diisi", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (editId) {
        await supabase.from("products").update({ kode: kode.toUpperCase(), nama: kode.toUpperCase(), kategori: kategori || null }).eq("id", editId);
        await supabase.from("prices").update({ harga_modal: hargaModal, harga_normal: hargaNormal, harga_grosir: hargaGrosir }).eq("product_id", editId);
        toast({ title: "Berhasil", description: `${kode} diperbarui` });
      } else {
        const { data: newProduct, error } = await supabase.from("products").insert({ kode: kode.toUpperCase(), nama: kode.toUpperCase(), kategori: kategori || null }).select().single();
        if (error) throw error;
        await supabase.from("prices").insert({ product_id: newProduct.id, harga_modal: hargaModal, harga_normal: hargaNormal, harga_grosir: hargaGrosir });
        if (stokAwal > 0) {
          await supabase.from("stock").insert({ product_id: newProduct.id, jumlah: stokAwal });
        }
        toast({ title: "Berhasil", description: `${kode} ditambahkan` });
      }
      resetForm();
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleEdit = (p: any) => {
    setEditId(p.id); setKode(p.kode); setKategori(p.kategori || "");
    setHargaModal(p.prices?.harga_modal ?? 0); setHargaNormal(p.prices?.harga_normal ?? 0);
    setHargaGrosir(p.prices?.harga_grosir ?? 0); setStokAwal(0); setShowAdd(true);
  };

  const handleDelete = async (id: string, kode: string) => {
    if (!confirm(`Hapus produk ${kode}?`)) return;
    try {
      await supabase.from("prices").delete().eq("product_id", id);
      await supabase.from("stock").delete().eq("product_id", id);
      await supabase.from("products").update({ is_active: false }).eq("id", id);
      toast({ title: "Dihapus", description: `${kode} dinonaktifkan` });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const isAdmin = role === "admin";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*:nth-child(3)]:![animation-delay:100ms] [&>*]:[animation-fill-mode:both]">
      {/* ── Premium Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 shadow-sm">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight">Manajemen Produk</h1>
            <p className="text-muted-foreground text-xs font-medium">Kelola data produk & harga</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <BulkInputDialog />
            <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="rounded-xl transition-all duration-150 active:scale-95 min-h-[44px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md">
                  <Plus className="h-4 w-4 mr-1" /> Tambah
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-bold flex items-center gap-2">
                    {editId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editId ? "Edit Produk" : "Tambah Produk"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Kode</Label>
                      <Input value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="KTN-001" className="rounded-lg mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Kategori</Label>
                      <Input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="Katun" className="rounded-lg mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">H. Modal</Label>
                      <Input type="number" value={hargaModal} onChange={(e) => setHargaModal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">H. Normal</Label>
                      <Input type="number" value={hargaNormal} onChange={(e) => setHargaNormal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">H. Grosir</Label>
                      <Input type="number" value={hargaGrosir} onChange={(e) => setHargaGrosir(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                    </div>
                  </div>
                  {!editId && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Stok Awal</Label>
                      <Input type="number" value={stokAwal} onChange={(e) => setStokAwal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" />
                    </div>
                  )}
                  <Button onClick={handleSave} disabled={submitting} className="w-full rounded-xl h-12 font-bold transition-all duration-150 active:scale-[0.98] shadow-md bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                    {submitting ? "Menyimpan..." : editId ? "Update Produk" : "Simpan Produk"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="card-premium bg-primary/5 p-3 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{formatNumber(totalProducts)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Produk</p>
        </div>
        <div className="card-premium bg-primary/5 p-3 text-center">
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{categories.size}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Kategori</p>
        </div>
        <div className="card-premium bg-success/5 p-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-success truncate">{formatRupiah(totalNilai)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Nilai Stok</p>
        </div>
      </div>

      {/* ── Product List ── */}
      <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Tags className="h-4 w-4 text-primary" />
              Daftar Produk
              <Badge variant="secondary" className="text-[10px] rounded-full px-2.5 font-bold">{totalProducts}</Badge>
            </CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 rounded-xl h-10" placeholder="Cari kode / kategori..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ProdukSkeleton />
          ) : isMobile ? (
            <div className="space-y-2.5">
              {filtered?.length === 0 && (
                <div className="py-10 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Tidak ada produk</p>
                </div>
              )}
              {filtered?.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/60 p-3.5 space-y-2 transition-all duration-200 active:scale-[0.98] bg-card">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sm">{p.kode}</span>
                      {p.kategori && (
                        <Badge variant="secondary" className="text-[10px] rounded-full px-2 ml-2">{p.kategori}</Badge>
                      )}
                    </div>
                    <span className="font-extrabold text-lg tabular-nums">{formatNumber(p.stock?.jumlah ?? 0)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Modal</span>
                      <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Normal</span>
                      <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Grosir</span>
                      <p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs min-h-[44px] transition-all duration-150 active:scale-95" onClick={() => handleEdit(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl text-xs text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] transition-all duration-150 active:scale-95" onClick={() => handleDelete(p.id, p.kode)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Kode</TableHead>
                    <TableHead className="font-bold">Kategori</TableHead>
                    <TableHead className="text-right font-bold">Stok</TableHead>
                    <TableHead className="text-right font-bold">Modal</TableHead>
                    <TableHead className="text-right font-bold">Normal</TableHead>
                    <TableHead className="text-right font-bold">Grosir</TableHead>
                    {isAdmin && <TableHead className="text-right font-bold">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered?.map((p, idx) => (
                    <TableRow key={p.id} className={idx % 2 === 0 ? "" : "bg-muted/15"}>
                      <TableCell className="font-mono font-bold text-sm">{p.kode}</TableCell>
                      <TableCell>
                        {p.kategori ? (
                          <Badge variant="secondary" className="text-[10px] rounded-full px-2">{p.kategori}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-extrabold tabular-nums text-base">{formatNumber(p.stock?.jumlah ?? 0)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="rounded-lg hover:bg-primary/10 min-h-[40px] min-w-[40px]">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id, p.kode)} className="rounded-lg hover:bg-destructive/10 min-h-[40px] min-w-[40px]">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filtered?.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Tidak ada produk</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManajemenProduk;
