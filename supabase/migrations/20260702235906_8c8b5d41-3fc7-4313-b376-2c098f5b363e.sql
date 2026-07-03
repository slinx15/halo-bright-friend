CREATE OR REPLACE FUNCTION public.has_inventory_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('admin'::app_role, 'karyawan'::app_role)
    );
$$;

DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Inventory roles can read products"
ON public.products
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can read stock" ON public.stock;
CREATE POLICY "Inventory roles can read stock"
ON public.stock
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;
CREATE POLICY "Inventory roles can read prices"
ON public.prices
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can read stock_in" ON public.stock_in;
CREATE POLICY "Inventory roles can read stock_in"
ON public.stock_in
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can insert stock_in" ON public.stock_in;
CREATE POLICY "Inventory roles can insert stock_in"
ON public.stock_in
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND public.has_inventory_access((select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can read stock_out" ON public.stock_out;
CREATE POLICY "Inventory roles can read stock_out"
ON public.stock_out
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can insert stock_out" ON public.stock_out;
CREATE POLICY "Inventory roles can insert stock_out"
ON public.stock_out
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND public.has_inventory_access((select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can read opname" ON public.stock_opname_log;
CREATE POLICY "Inventory roles can read opname"
ON public.stock_opname_log
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated can insert opname" ON public.stock_opname_log;
CREATE POLICY "Inventory roles can insert opname"
ON public.stock_opname_log
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND public.has_inventory_access((select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can read aliases" ON public.product_aliases;
CREATE POLICY "Inventory roles can read aliases"
ON public.product_aliases
FOR SELECT
TO authenticated
USING (public.has_inventory_access((select auth.uid())));

ALTER TABLE public.stock_out
  ADD COLUMN IF NOT EXISTS stock_jumlah_before integer,
  ADD COLUMN IF NOT EXISTS stock_tumpukan_before jsonb;

CREATE OR REPLACE FUNCTION public.build_default_tumpukan_detail(p_kode text, p_qty integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_qty integer := GREATEST(COALESCE(p_qty, 0), 0);
  v_batch integer := CASE
    WHEN upper(COALESCE(p_kode, '')) LIKE '%BLK%'
      OR upper(COALESCE(p_kode, '')) LIKE '%BLCK%'
      OR upper(COALESCE(p_kode, '')) LIKE '%WHT%'
      OR upper(COALESCE(p_kode, '')) LIKE '%PUTIH%'
      OR upper(COALESCE(p_kode, '')) LIKE '%HITAM%'
      OR upper(COALESCE(p_kode, '')) LIKE '%BLACK%'
      OR upper(COALESCE(p_kode, '')) LIKE '%WHITE%'
      THEN 50
    ELSE 25
  END;
  v_values integer[] := '{}';
  v_remainder integer;
BEGIN
  IF v_qty <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  WHILE v_qty >= v_batch LOOP
    v_values := array_append(v_values, v_batch);
    v_qty := v_qty - v_batch;
  END LOOP;

  v_remainder := v_qty;
  IF v_remainder > 0 THEN
    v_values := array_append(v_values, v_remainder);
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
    FROM unnest(v_values) AS value
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_stock_out(
  p_product_id uuid,
  p_qty_pesan integer,
  p_qty_kirim integer,
  p_harga_type text,
  p_harga_satuan integer,
  p_catatan text DEFAULT NULL,
  p_toko text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stock_id uuid;
  v_current_jumlah integer;
  v_current_stacks jsonb;
  v_new_jumlah integer;
  v_new_stacks jsonb;
  v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_qty_kirim IS NULL OR p_qty_kirim <= 0 THEN
    RAISE EXCEPTION 'Qty kirim harus lebih dari 0';
  END IF;
  IF p_harga_satuan IS NULL OR p_harga_satuan < 0 THEN
    RAISE EXCEPTION 'Harga tidak valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND is_active = true) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau nonaktif';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT id, jumlah, tumpukan_detail
  INTO v_stock_id, v_current_jumlah, v_current_stacks
  FROM public.stock
  WHERE product_id = p_product_id
  FOR UPDATE;

  v_current_jumlah := COALESCE(v_current_jumlah, 0);
  v_current_stacks := COALESCE(v_current_stacks, '[]'::jsonb);

  IF p_qty_kirim > v_current_jumlah THEN
    RAISE EXCEPTION 'Stok tidak cukup (sisa %)', v_current_jumlah;
  END IF;

  v_new_jumlah := v_current_jumlah - p_qty_kirim;
  v_new_stacks := public.deduct_int_jsonb_stacks(v_current_stacks, p_qty_kirim);

  INSERT INTO public.stock_out (
    product_id, qty_pesan, qty_kirim, harga_type, harga_satuan,
    total_harga, catatan, toko, user_id, created_at,
    stock_jumlah_before, stock_tumpukan_before
  )
  VALUES (
    p_product_id,
    COALESCE(p_qty_pesan, 0),
    p_qty_kirim,
    COALESCE(NULLIF(p_harga_type, ''), 'normal'),
    p_harga_satuan,
    p_harga_satuan * p_qty_kirim,
    NULLIF(p_catatan, ''),
    COALESCE(p_toko, ''),
    v_user_id,
    COALESCE(p_created_at, now()),
    v_current_jumlah,
    v_current_stacks
  )
  RETURNING id INTO v_transaction_id;

  IF v_stock_id IS NULL THEN
    INSERT INTO public.stock (product_id, jumlah, tumpukan_detail)
    VALUES (p_product_id, v_new_jumlah, v_new_stacks)
    RETURNING id INTO v_stock_id;
  ELSE
    UPDATE public.stock
    SET jumlah = v_new_jumlah, tumpukan_detail = v_new_stacks
    WHERE id = v_stock_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'stock_id', v_stock_id,
    'new_jumlah', v_new_jumlah,
    'new_tumpukan_detail', v_new_stacks
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stock_out_transaction(p_stock_out_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.stock_out%ROWTYPE;
  v_stock_id uuid;
  v_current_jumlah integer;
  v_current_stacks jsonb;
  v_new_jumlah integer;
  v_new_stacks jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT *
  INTO v_item
  FROM public.stock_out
  WHERE id = p_stock_out_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_item.product_id::text));

  SELECT id, jumlah, tumpukan_detail
  INTO v_stock_id, v_current_jumlah, v_current_stacks
  FROM public.stock
  WHERE product_id = v_item.product_id
  FOR UPDATE;

  IF v_item.stock_jumlah_before IS NOT NULL AND v_item.stock_tumpukan_before IS NOT NULL THEN
    v_new_jumlah := v_item.stock_jumlah_before;
    v_new_stacks := COALESCE(v_item.stock_tumpukan_before, '[]'::jsonb);
  ELSE
    v_new_jumlah := COALESCE(v_current_jumlah, 0) + COALESCE(v_item.qty_kirim, 0);
    v_new_stacks := public.sort_int_jsonb_array(
      COALESCE(v_current_stacks, '[]'::jsonb) || jsonb_build_array(COALESCE(v_item.qty_kirim, 0))
    );
  END IF;

  IF v_stock_id IS NULL THEN
    INSERT INTO public.stock (product_id, jumlah, tumpukan_detail)
    VALUES (v_item.product_id, v_new_jumlah, v_new_stacks)
    RETURNING id INTO v_stock_id;
  ELSE
    UPDATE public.stock
    SET jumlah = v_new_jumlah, tumpukan_detail = v_new_stacks
    WHERE id = v_stock_id;
  END IF;

  DELETE FROM public.stock_out WHERE id = p_stock_out_id;

  RETURN jsonb_build_object(
    'success', true,
    'stock_id', v_stock_id,
    'new_jumlah', v_new_jumlah,
    'new_tumpukan_detail', v_new_stacks
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_upsert_products(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row jsonb;
  v_kode text;
  v_kategori text;
  v_modal integer;
  v_normal integer;
  v_grosir integer;
  v_stok integer;
  v_product_id uuid;
  v_existing boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_total integer := 0;
  v_tumpukan jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Rows payload must be an array';
  END IF;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(p_rows) AS value
  LOOP
    v_kode := upper(trim(COALESCE(v_row->>'kode', '')));
    v_kategori := NULLIF(trim(COALESCE(v_row->>'kategori', '')), '');
    v_modal := GREATEST(COALESCE((v_row->>'modal')::integer, 0), 0);
    v_normal := GREATEST(COALESCE((v_row->>'normal')::integer, 0), 0);
    v_grosir := GREATEST(COALESCE((v_row->>'grosir')::integer, 0), 0);
    v_stok := GREATEST(COALESCE((v_row->>'stok')::integer, 0), 0);

    IF v_kode = '' THEN
      RAISE EXCEPTION 'Kode produk wajib diisi';
    END IF;

    SELECT id
    INTO v_product_id
    FROM public.products
    WHERE kode = v_kode
      AND COALESCE(kategori, '') = COALESCE(v_kategori, '')
    LIMIT 1;

    v_existing := v_product_id IS NOT NULL;

    IF v_existing THEN
      UPDATE public.products
      SET nama = v_kode,
          kategori = COALESCE(v_kategori, ''),
          is_active = true,
          updated_at = now()
      WHERE id = v_product_id;

      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.products (kode, nama, kategori, is_active)
      VALUES (v_kode, v_kode, COALESCE(v_kategori, ''), true)
      RETURNING id INTO v_product_id;

      v_inserted := v_inserted + 1;
    END IF;

    INSERT INTO public.prices (product_id, harga_modal, harga_normal, harga_grosir)
    VALUES (v_product_id, v_modal, v_normal, v_grosir)
    ON CONFLICT (product_id) DO UPDATE
    SET harga_modal = EXCLUDED.harga_modal,
        harga_normal = EXCLUDED.harga_normal,
        harga_grosir = EXCLUDED.harga_grosir,
        updated_at = now();

    v_tumpukan := public.build_default_tumpukan_detail(v_kode, v_stok);

    INSERT INTO public.stock (product_id, jumlah, tumpukan, tumpukan_detail)
    VALUES (
      v_product_id,
      v_stok,
      public.jsonb_stack_text(v_tumpukan),
      v_tumpukan
    )
    ON CONFLICT (product_id) DO UPDATE
    SET jumlah = EXCLUDED.jumlah,
        tumpukan = EXCLUDED.tumpukan,
        tumpukan_detail = EXCLUDED.tumpukan_detail,
        updated_at = now();

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'totalInserted', v_total,
    'insertedCount', v_inserted,
    'updatedCount', v_updated
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products(jsonb) TO authenticated;