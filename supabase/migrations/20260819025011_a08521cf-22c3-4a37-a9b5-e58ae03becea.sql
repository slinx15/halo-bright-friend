-- 1) Keep debt amount in sync when stock_in rows are linked to a debt
CREATE OR REPLACE FUNCTION public.sync_ivory_debt_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NEW.debt_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(si.qty * COALESCE(pr.harga_modal, 0)), 0)::integer
  INTO v_total
  FROM public.stock_in si
  LEFT JOIN public.prices pr ON pr.product_id = si.product_id
  WHERE si.debt_id = NEW.debt_id;

  UPDATE public.ivory_debts
  SET amount = v_total, updated_at = now()
  WHERE id = NEW.debt_id
    AND status = 'open'
    AND amount <> v_total;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ivory_debt_amount ON public.stock_in;
CREATE TRIGGER trg_sync_ivory_debt_amount
AFTER INSERT OR UPDATE OF qty, debt_id, product_id ON public.stock_in
FOR EACH ROW
EXECUTE FUNCTION public.sync_ivory_debt_amount();

-- 2) Recompute (instead of blindly subtracting) when a stock_in is cancelled
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
  v_debt public.ivory_debts%ROWTYPE;
  v_new_total integer := 0;
  v_reduce integer := 0;
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

  SELECT kode INTO v_product_kode FROM public.products WHERE id = v_item.product_id;

  DELETE FROM public.stock_in WHERE id = p_stock_in_id;

  IF v_item.debt_id IS NOT NULL THEN
    SELECT * INTO v_debt FROM public.ivory_debts WHERE id = v_item.debt_id FOR UPDATE;

    IF v_debt.id IS NOT NULL AND v_debt.status = 'open' THEN
      SELECT COALESCE(SUM(si.qty * COALESCE(pr.harga_modal, 0)), 0)::integer
      INTO v_new_total
      FROM public.stock_in si
      LEFT JOIN public.prices pr ON pr.product_id = si.product_id
      WHERE si.debt_id = v_debt.id;

      v_reduce := GREATEST(v_debt.amount - v_new_total, 0);

      IF v_new_total <= 0 THEN
        DELETE FROM public.ivory_debts WHERE id = v_debt.id;
        v_bon_deleted := true;
        v_plafon_adjusted := true;
      ELSE
        UPDATE public.ivory_debts
        SET amount = v_new_total,
            note = regexp_replace(
              COALESCE(note, ''),
              ',\s*' || regexp_replace(COALESCE(v_product_kode, ''), '([\\.*+?()\[\]{}|^$])', '\\\1', 'g') || '\s*x' || v_item.qty::text || '\y',
              '',
              'g'
            ),
            updated_at = now()
        WHERE id = v_debt.id;
        v_plafon_adjusted := true;
      END IF;
    END IF;
  END IF;

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