## Tujuan
Tambah fitur **Cocokan Pesanan** di halaman Barang Masuk supaya kamu tau barang mana yang **kosong / tidak dikirim** supplier — dibandingkan otomatis dengan bon yang datang.

## Alur Baru per Bon

```text
Bon #1
 ├─ [Pesanan Saya]  ← paste WA / ketik manual (kode + qty pesan)
 ├─ [Yang Datang]   ← scan foto bon / input manual (existing)
 └─ [Hasil Cocok]   ← auto-diff, muncul begitu keduanya terisi
```

## Tampilan Hasil Cocok

Tiga kelompok, dengan warna berbeda:

- **Lengkap** (hijau): kode ada di pesanan & datang, qty sama
- **Kurang** (kuning): kode datang tapi qty < pesan  → tampil "pesan 10, datang 7, kurang 3"
- **Kosong** (merah): kode ada di pesanan, **tidak ada** di bon datang sama sekali
- **Ekstra** (abu): kode datang tapi tidak dipesan (jarang, buat jaga-jaga)

Setiap baris kosong/kurang bisa di-**copy** ke clipboard sebagai list ("BLCK 2 Ons: 3 pcs, WHT 5 Ons: 5 pcs") untuk langsung WA ke supplier.

## Input Pesanan

Textarea sederhana, satu baris per item, format bebas:
```
BLCK 2 Ons 10
WHT 5 Ons 5
350 3
```
Parser pakai `productMatcher` yang sudah ada (sama seperti OCR). Kalau ada baris tidak dikenali → warning halus di bawah textarea.

## Penyimpanan
- Data pesanan **tidak** disimpan ke DB — cuma tools bantu saat sesi input.
- Yang tetap disimpan: bon barang masuk + hutang seperti sekarang.
- Tapi hasil kosong/kurang bisa dicatat ke field **catatan bon** otomatis (opsional, ada tombol "Salin ke catatan").

## Yang Berubah di File
- `src/pages/BarangMasuk.tsx`: tambah state `pesanan` per bon, tambah textarea + panel diff.
- `src/lib/orderMatcher.ts` (baru): fungsi `diffOrder(pesanan, datang)` → return {lengkap, kurang, kosong, ekstra}.
- `src/lib/textParser.ts`: reuse parser yang sudah ada untuk pesanan (kalau perlu tambah util kecil).

## Yang Tidak Berubah
- Alur OCR & simpan bon tetap.
- Auto-create Hutang Ivory tetap.
- Kategori, tumpukan, dll tidak disentuh.

Lanjut kerjakan?
