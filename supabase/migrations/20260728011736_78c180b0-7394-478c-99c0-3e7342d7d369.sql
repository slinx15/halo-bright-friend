CREATE OR REPLACE FUNCTION public.build_default_tumpukan_detail(p_kode text, p_qty integer, p_kategori text DEFAULT NULL::text)
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
    WHEN v_kat = '4 ONS' THEN 32
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