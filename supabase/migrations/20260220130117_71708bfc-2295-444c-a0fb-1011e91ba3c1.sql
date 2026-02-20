
-- Drop existing restrictive policies and recreate as permissive

-- PRODUCTS
DROP POLICY IF EXISTS "Admin can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;

CREATE POLICY "Admin can manage products" ON public.products FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT TO authenticated USING (true);

-- PRICES
DROP POLICY IF EXISTS "Admin can manage prices" ON public.prices;
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;

CREATE POLICY "Admin can manage prices" ON public.prices FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read prices" ON public.prices FOR SELECT TO authenticated USING (true);

-- STOCK
DROP POLICY IF EXISTS "Admin can manage stock" ON public.stock;
DROP POLICY IF EXISTS "Authenticated can read stock" ON public.stock;

CREATE POLICY "Admin can manage stock" ON public.stock FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read stock" ON public.stock FOR SELECT TO authenticated USING (true);
