ALTER TABLE products DROP CONSTRAINT IF EXISTS products_kode_key;
ALTER TABLE products ADD CONSTRAINT products_kode_kategori_unique UNIQUE (kode, kategori);