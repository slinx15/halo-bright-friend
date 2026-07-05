
-- Fix products policies: drop restrictive, recreate as permissive
DROP POLICY IF EXISTS "Admin can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;

CREATE POLICY "Admin can manage products" ON public.products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT USING (true);

-- Fix prices policies
DROP POLICY IF EXISTS "Admin can manage prices" ON public.prices;
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;

CREATE POLICY "Admin can manage prices" ON public.prices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read prices" ON public.prices FOR SELECT USING (true);

-- Fix stock policies
DROP POLICY IF EXISTS "Admin can manage stock" ON public.stock;
DROP POLICY IF EXISTS "Authenticated can read stock" ON public.stock;

CREATE POLICY "Admin can manage stock" ON public.stock FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can read stock" ON public.stock FOR SELECT USING (true);
