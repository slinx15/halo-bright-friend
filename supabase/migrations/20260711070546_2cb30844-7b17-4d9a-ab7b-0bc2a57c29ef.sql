CREATE OR REPLACE FUNCTION public.build_default_tumpukan_detail(p_kode text, p_qty integer, p_kategori text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty integer := GREATEST(COALESCE(p_qty, 0), 0);
  v_kat text := upper(COALESCE(p_kategori, ''));
  v_batch integer := CASE
    WHEN v_kat = '8 ONS' THEN 15
    WHEN v_kat = '5 ONS' THEN 32
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
$function$;

CREATE OR REPLACE FUNCTION public.bulk_upsert_products(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    v_tumpukan := public.build_default_tumpukan_detail(v_kode, v_stok, v_kategori);

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
$function$;