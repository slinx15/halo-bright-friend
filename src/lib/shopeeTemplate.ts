import * as XLSX from "xlsx";

export const SHOPEE_TEMPLATE_HEADER: (string | null)[][] = [
  [
    "et_title_product_id",
    "et_title_product_name",
    "et_title_variation_id",
    "et_title_variation_name",
    "et_title_parent_sku",
    "et_title_variation_sku",
    "et_title_variation_price",
    "ps_gtin_code",
    "et_title_variation_stock",
    "ps_minimum_purchase_quantity",
    "ps_maximum_purchase_quantity",
    "ps_maximum_purchase_quantity_start_date",
    "ps_maximum_purchase_quantity_time_period",
    "ps_maximum_purchase_quantity_end_date",
    "et_title_reason"
  ],
  [
    "sales_info",
    "35b74571cd927608dc4cc2b998b916cb",
    "0",
    "208727494",
    "{\"search_condition\":{}}",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    "Kode Produk",
    "Nama Produk",
    "Kode Variasi",
    "Nama Variasi",
    "SKU Induk",
    "SKU",
    "Harga",
    "GTIN",
    "Stok",
    "Min. Jumlah Pembelian",
    "Maks. Jumlah Pembelian",
    "Maks. Jumlah Pembelian - Tanggal Mulai",
    "Maks. Jumlah Pembelian - Jumlah Hari",
    "Maks. Jumlah Pembelian - Tanggal Berakhir",
    "Alasan Gagal"
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "Wajib",
    "",
    "Wajib",
    "",
    "",
    "",
    "",
    "",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "Mohon masukkan 99 sampai 150000000 untuk harga produk. Batas harga produk termahal dibagi harga harga produk termurah: 7",
    "",
    "",
    "Min. jumlah pembelian merupakan isi dari tingkatan produk. Pembeli dapat memesan variasi yang berbeda untuk mencapai min. jumlah pembelian. Jika dikosongkan, min. jumlah pembelian akan otomatis bernilai 1. Pastikan stok lebih besar dari min. jumlah pembelian agar Pembeli dapat membuat pesanan.",
    "[Per Pesanan + Per Periode] Pengaturan ini akan membatasi Maks. jumlah pembelian yang dapat dibeli per pesanan atau per periode. Mohon masukkan input dari 1 hingga 999,999.",
    "[Hanya untuk Pengaturan Per Periode] Mohon tentukan tanggal mulai. Tanggal mulai tercepat adalah besok. Mohon masukkan format tanggal dalam YYYY-MM-DD.",
    "[Hanya untuk Pengaturan Per Periode] Batas Maks. jumlah pembelian akan berakhir (untuk tipe periode \"Tidak Berulang\") atau mulai kembali (untuk tipe periode \"Berulang\") setelah jumlah hari yang ditentukan. Mohon masukkan 1 sampai 365.",
    "[Hanya untuk Pengaturan Per Periode] Mohon masukkan tanggal dalam format YYY-MM-DD. \n\nUntuk tipe periode \"Tidak Berulang\", tanggal berakhir = tanggal mulai + jumlah hari - 1. Contoh: tanggal mulai = 2021-05-01, jumlah hari = 10 hari, tanggal berakhir = 2021-05-10. \n\nUntuk tipe periode \"Berulang\", tanggal berakhir harus kelipatan dari jumlah hari. Contoh: tanggal mulai = 2021-05-01, jumlah hari = 10 hari, jika kamu ingin pengaturan ini diulang 2x (3 periode), tanggal berakhir = 2021-05-30.",
    ""
  ]
];

export interface ShopeeExportRow {
  shopee_product_id: string;
  shopee_product_name: string;
  variation_id: string;
  variation_name: string;
  parent_sku: string | null;
  sku: string | null;
  price: string | null;
  min_qty: string | null;
  max_qty: string | null;
  stok: number;
}

export function downloadShopeeStockFile(rows: ShopeeExportRow[]) {
  const aoa: (string | number | null)[][] = SHOPEE_TEMPLATE_HEADER.map((r) => [...r]);
  rows.forEach((r) => {
    aoa.push([
      r.shopee_product_id,
      r.shopee_product_name,
      r.variation_id,
      r.variation_name,
      r.parent_sku ?? null,
      r.sku ?? null,
      r.price ?? null,
      null,
      String(r.stok),
      r.min_qty ?? null,
      r.max_qty ?? null,
      null,
      null,
      null,
      null,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `update_stok_shopee_${today}.xlsx`);
}
