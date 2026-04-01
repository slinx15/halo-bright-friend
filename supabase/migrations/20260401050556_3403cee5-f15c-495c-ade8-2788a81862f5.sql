
-- Add new column harga_grosir2
ALTER TABLE prices ADD COLUMN harga_grosir2 integer NOT NULL DEFAULT 0;

-- Update warna products: normal=9000, grosir=8500, grosir2=8750
UPDATE prices SET 
  harga_normal = 9000, 
  harga_grosir = 8500, 
  harga_grosir2 = 8750, 
  updated_at = now()
WHERE product_id IN (
  SELECT p.id FROM products p
  WHERE p.is_active = true
    AND UPPER(p.kode) NOT LIKE '%WHT%'
    AND UPPER(p.kode) NOT LIKE '%BLCK%'
    AND UPPER(p.kode) NOT LIKE '%BLK%'
);
