
-- Restrict Ivory debt tables to admin-only (service_role bypasses RLS)
DROP POLICY IF EXISTS "Authenticated can read ivory_debts" ON public.ivory_debts;
DROP POLICY IF EXISTS "Authenticated can insert ivory_debts" ON public.ivory_debts;
DROP POLICY IF EXISTS "Authenticated can update ivory_debts" ON public.ivory_debts;
DROP POLICY IF EXISTS "Authenticated can delete ivory_debts" ON public.ivory_debts;

CREATE POLICY "Admins manage ivory_debts" ON public.ivory_debts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can read ivory_debt_payments" ON public.ivory_debt_payments;
DROP POLICY IF EXISTS "Authenticated can insert ivory_debt_payments" ON public.ivory_debt_payments;
DROP POLICY IF EXISTS "Authenticated can delete ivory_debt_payments" ON public.ivory_debt_payments;

CREATE POLICY "Admins manage ivory_debt_payments" ON public.ivory_debt_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can read ivory_debt_settings" ON public.ivory_debt_settings;
DROP POLICY IF EXISTS "Authenticated can insert ivory_debt_settings" ON public.ivory_debt_settings;
DROP POLICY IF EXISTS "Authenticated can update ivory_debt_settings" ON public.ivory_debt_settings;

CREATE POLICY "Admins manage ivory_debt_settings" ON public.ivory_debt_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can read ivory_debt_snapshots" ON public.ivory_debt_snapshots;
DROP POLICY IF EXISTS "Authenticated can insert ivory_debt_snapshots" ON public.ivory_debt_snapshots;
DROP POLICY IF EXISTS "Authenticated can delete ivory_debt_snapshots" ON public.ivory_debt_snapshots;

CREATE POLICY "Admins manage ivory_debt_snapshots" ON public.ivory_debt_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
