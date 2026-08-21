CREATE OR REPLACE FUNCTION public.is_guest_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

CREATE POLICY "Guests can read products" ON public.products FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read prices" ON public.prices FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read stock" ON public.stock FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read aliases" ON public.product_aliases FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read stock_in" ON public.stock_in FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read stock_out" ON public.stock_out FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read opname" ON public.stock_opname_log FOR SELECT TO authenticated USING (public.is_guest_viewer());
CREATE POLICY "Guests can read shopee listings" ON public.shopee_listings FOR SELECT TO authenticated USING (public.is_guest_viewer());