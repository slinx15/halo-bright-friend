

# Perbaikan Import Massal yang Stuck di 10%

## Masalah yang Ditemukan

1. **UNIQUE constraint pada kolom `kode`**: Tabel `products` memiliki constraint `products_kode_key` yang mencegah kode duplikat. Jika ada kode yang sama dalam batch atau sudah ada di database, seluruh insert gagal dan request bisa hang.
2. **Batch terlalu besar**: Mengirim 183 baris sekaligus dalam satu API call bisa menyebabkan timeout.
3. **Error handling kurang**: Jika insert gagal, tidak ada feedback yang jelas ke user.

## Solusi

### 1. Pecah batch menjadi chunk kecil (maks 50 per request)
- Alih-alih insert 183 produk sekaligus, pecah menjadi batch 50 produk
- Progress bar akan update secara bertahap per chunk

### 2. Validasi duplikat sebelum insert
- Cek kode duplikat dalam data yang di-paste (duplikat internal)
- Cek kode yang sudah ada di database sebelum insert
- Tampilkan pesan error yang jelas jika ada duplikat

### 3. Perbaiki error handling
- Tambahkan timeout protection
- Tampilkan error spesifik (misalnya "Kode X sudah ada")
- Reset state dengan benar jika gagal

## Detail Teknis

File yang diubah: `src/components/produk/BulkInputDialog.tsx`

Perubahan pada fungsi `handleSubmit`:

```
1. Cek duplikat internal (kode yang sama dalam data paste)
2. Query database untuk cek kode yang sudah ada
3. Filter hanya kode baru yang belum ada
4. Pecah menjadi chunk @50 baris
5. Insert per chunk dengan progress update bertahap
6. Insert prices dan stock per chunk
7. Error handling per chunk (lanjut ke chunk berikutnya jika ada error)
```

Progress bar akan menunjukkan persentase yang lebih akurat berdasarkan jumlah chunk yang sudah diproses.

