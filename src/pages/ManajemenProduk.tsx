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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Plus, Pencil, Trash2, Search } from "lucide-react";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { BulkInputDialog } from "@/components/produk/BulkInputDialog";

const ManajemenProduk = () => {
  const { role } = useAuth();
  const { data: products, isLoading } = useProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  
  const [editId, setEditId] = useState<string | null>(null);

  // Single product form
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [kategori, setKategori] = useState("");
  const [hargaModal, setHargaModal] = useState(0);
  const [hargaNormal, setHargaNormal] = useState(0);
  const [hargaGrosir, setHargaGrosir] = useState(0);
  const [stokAwal, setStokAwal] = useState(0);
  const [submitting, setSubmitting] = useState(false);



  const filtered = products?.filter(
    (p) =>
      p.kode.toLowerCase().includes(search.toLowerCase()) ||
      p.nama.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setKode(""); setNama(""); setKategori("");
    setHargaModal(0); setHargaNormal(0); setHargaGrosir(0); setStokAwal(0);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!kode.trim() || !nama.trim()) {
      toast({ title: "Error", description: "Kode dan Nama wajib diisi", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (editId) {
        // Update product
        await supabase.from("products").update({ kode: kode.toUpperCase(), nama, kategori: kategori || null }).eq("id", editId);
        await supabase.from("prices").update({ harga_modal: hargaModal, harga_normal: hargaNormal, harga_grosir: hargaGrosir }).eq("product_id", editId);
        toast({ title: "Berhasil", description: `${kode} diperbarui` });
      } else {
        // Insert new
        const { data: newProduct, error } = await supabase.from("products").insert({ kode: kode.toUpperCase(), nama, kategori: kategori || null }).select().single();
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
    setEditId(p.id);
    setKode(p.kode);
    setNama(p.nama);
    setKategori(p.kategori || "");
    setHargaModal(p.prices?.harga_modal ?? 0);
    setHargaNormal(p.prices?.harga_normal ?? 0);
    setHargaGrosir(p.prices?.harga_grosir ?? 0);
    setStokAwal(0);
    setShowAdd(true);
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
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Manajemen Produk</h1>
            <p className="text-muted-foreground text-sm">Kelola data produk & harga</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <BulkInputDialog />
            <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Tambah</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editId ? "Edit Produk" : "Tambah Produk"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Kode</Label><Input value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="KTN-001" /></div>
                    <div><Label>Kategori</Label><Input value={kategori} onChange={(e) => setKategori(e.target.value)} placeholder="Katun" /></div>
                  </div>
                  <div><Label>Nama Produk</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Katun Jepang Premium" /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Harga Modal</Label><Input type="number" value={hargaModal} onChange={(e) => setHargaModal(parseInt(e.target.value) || 0)} /></div>
                    <div><Label>Harga Normal</Label><Input type="number" value={hargaNormal} onChange={(e) => setHargaNormal(parseInt(e.target.value) || 0)} /></div>
                    <div><Label>Harga Grosir</Label><Input type="number" value={hargaGrosir} onChange={(e) => setHargaGrosir(parseInt(e.target.value) || 0)} /></div>
                  </div>
                  {!editId && (
                    <div><Label>Stok Awal</Label><Input type="number" value={stokAwal} onChange={(e) => setStokAwal(parseInt(e.target.value) || 0)} /></div>
                  )}
                  <Button onClick={handleSave} disabled={submitting} className="w-full">
                    {submitting ? "Menyimpan..." : editId ? "Update" : "Simpan"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Daftar Produk ({filtered?.length ?? 0})</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari kode / nama..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Modal</TableHead>
                  <TableHead className="text-right">Normal</TableHead>
                  <TableHead className="text-right">Grosir</TableHead>
                  {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">Memuat...</TableCell></TableRow>
                ) : filtered?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-semibold">{p.kode}</TableCell>
                    <TableCell>{p.nama}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.kategori || "-"}</TableCell>
                    <TableCell className="text-right font-bold">{formatNumber(p.stock?.jumlah ?? 0)}</TableCell>
                    <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_modal) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_normal) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{p.prices ? formatRupiah(p.prices.harga_grosir) : "-"}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id, p.kode)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filtered?.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Tidak ada produk</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManajemenProduk;
