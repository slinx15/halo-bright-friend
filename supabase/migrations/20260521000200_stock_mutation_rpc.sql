CREATE OR REPLACE FUNCTION public.sort_int_jsonb_array(_arr jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(n ORDER BY n), '[]'::jsonb)
  FROM (
    SELECT CASE WHEN value ~ '^[0-9]+$' THEN value::integer END AS n
    FROM jsonb_array_elements_text(COALESCE(_arr, '[]'::jsonb)) AS e(value)
  ) parsed
  WHERE n > 0;
$$;

CREATE OR REPLACE FUNCTION public.deduct_int_jsonb_stacks(_stacks jsonb, _qty integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  remaining integer := GREATEST(COALESCE(_qty, 0), 0);
  stack_value integer;
  new_value integer;
  result integer[] := '{}';
  result_json jsonb;
BEGIN
  FOR stack_value IN
    SELECT value::integer
    FROM jsonb_array_elements_text(public.sort_int_jsonb_array(_stacks)) AS e(value)
  LOOP
    IF remaining <= 0 THEN
      result := array_append(result, stack_value);
    ELSIF stack_value <= remaining THEN
      remaining := remaining - stack_value;
    ELSE
      new_value := stack_value - remaining;
      remaining := 0;
      result := array_append(result, new_value);
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
  INTO result_json
  FROM unnest(result) AS value;

  RETURN result_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_int_array_sum(_arr jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM(n), 0)::integer
  FROM (
    SELECT CASE WHEN value ~ '^[0-9]+$' THEN value::integer END AS n
    FROM jsonb_array_elements_text(COALESCE(_arr, '[]'::jsonb)) AS e(value)
  ) parsed
  WHERE n > 0;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_stack_text(_stacks jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(value, ',' ORDER BY value::integer), '')
  FROM jsonb_array_elements_text(public.sort_int_jsonb_array(_stacks)) AS e(value);
$$;

CREATE OR REPLACE FUNCTION public.register_stock_in(
  p_product_id uuid,
  p_qty integer,
  p_tumpukan_detail jsonb DEFAULT '[]'::jsonb,
  p_catatan text DEFAULT NULL,
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
  v_new_jumlah integer;
  v_new_stacks jsonb;
  v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Qty harus lebih dari 0';
  END IF;
  IF public.jsonb_int_array_sum(p_tumpukan_detail) <> p_qty THEN
    RAISE EXCEPTION 'Total tumpukan harus sama dengan qty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND is_active = true) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau nonaktif';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  INSERT INTO public.stock_in (product_id, qty, tumpukan, catatan, user_id, created_at)
  VALUES (
    p_product_id,
    p_qty,
    public.jsonb_stack_text(p_tumpukan_detail),
    NULLIF(p_catatan, ''),
    v_user_id,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_transaction_id;

  SELECT id, jumlah, tumpukan_detail
  INTO v_stock_id, v_new_jumlah, v_new_stacks
  FROM public.stock
  WHERE product_id = p_product_id
  FOR UPDATE;

  IF v_stock_id IS NULL THEN
    v_new_stacks := public.sort_int_jsonb_array(p_tumpukan_detail);
    v_new_jumlah := p_qty;
    INSERT INTO public.stock (product_id, jumlah, tumpukan_detail)
    VALUES (p_product_id, v_new_jumlah, v_new_stacks)
    RETURNING id INTO v_stock_id;
  ELSE
    v_new_stacks := public.sort_int_jsonb_array(COALESCE(v_new_stacks, '[]'::jsonb) || COALESCE(p_tumpukan_detail, '[]'::jsonb));
    v_new_jumlah := COALESCE(v_new_jumlah, 0) + p_qty;
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

  INSERT INTO public.stock_out (
    product_id, qty_pesan, qty_kirim, harga_type, harga_satuan,
    total_harga, catatan, toko, user_id, created_at
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
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_transaction_id;

  v_new_jumlah := v_current_jumlah - p_qty_kirim;
  v_new_stacks := public.deduct_int_jsonb_stacks(v_current_stacks, p_qty_kirim);

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

  v_new_jumlah := COALESCE(v_current_jumlah, 0) + COALESCE(v_item.qty_kirim, 0);
  v_new_stacks := public.sort_int_jsonb_array(COALESCE(v_current_stacks, '[]'::jsonb) || jsonb_build_array(COALESCE(v_item.qty_kirim, 0)));

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

CREATE OR REPLACE FUNCTION public.register_stock_opname(
  p_product_id uuid,
  p_stok_fisik integer,
  p_tumpukan_detail jsonb DEFAULT '[]'::jsonb,
  p_catatan text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stock_id uuid;
  v_stok_sistem integer;
  v_new_stacks jsonb;
  v_log_id uuid;
  v_selisih integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_stok_fisik IS NULL OR p_stok_fisik < 0 THEN
    RAISE EXCEPTION 'Stok fisik tidak valid';
  END IF;
  IF public.jsonb_int_array_sum(p_tumpukan_detail) <> p_stok_fisik THEN
    RAISE EXCEPTION 'Total tumpukan harus sama dengan stok fisik';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND is_active = true) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau nonaktif';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT id, jumlah
  INTO v_stock_id, v_stok_sistem
  FROM public.stock
  WHERE product_id = p_product_id
  FOR UPDATE;

  v_stok_sistem := COALESCE(v_stok_sistem, 0);
  v_selisih := p_stok_fisik - v_stok_sistem;
  v_new_stacks := public.sort_int_jsonb_array(p_tumpukan_detail);

  INSERT INTO public.stock_opname_log (
    product_id, stok_sistem, stok_fisik, selisih, catatan, user_id, status
  )
  VALUES (
    p_product_id,
    v_stok_sistem,
    p_stok_fisik,
    v_selisih,
    NULLIF(p_catatan, ''),
    v_user_id,
    CASE WHEN v_selisih = 0 THEN 'sesuai' ELSE 'selisih' END
  )
  RETURNING id INTO v_log_id;

  IF v_stock_id IS NULL THEN
    INSERT INTO public.stock (product_id, jumlah, tumpukan_detail)
    VALUES (p_product_id, p_stok_fisik, v_new_stacks)
    RETURNING id INTO v_stock_id;
  ELSE
    UPDATE public.stock
    SET jumlah = p_stok_fisik, tumpukan_detail = v_new_stacks
    WHERE id = v_stock_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'stock_id', v_stock_id,
    'old_jumlah', v_stok_sistem,
    'new_jumlah', p_stok_fisik,
    'new_tumpukan_detail', v_new_stacks,
    'selisih', v_selisih
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_stock_in(uuid, integer, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_out(uuid, integer, integer, text, integer, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stock_out_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_opname(uuid, integer, jsonb, text) TO authenticated;
