
# 🧵 Web App Manajemen Stok

Aplikasi web pengganti bot Telegram untuk mengelola stok produk tekstil/kain, dengan database Supabase dan fitur OCR.

---

## 👥 Authentication & User Management
- Halaman login/register dengan email & password
- Role-based access: **Admin** dan **Karyawan**
- Admin bisa mengelola user, karyawan hanya bisa input data & lihat stok
- Profil user sederhana (nama, role)

## 📊 Dashboard Utama
- Ringkasan stok: total item, total nilai, stok kritis
- Grafik penjualan harian/mingguan (menggunakan Recharts)
- Top 10 best seller & slow mover
- Alert untuk stok yang hampir habis (kritis, warning)
- Quick action buttons: Masuk, Keluar, Opname, Cek Stok

## 📥 Barang Masuk
- Form input manual: kode produk + qty (bisa multi-item sekaligus)
- Upload foto faktur → OCR otomatis baca data (via Supabase Edge Function)
- Preview & edit hasil OCR sebelum simpan
- Riwayat barang masuk dengan filter tanggal

## 📤 Barang Keluar
- Form input: kode produk + qty pesanan + qty terkirim
- Upload foto nota → OCR otomatis
- Pilihan harga: Normal atau Grosir
- Kalkulasi total harga otomatis
- Riwayat barang keluar dengan filter tanggal

## 📦 Manajemen Stok
- Tabel stok lengkap: kode, jumlah, tumpukan, harga modal/normal/grosir
- Search & filter berdasarkan kode produk
- Indikator warna untuk status stok (kritis/warning/aman)
- Detail per produk: riwayat masuk/keluar

## 📋 Stock Opname
- Input stok fisik per kode (manual atau foto OCR)
- Perbandingan otomatis stok sistem vs stok fisik
- Highlight item yang ada selisih
- Konfirmasi & update stok setelah review

## 📈 Analisa & Restock
- Analisa velocity penjualan per produk (WMA - Weighted Moving Average)
- Rekomendasi restock otomatis berdasarkan velocity & safety stock
- Fitur "Budget" - input budget, dapat rekomendasi belanja optimal
- Review belanjaan - cek apakah qty yang mau dibeli sudah tepat
- Deteksi dead stock (tidak laku 60 hari)

## 🗄️ Database (Supabase)
- Migrasi dari Google Sheets ke tabel Supabase: products (master), stock, prices, stock_in, stock_out, stock_opname_log
- Row Level Security untuk keamanan data
- Edge Functions untuk OCR processing

## 📱 Responsive Design
- Tampilan mobile-friendly agar bisa dipakai dari HP di gudang/toko
- Navigasi sidebar di desktop, bottom nav di mobile
