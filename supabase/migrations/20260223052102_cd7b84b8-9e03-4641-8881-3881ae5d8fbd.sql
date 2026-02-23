
-- Fix prices: drop overly permissive policy and recreate with auth check
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;
CREATE POLICY "Authenticated can read prices"
ON public.prices
FOR SELECT
TO authenticated
USING (true);

-- Fix stock_out: drop overly permissive policy and recreate with auth check
DROP POLICY IF EXISTS "Authenticated can read stock_out" ON public.stock_out;
CREATE POLICY "Authenticated can read stock_out"
ON public.stock_out
FOR SELECT
TO authenticated
USING (true);
