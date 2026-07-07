CREATE OR REPLACE FUNCTION public.delete_stock_in_transaction(p_stock_in_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.stock_in%ROWTYPE;
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
  FROM public.stock_in
  WHERE id = p_stock_in_id
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

  IF v_stock_id IS NULL THEN
    RAISE EXCEPTION 'Stok produk tidak ditemukan';
  END IF;

  IF COALESCE(v_current_jumlah, 0) < COALESCE(v_item.qty, 0) THEN
    RAISE EXCEPTION 'Stok sekarang lebih kecil dari transaksi yang dibatalkan';
  END IF;

  v_new_jumlah := COALESCE(v_current_jumlah, 0) - COALESCE(v_item.qty, 0);
  v_new_stacks := public.deduct_int_jsonb_stacks(v_current_stacks, v_item.qty);

  UPDATE public.stock
  SET
    jumlah = v_new_jumlah,
    tumpukan_detail = v_new_stacks,
    updated_at = now()
  WHERE id = v_stock_id;

  DELETE FROM public.stock_in
  WHERE id = p_stock_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_stock_in_id,
    'stock_id', v_stock_id,
    'old_jumlah', v_current_jumlah,
    'new_jumlah', v_new_jumlah,
    'new_tumpukan_detail', v_new_stacks
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_stock_in_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_stock_in_transaction(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';