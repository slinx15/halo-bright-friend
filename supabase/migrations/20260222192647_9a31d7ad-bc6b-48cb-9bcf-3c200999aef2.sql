
-- Fix prices: remove public read, only admin can access
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;

-- Admin-only read for prices
CREATE POLICY "Admin can read prices"
ON public.prices FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
