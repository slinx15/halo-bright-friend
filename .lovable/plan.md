## Tujuan
Ubah alur Barang Masuk supaya bisa input **beberapa bon sekaligus** dalam satu sesi, tiap bon bisa punya beberapa halaman foto/input, lalu **simpan semua sekaligus** di akhir.

## Alur Baru (user)
1. Buka Barang Masuk → sesi otomatis mulai dengan **Bon #1**.
2. Di Bon #1: input item (manual atau OCR foto halaman 1). Klik "Tambah Halaman" untuk foto halaman berikutnya — item hasil OCR digabung otomatis kalau kodenya sama.
3. Klik **"+ Tambah Bon"** untuk mulai Bon #2, dst.
4. Set 1 tanggal untuk seluruh sesi (default hari ini).
5. Klik **"Simpan Semua"** → semua bon disimpan sekaligus, tiap bon jadi 1 entry hutang Ivory terpisah.

## Struktur Data (state)
```text
session {
  tanggal: Date (satu untuk semua bon)
  bons: [
    {
      id: "BON-1" (auto),
      items: [{ kode, qty, productId, productName, kategori }],
      catatan?: string
    },
    { id: "BON-2", items: [...] },
    ...
  ]
}
```

## Perubahan File
- **`src/pages/BarangMasuk.tsx`** (rewrite bagian form):
  - Hapus 3-mode tabs (manual/OCR/match) — jadi satu alur unified.
  - Tambah komponen bon-list: tiap bon adalah Card dengan header "Bon #N", tombol hapus bon, daftar item, tombol "Tambah item manual" + "Scan halaman (OCR)".
  - Tombol global: "+ Tambah Bon", date picker sesi, "Simpan Semua Bon".
  - Merge logic: saat OCR selesai, tiap item dicek — kalau `kode` sudah ada di bon aktif, `qty` ditambahkan; kalau belum, append baris baru.
  - Submit loop: untuk tiap bon → jalankan `registerStockIn` per item → buat 1 `createDebtItem` per bon dengan nomor `BM-YYYYMMDD-HHMMSS-N`.

- **Tidak diubah**: `stockMutations.ts`, `hutangStore.ts`, `OcrUpload.tsx` (dipakai apa adanya, cuma callback-nya yang merge).

## Detail Teknis
- Auto-number bon di UI: `BON-1`, `BON-2` (label saja, cuma untuk user).
- Nomor bon di DB Hutang Ivory: `BM-{yyyyMMdd}-{HHmmss}-{index}` supaya unik antar bon dalam 1 sesi.
- Validasi sebelum save: minimal 1 bon dengan ≥1 item yang punya `productId` valid.
- Kalau salah satu bon gagal simpan → lanjut ke bon berikutnya, di akhir tampilkan toast ringkasan (X bon sukses, Y gagal).
- Sesi di-reset setelah "Simpan Semua" sukses.

## Yang TIDAK Berubah
- Desain visual/warna/tokens.
- Fitur histori barang masuk di bawah.
- Match-order mode (opsional: dihapus karena ribet, atau disembunyikan di collapsible "mode lama"). **Default rencana: dihapus** untuk mengurangi clutter.

## Konfirmasi
Match-order mode (paste teks WA lalu bandingkan) — **dihapus** atau **dipertahankan sebagai mode terpisah**?