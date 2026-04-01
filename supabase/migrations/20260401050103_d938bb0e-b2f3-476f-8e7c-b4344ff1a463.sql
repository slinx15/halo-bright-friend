
-- Update WHT: 6956 → 5544
UPDATE prices SET harga_modal = 5544, updated_at = now()
WHERE product_id = '689c7e7a-3367-416d-9dee-aa8d96e11833';

-- Update BLCK: 6956 → 6424
UPDATE prices SET harga_modal = 6424, updated_at = now()
WHERE product_id = '417c6282-831b-4bab-ad12-cfd7a4306520';

-- Update semua warna lainnya: 6956 → 7770
UPDATE prices SET harga_modal = 7770, updated_at = now()
WHERE product_id IN (
  SELECT p.id FROM products p
  WHERE p.is_active = true
    AND UPPER(p.kode) NOT LIKE '%WHT%'
    AND UPPER(p.kode) NOT LIKE '%BLCK%'
    AND UPPER(p.kode) NOT LIKE '%BLK%'
);
