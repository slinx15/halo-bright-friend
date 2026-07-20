# Sinkronisasi Barang Masuk ↔ Plafon Supplier

## Masalah
Saat ini, menghapus 1 baris barang masuk hanya mengembalikan stok — bon di Plafon Supplier tetap penuh, jadi sisa limit tidak balik.

## Cara Kerja Baru

Ketika satu baris barang masuk dihapus:

1. Cari bon plafon yang dibuat dari sesi barang masuk yang sama (dicocokkan berdasarkan waktu/invoice number).
2. Kurangi `amount` bon sebesar **harga_modal × qty** dari baris yang dihapus.
3. Update catatan bon supaya baris item itu ikut hilang dari daftar.
4. Kalau setelah dikurangi `amount` jadi 0 → bon otomatis dihapus.
5. Kalau bon sudah berstatus `paid` (lunas) → jangan diutak-atik, cukup beri notifikasi ke user "Bon sudah lunas, plafon tidak berubah."

## Perubahan Teknis

**Database (migration):**
- Tambahkan kolom opsional `stock_in_session` (text) di `ivory_debts` untuk menandai bon berasal dari sesi mana. Isi otomatis saat bon dibuat dari alur Barang Masuk (pakai timestamp sesi, format: `YYYYMMDD-HHMMSS`).
- Backfill kolom itu untuk bon existing berdasarkan `invoice_number` yang sudah ada (`BM-YYYYMMDD-HHMMSS-N` → ambil bagian tengahnya).
- Update fungsi `delete_stock_in_transaction`:
  - Setelah stok direstore, cari `ivory_debts` dengan `stock_in_session` yang cocok + status masih `open`.
  - Kurangi `amount` = `modal × qty`. Jika `amount ≤ 0` → hapus bon.
  - Return info tambahan ke frontend: `plafon_adjusted: true/false`, `bon_deleted: true/false`.

**Frontend (`src/pages/BarangMasuk.tsx`):**
- Setelah hapus sukses, tampilkan toast: "Barang masuk dihapus. Plafon supplier ikut disesuaikan Rp X." atau kalau tidak ditemukan bon: "Barang masuk dihapus. Plafon tidak ditemukan / sudah lunas."

**Frontend simpan bon baru (`src/lib/hutangStore.ts` atau `BarangMasuk.tsx`):**
- Saat membuat bon dari sesi barang masuk, isi kolom `stock_in_session` dengan timestamp sesi yang sama.

## Tidak Diubah
- UI daftar Plafon Supplier tetap sama.
- Alur input barang masuk normal tetap sama.
- Alur pembayaran bon tetap sama.
- Bon berstatus `paid` tidak pernah disentuh otomatis.

## Verifikasi
Setelah selesai: hapus 1 baris BLCK 5 Ons qty 32 (18 Juli) → cek bon `BM-20260718-071912-2` di Plafon Supplier: amount harus turun dari 6.735.872 menjadi 6.735.872 − (modal × 32).
