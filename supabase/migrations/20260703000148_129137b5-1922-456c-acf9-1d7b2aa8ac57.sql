CREATE OR REPLACE FUNCTION public.build_default_tumpukan_detail(p_kode text, p_qty integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.build_default_tumpukan_detail(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_default_tumpukan_detail(text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_inventory_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_inventory_access(uuid) TO authenticated;