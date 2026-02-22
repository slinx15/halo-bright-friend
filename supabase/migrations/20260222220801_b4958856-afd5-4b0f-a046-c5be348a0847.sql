-- Add permissive SELECT policy for all authenticated users on prices
-- Karyawan need to see sales prices (harga_normal, harga_grosir) for transactions
-- harga_modal visibility is controlled at the application level
CREATE POLICY "Authenticated can read prices"
ON public.prices
FOR SELECT
USING (true);