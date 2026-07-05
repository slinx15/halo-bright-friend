# Audit Report
## Ringkasan
- Critical: 3
- High: 6
- Medium: 7
- Low / Nice-to-have: 4

## 🔴 Critical (harus segera)
- [supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:158](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:158), [:162](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:162), [:166](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:166), [:170](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:170), [:175](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:175), [:180](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:180)  
  RLS read policy untuk `products`, `stock`, `prices`, `stock_in`, `stock_out`, dan `stock_opname_log` semuanya `USING (true)` untuk role `authenticated`. Dampak nyata: akun user biasa bisa membaca seluruh stok, modal, transaksi keluar, dan histori opname seluruh toko, sehingga kebocoran data operasional dan harga modal terjadi lintas user.  
  Saran fix: ubah policy menjadi scope per user/tenant atau minimal role-based read yang eksplisit.  
  Effort: M

- [supabase/functions/import-sales-history/index.ts:133](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:133), [:148](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:148), [:260](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:260)  
  Edge Function `import-sales-history` hanya memverifikasi bahwa request berasal dari user login, tetapi tidak melakukan cek role admin sebelum mengimpor histori penjualan dan mengurangi stok melalui `register_stock_out`. Dampak nyata: user non-admin bisa mengubah histori penjualan dan stok massal hanya dengan memanggil function ini.  
  Saran fix: tambahkan guard role admin di awal function sebelum fetch data maupun proses import.  
  Effort: S

- [supabase/functions/import-sales-history/index.ts:177](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:177), [:186](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:186), [:195](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:195), [:206](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:206), [:265](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:265)  
  Mapping histori penjualan hanya memakai `kode` dan secara eksplisit memprioritaskan produk kategori `2 Ons`. Dampak nyata: bila kode yang sama ada di beberapa kategori/ukuran, import histori bisa masuk ke produk yang salah lalu mengurangi stok ukuran yang salah. Ini berisiko merusak stok dan analytics lintas kategori.  
  Saran fix: wajibkan matching `kode + kategori/ukuran`, atau tolak import yang ambigu.  
  Effort: M

## 🟠 High
- [src/lib/analysisFeatures.ts:312](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:312), [:332](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:332), [:346](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:346), [:391](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:391), [:393](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:393)  
  Perhitungan profit dan `totalNilai` toko memakai `harga_normal` master produk, bukan harga transaksi aktual (`harga_satuan` / `harga_type`). Dampak nyata: profit, omzet per toko, dan ranking pelanggan menjadi salah untuk transaksi `grosir`, `grosir2`, atau custom price.  
  Saran fix: gunakan nilai dari transaksi (`harga_satuan`, `total_harga`, `harga_type`) sebagai source of truth untuk analytics penjualan.  
  Effort: M

- [src/lib/analysisFeatures.ts:423](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:423), [:445](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:445), [:452](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:452)  
  `calcBudgetEstimates` masih menghitung target stok dari `vel * targetDays` langsung, bukan memakai core restock formula yang sudah dipakai engine utama (`cycle + safety + lead time`). Dampak nyata: Budget Mode bisa menghasilkan rekomendasi berbeda dari engine restock utama, sehingga angka analisa antar fitur berpotensi drift lagi.  
  Saran fix: satu-satukan budget calculation ke helper inti yang sama dengan restock engine.  
  Effort: M

- [supabase/functions/ai-chat/index.ts:189](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:189), [:246](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:246), [:262](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:262), [:371](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:371), [:708](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:708), [:773](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:773)  
  `ai-chat` mengirim detail penjualan per toko per tanggal, preferensi harga pelanggan, dan daftar seluruh produk beserta modal/harga jual ke gateway AI pihak ketiga pada setiap chat. Dampak nyata: eksposur data sensitif bisnis jauh lebih luas dari yang dibutuhkan untuk menjawab banyak pertanyaan user, dan menambah risiko kebocoran data operasional.  
  Saran fix: minimalkan context sesuai intent, redaksi data sensitif, dan kirim hanya subset yang relevan.  
  Effort: L

- [supabase/functions/bulk-import/index.ts:79](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/bulk-import/index.ts:79), [:102](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/bulk-import/index.ts:102), [:121](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/bulk-import/index.ts:121), [:143](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/bulk-import/index.ts:143), [supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:27](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:27)  
  Bulk import menduplikasi logic `kode + kategori`, tetapi tabel `products` masih punya unique constraint global pada `kode`. Selain itu insert `products`, `prices`, dan `stock` dijalankan terpisah tanpa transaksi. Dampak nyata: import bisa gagal parsial, meninggalkan produk tanpa harga/stock, dan ukuran berbeda dengan kode sama tetap akan mentok di database.  
  Saran fix: sinkronkan constraint schema dengan business rule, lalu bungkus insert batch dalam transaksi atomik.  
  Effort: L

- [src/hooks/useAuth.tsx:25](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAuth.tsx:25), [:29](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAuth.tsx:29), [supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:10](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260219094413_476f8d0e-7344-4f66-b69a-4ba2c5781727.sql:10)  
  Hook auth membaca role dengan `.maybeSingle()`, padahal schema memperbolehkan lebih dari satu role per user (`UNIQUE (user_id, role)`, bukan unique per `user_id`). Dampak nyata: bila satu user punya lebih dari satu role row, fetch role bisa error atau menghasilkan state auth yang tidak konsisten.  
  Saran fix: putuskan model role tunggal vs multi-role, lalu sesuaikan query dan tipe state auth.  
  Effort: M

- [supabase/migrations/20260521000200_stock_mutation_rpc.sql:279](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260521000200_stock_mutation_rpc.sql:279), [:280](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260521000200_stock_mutation_rpc.sql:280), [:287](C:/Users/Administrator/halo-bright-friend-review/supabase/migrations/20260521000200_stock_mutation_rpc.sql:287)  
  Saat `delete_stock_out_transaction` mengembalikan stok, function hanya menambahkan `qty_kirim` sebagai satu stack baru ke `tumpukan_detail`, bukan memulihkan distribusi stack asli sebelum transaksi keluar. Dampak nyata: data stack per cone/per tumpukan akan drift dari kondisi fisik setelah delete/edit transaksi berulang.  
  Saran fix: simpan snapshot stack yang dipakai saat stock out, lalu restore snapshot itu saat rollback/delete.  
  Effort: L

## 🟡 Medium
- [supabase/functions/ai-insights/index.ts:36](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-insights/index.ts:36), [:95](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-insights/index.ts:95), [:109](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-insights/index.ts:109), [src/lib/stockAnalyticsEngine.ts:246](C:/Users/Administrator/halo-bright-friend-review/src/lib/stockAnalyticsEngine.ts:246), [:286](C:/Users/Administrator/halo-bright-friend-review/src/lib/stockAnalyticsEngine.ts:286)  
  Konsistensi timezone WIB belum seragam. `ai-insights` mengelompokkan hari pakai `created_at.slice(0, 10)` mentah, sementara engine utama banyak tempat sudah menambah offset WIB; fungsi trend/dead stock juga masih memakai `new Date(s.created_at)` langsung. Dampak nyata: produk dekat pergantian hari bisa masuk hari/periode yang berbeda antar fitur.  
  Saran fix: standarkan helper tanggal WIB tunggal dan pakai di semua analytics/query grouping.  
  Effort: M

- [src/lib/analysisFeatures.ts:120](C:/Users/Administrator/halo-bright-friend-review/src/lib/analysisFeatures.ts:120), [src/lib/stockAnalyticsEngine.ts:294](C:/Users/Administrator/halo-bright-friend-review/src/lib/stockAnalyticsEngine.ts:294)  
  Jika `harga_modal` kosong, sistem fallback ke `7000`. Dampak nyata: nilai stok, budget restock, dead stock value, dan profit bisa terlihat valid padahal sebenarnya memakai angka buatan. Ini berbahaya untuk keputusan belanja.  
  Saran fix: perlakukan harga modal kosong sebagai data invalid yang harus ditandai, bukan diisi angka default.  
  Effort: S

- [supabase/functions/review-restock/index.ts:180](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/review-restock/index.ts:180), [:184](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/review-restock/index.ts:184), [supabase/functions/ai-chat/index.ts:190](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:190), [:191](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:191), [supabase/functions/ai-insights/index.ts:96](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-insights/index.ts:96)  
  Beberapa edge function analytics masih memakai `.limit(5000)` / `.limit(2000)` tanpa pagination. Dampak nyata: pada toko yang transaksinya tinggi, velocity, review restock, insight AI, dan daily summary akan diam-diam dihitung dari data terpotong.  
  Saran fix: implementasikan pagination/streaming penuh atau agregasi SQL di server.  
  Effort: M

- [supabase/functions/ocr-nota/index.ts:33](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ocr-nota/index.ts:33), [:130](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ocr-nota/index.ts:130), [supabase/functions/voice-opname/index.ts:45](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/voice-opname/index.ts:45), [:88](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/voice-opname/index.ts:88)  
  Endpoint OCR dan voice menerima `image_base64` / `audio_base64` tanpa batas ukuran, durasi, atau validasi payload yang ketat. Dampak nyata: user bisa mengirim payload sangat besar yang menaikkan biaya AI gateway, memperlambat function, atau memicu timeout/DoS.  
  Saran fix: batasi ukuran request, tipe file, durasi audio, dan tolak payload di atas threshold.  
  Effort: S

- [supabase/functions/public-stock/index.ts:28](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/public-stock/index.ts:28), [:33](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/public-stock/index.ts:33)  
  `public-stock` memakai `SUPABASE_SERVICE_ROLE_KEY` untuk query yang sebenarnya sudah bisa diakses user terautentikasi melalui RLS. Dampak nyata: bila ada bug auth atau perubahan endpoint di masa depan, function ini punya blast radius lebih besar dari yang diperlukan.  
  Saran fix: gunakan client user-scoped biasa kecuali memang butuh bypass RLS.  
  Effort: S

- [src/hooks/useAiConversations.ts:64](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAiConversations.ts:64), [:67](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAiConversations.ts:67), [src/hooks/useAiMemories.ts:45](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAiMemories.ts:45), [:48](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAiMemories.ts:48), [:49](C:/Users/Administrator/halo-bright-friend-review/src/hooks/useAiMemories.ts:49)  
  Flow AI memory/conversation belum robust: save message dan update `updated_at` tidak atomik, sedangkan `extractMemories` menelan error secara diam-diam dan hanya reload pakai `setTimeout`. Dampak nyata: urutan chat bisa tidak sinkron, memori bisa gagal tersimpan tanpa sinyal ke user, dan debugging jadi sulit.  
  Saran fix: satukan write path yang atomik dan tampilkan error state yang bisa ditindaklanjuti.  
  Effort: M

- [supabase/functions/import-sales-history/index.ts:217](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:217), [:219](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:219), [:296](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:296), [:324](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/import-sales-history/index.ts:324)  
  Jika parsing tanggal CSV gagal, histori penjualan diam-diam di-set ke `new Date()` sekarang. Dampak nyata: import backdated yang formatnya salah tidak gagal, tetapi mencampurkan transaksi lampau ke hari ini dan merusak laporan harian, repeat customer, serta velocity.  
  Saran fix: treat parse failure sebagai validation error per row, jangan fallback ke waktu sekarang.  
  Effort: S

## 🟢 Low / Nice-to-have
- [supabase/functions/review-restock/index.ts:190](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/review-restock/index.ts:190), [:287](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/review-restock/index.ts:287), [:329](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/review-restock/index.ts:329), [src/lib/stockAnalyticsEngine.ts:330](C:/Users/Administrator/halo-bright-friend-review/src/lib/stockAnalyticsEngine.ts:330)  
  Ada beberapa field/variabel yang sudah tidak dipakai efektif: `stockOutAfterOrder`, `pending_qty` yang selalu `0`, dan `rawVelocity` yang tidak dipakai. Dampak nyata: membingungkan maintenance dan membuat logic lama terlihat masih aktif padahal tidak.  
  Saran fix: buang field mati atau implementasikan benar-benar bila memang dibutuhkan.  
  Effort: S

- [src/components/produk/BulkInputDialog.tsx:94](C:/Users/Administrator/halo-bright-friend-review/src/components/produk/BulkInputDialog.tsx:94), [:115](C:/Users/Administrator/halo-bright-friend-review/src/components/produk/BulkInputDialog.tsx:115), [:132](C:/Users/Administrator/halo-bright-friend-review/src/components/produk/BulkInputDialog.tsx:132), [:150](C:/Users/Administrator/halo-bright-friend-review/src/components/produk/BulkInputDialog.tsx:150), [:159](C:/Users/Administrator/halo-bright-friend-review/src/components/produk/BulkInputDialog.tsx:159)  
  Bulk import dialog masih menyisakan banyak debug log di client. Dampak nyata: console browser berisik, token/session flow lebih mudah ditebak saat troubleshooting, dan sinyal error penting tenggelam di log.  
  Saran fix: hapus debug log atau bungkus di debug flag.  
  Effort: S

- [src/pages/BarangMasuk.tsx:122](C:/Users/Administrator/halo-bright-friend-review/src/pages/BarangMasuk.tsx:122), [:137](C:/Users/Administrator/halo-bright-friend-review/src/pages/BarangMasuk.tsx:137), [src/pages/BarangKeluar.tsx:209](C:/Users/Administrator/halo-bright-friend-review/src/pages/BarangKeluar.tsx:209), [:237](C:/Users/Administrator/halo-bright-friend-review/src/pages/BarangKeluar.tsx:237)  
  Barang masuk dan keluar memproses item satu per satu secara serial. Dampak nyata: input bulk besar akan terasa lambat dan kemungkinan partial success lebih tinggi saat koneksi tidak stabil.  
  Saran fix: pertimbangkan RPC batch atau queue per transaksi agar write lebih efisien dan lebih mudah rollback.  
  Effort: M

- [supabase/functions/ai-chat/index.ts:297](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:297), [:320](C:/Users/Administrator/halo-bright-friend-review/supabase/functions/ai-chat/index.ts:320), [src/components/analisa/RepeatCustomerAnalysis.tsx:103](C:/Users/Administrator/halo-bright-friend-review/src/components/analisa/RepeatCustomerAnalysis.tsx:103), [:138](C:/Users/Administrator/halo-bright-friend-review/src/components/analisa/RepeatCustomerAnalysis.tsx:138)  
  Klasifikasi repeat customer dihitung di dua tempat berbeda: frontend memakai status `vip/at_risk/lost/new`, sedangkan `ai-chat` memakai `VIP/mulai_hilang/hilang/baru/reguler`. Dampak nyata: angka dan label pelanggan repeat bisa drift antar fitur saat salah satu rumus diubah lebih dulu.  
  Saran fix: ekstrak satu core classifier bersama yang dipakai frontend dan edge function.  
  Effort: M

## UI Notes (opsional, tidak untuk dieksekusi)
- Beberapa file audit mengandung teks mojibake/encoding rusak pada string Indonesia, terutama di `supabase/functions/ai-chat/index.ts`, `src/lib/analysisFeatures.ts`, dan `supabase/functions/ocr-nota/index.ts`. Ini bukan issue logic langsung, tetapi berpotensi menurunkan kualitas output teks dan menyulitkan maintenance.
