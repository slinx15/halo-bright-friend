
-- Fix: Remove overly permissive SELECT policy on prices table
-- This exposes harga_modal (cost price) to all authenticated users
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;

-- Create a restrictive policy: only admin can read prices (including harga_modal)
-- Non-admin users should not access cost/margin data
CREATE POLICY "Admin can read all prices"
  ON public.prices
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
