
-- 1. Restrict SELECT policies to authenticated only
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products" ON public.products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read aliases" ON public.product_aliases;
CREATE POLICY "Authenticated can read aliases" ON public.product_aliases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read stock" ON public.stock;
CREATE POLICY "Authenticated can read stock" ON public.stock
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read stock_in" ON public.stock_in;
CREATE POLICY "Authenticated can read stock_in" ON public.stock_in
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read opname" ON public.stock_opname_log;
CREATE POLICY "Authenticated can read opname" ON public.stock_opname_log
  FOR SELECT TO authenticated USING (true);

-- 2. Tighten restock_plans policies (also restrict to authenticated and add WITH CHECK on update)
DROP POLICY IF EXISTS "Users can read own plans" ON public.restock_plans;
DROP POLICY IF EXISTS "Users can insert own plans" ON public.restock_plans;
DROP POLICY IF EXISTS "Users can update own plans" ON public.restock_plans;
DROP POLICY IF EXISTS "Users can delete own plans" ON public.restock_plans;

CREATE POLICY "Users can read own plans" ON public.restock_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans" ON public.restock_plans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON public.restock_plans
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own plans" ON public.restock_plans
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Revoke EXECUTE from anon (and PUBLIC) on SECURITY DEFINER + helper functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_stock_out_transaction(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_stock_in(uuid, integer, jsonb, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_stock_out(uuid, integer, integer, text, integer, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_stock_opname(uuid, integer, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_stock_audit() FROM PUBLIC, anon, authenticated;

-- 4. Set fixed search_path on helper functions to remove mutable search_path warning
ALTER FUNCTION public.deduct_int_jsonb_stacks(jsonb, integer) SET search_path = public;
ALTER FUNCTION public.jsonb_int_array_sum(jsonb) SET search_path = public;
ALTER FUNCTION public.jsonb_stack_text(jsonb) SET search_path = public;
ALTER FUNCTION public.sort_int_jsonb_array(jsonb) SET search_path = public;
