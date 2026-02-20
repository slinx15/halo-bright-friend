

## Tambah Kolom `toko` dan Fitur Analisa Pelanggan

### Langkah 1: Migrasi Database
Tambahkan kolom `toko` (text, nullable, default kosong) ke tabel `stock_out`:

```sql
ALTER TABLE public.stock_out ADD COLUMN toko text DEFAULT '' ;
```

### Langkah 2: Update Form Barang Keluar
Di `src/pages/BarangKeluar.tsx`, tambahkan field input **Nama Toko/Pelanggan** agar setiap transaksi keluar bisa dicatat nama tokonya. Field ini opsional (boleh kosong). Saat submit, nilai `toko` ikut disimpan ke `stock_out`. Kolom toko juga ditampilkan di tabel riwayat.

### Langkah 3: Buat Komponen Analisa Pelanggan
Buat `src/components/analisa/Pelanggan.tsx` yang menganalisa penjualan per toko/pelanggan:

- **Ringkasan per toko**: total qty, total omzet, jumlah transaksi, rata-rata per transaksi
- **Ranking toko** berdasarkan total pembelian (qty dan rupiah)
- **Produk favorit per toko**: kode produk yang paling sering dibeli tiap toko
- Toko dengan nama kosong dikelompokkan sebagai "Tanpa Nama"

### Langkah 4: Daftarkan di Halaman Analisa
Tambahkan opsi `{ value: "pelanggan", label: "👥 Pelanggan" }` di `VIEW_OPTIONS` di `src/pages/Analisa.tsx`, import komponen `Pelanggan`, dan render saat `view === "pelanggan"`.

---

### Detail Teknis

**File yang diubah:**
1. **Migrasi SQL** -- `ALTER TABLE stock_out ADD COLUMN toko text DEFAULT ''`
2. **`src/pages/BarangKeluar.tsx`** -- Tambah state `toko`, input field, kirim saat insert, tampilkan di tabel riwayat
3. **`src/components/analisa/Pelanggan.tsx`** (baru) -- Komponen analisa per pelanggan/toko dari data `stock_out`
4. **`src/pages/Analisa.tsx`** -- Tambah opsi pelanggan di dropdown dan render komponen

**Data yang digunakan:** `stockOutData` yang sudah di-fetch oleh `useStockAnalysis`, ditambah join ke `products` untuk nama & harga.

