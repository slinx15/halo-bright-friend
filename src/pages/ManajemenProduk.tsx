import { useState } from "react";
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
import { Settings, Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { ProdukSkeleton } from "@/components/LoadingSkeletons";
import { BulkInputDialog } from "@/components/produk/BulkInputDialog";
import { useIsMobile } from "@/hooks/use-mobile";

const ManajemenProduk = () => {
  const { role } = useAuth();
  const { data: products, isLoading } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const [kode, setKode] = useState("");
  const [kategori, setKategori] = useState("");
  const [hargaModal, setHargaModal] = useState(0);
  const [hargaNormal, setHargaNormal] = useState(0);
  const [hargaGrosir, setHargaGrosir] = useState(0);
  const [stokAwal, setStokAwal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const filtered = products?.filter(
    (p) =>
      p.kode.toLowerCase().includes(search.toLowerCase()) ||
      (p.kategori || "").toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Manajemen Produk</h1>
            <p className="text-muted-foreground text-sm">Kelola data produk & harga</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <BulkInputDialog />
            <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl press-scale"><Plus className="h-4 w-4 mr-1" /> Tambah</Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader><DialogTitle className="font-bold">{editId ? "Edit Produk" : "Tambah Produk"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold text-muted-foreground">Kode</Label><Input value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="KTN-001" className="rounded-lg mt-1" /></div>
                    <div><Label className="text-xs font-semibold text-muted-foreground">Kategori</Label><Input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="Katun" className="rounded-lg mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs font-semibold text-muted-foreground">H. Modal</Label><Input type="number" value={hargaModal} onChange={(e) => setHargaModal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" /></div>
                    <div><Label className="text-xs font-semibold text-muted-foreground">H. Normal</Label><Input type="number" value={hargaNormal} onChange={(e) => setHargaNormal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" /></div>
                    <div><Label className="text-xs font-semibold text-muted-foreground">H. Grosir</Label><Input type="number" value={hargaGrosir} onChange={(e) => setHargaGrosir(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" /></div>
                  </div>
                  {!editId && (
                    <div><Label className="text-xs font-semibold text-muted-foreground">Stok Awal</Label><Input type="number" value={stokAwal} onChange={(e) => setStokAwal(parseInt(e.target.value) || 0)} className="rounded-lg mt-1 tabular-nums" /></div>
                  )}
                  <Button onClick={handleSave} disabled={submitting} className="w-full rounded-xl h-11 font-bold press-scale">
                    {submitting ? "Menyimpan..." : editId ? "Update" : "Simpan"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card className="boss-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold">Daftar Produk ({filtered?.length ?? 0})</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 rounded-lg" placeholder="Cari kode / kategori..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ProdukSkeleton />
          ) : isMobile ? (
            <div className="space-y-2.5">
              {filtered?.length === 0 && (
                <div className="py-8 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Tidak ada produk</p>
                </div>
              )}
              {filtered?.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/60 p-3.5 space-y-2 press-scale">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sm">{p.kode}</span>
                      {p.kategori && <span className="text-xs text-muted-foreground ml-2">{p.kategori}</span>}
                    </div>
                    <span className="font-extrabold tabular-nums">{formatNumber(p.stock?.jumlah ?? 0)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div><span className="text-muted-foreground">Modal</span><p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</p></div>
                    <div><span className="text-muted-foreground">Normal</span><p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</p></div>
                    <div><span className="text-muted-foreground">Grosir</span><p className="font-semibold tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</p></div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-3 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs press-scale" onClick={() => handleEdit(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl text-xs text-destructive hover:bg-destructive/10 press-scale" onClick={() => handleDelete(p.id, p.kode)}>
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
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Modal</TableHead>
                    <TableHead className="text-right">Normal</TableHead>
                    <TableHead className="text-right">Grosir</TableHead>
                    {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">{p.kode}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.kategori || "-"}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatNumber(p.stock?.jumlah ?? 0)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="hover-lift"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id, p.kode)} className="hover-lift"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filtered?.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Tidak ada produk</TableCell></TableRow>
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
