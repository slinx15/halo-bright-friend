-- Add debt_id linkage
ALTER TABLE public.stock_in ADD COLUMN IF NOT EXISTS debt_id UUID;
CREATE INDEX IF NOT EXISTS idx_stock_in_debt_id ON public.stock_in(debt_id);

-- Update register_stock_in to accept optional debt_id
CREATE OR REPLACE FUNCTION public.register_stock_in(
  p_product_id uuid,
  p_qty integer,
  p_tumpukan_detail jsonb DEFAULT '[]'::jsonb,
  p_catatan text DEFAULT NULL::text,
  p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_debt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.stock_in (product_id, qty, tumpukan, catatan, user_id, created_at, debt_id)
  VALUES (
    p_product_id,
    p_qty,
    public.jsonb_stack_text(p_tumpukan_detail),
    NULLIF(p_catatan, ''),
    v_user_id,
    COALESCE(p_created_at, now()),
    p_debt_id
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
$function$;

-- Update delete_stock_in_transaction to also adjust plafon
CREATE OR REPLACE FUNCTION public.delete_stock_in_transaction(p_stock_in_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.stock_in%ROWTYPE;
  v_stock_id uuid;
  v_current_jumlah integer;
  v_current_stacks jsonb;
  v_new_jumlah integer;
  v_new_stacks jsonb;
  v_modal integer := 0;
  v_reduce integer := 0;
  v_debt public.ivory_debts%ROWTYPE;
  v_plafon_adjusted boolean := false;
  v_bon_deleted boolean := false;
  v_product_kode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_item FROM public.stock_in WHERE id = p_stock_in_id FOR UPDATE;
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
  SET jumlah = v_new_jumlah, tumpukan_detail = v_new_stacks, updated_at = now()
  WHERE id = v_stock_id;

  -- Adjust plafon supplier if linked
  IF v_item.debt_id IS NOT NULL THEN
    SELECT * INTO v_debt FROM public.ivory_debts WHERE id = v_item.debt_id FOR UPDATE;
    IF v_debt.id IS NOT NULL AND v_debt.status = 'open' THEN
      SELECT COALESCE(harga_modal, 0) INTO v_modal FROM public.prices WHERE product_id = v_item.product_id;
      SELECT kode INTO v_product_kode FROM public.products WHERE id = v_item.product_id;
      v_reduce := v_modal * v_item.qty;

      IF v_reduce > 0 THEN
        IF v_debt.amount - v_reduce <= 0 THEN
          DELETE FROM public.ivory_debts WHERE id = v_debt.id;
          v_bon_deleted := true;
          v_plafon_adjusted := true;
        ELSE
          UPDATE public.ivory_debts
          SET amount = amount - v_reduce,
              note = regexp_replace(
                COALESCE(note, ''),
                ',\s*' || regexp_replace(COALESCE(v_product_kode, ''), '([\\.*+?()\[\]{}|^$])', '\\\1', 'g') || '\s*x' || v_item.qty::text || '\b',
                '',
                'g'
              ),
              updated_at = now()
          WHERE id = v_debt.id;
          v_plafon_adjusted := true;
        END IF;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.stock_in WHERE id = p_stock_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_stock_in_id,
    'stock_id', v_stock_id,
    'old_jumlah', v_current_jumlah,
    'new_jumlah', v_new_jumlah,
    'new_tumpukan_detail', v_new_stacks,
    'plafon_adjusted', v_plafon_adjusted,
    'plafon_reduced_by', v_reduce,
    'bon_deleted', v_bon_deleted
  );
END;
$function$;