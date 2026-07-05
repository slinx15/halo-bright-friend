-- Batasi baca histori transaksi hanya untuk admin
DROP POLICY IF EXISTS "Authenticated can read stock_out" ON public.stock_out;
DROP POLICY IF EXISTS "Authenticated can read stock_in" ON public.stock_in;
DROP POLICY IF EXISTS "Authenticated can read opname" ON public.stock_opname_log;

CREATE POLICY "Admin can read stock_out"
  ON public.stock_out FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can read stock_in"
  ON public.stock_in FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can read opname"
  ON public.stock_opname_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));