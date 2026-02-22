
-- Fix RLS policies: Change read policies from RESTRICTIVE to PERMISSIVE
-- so non-admin (karyawan) users can read data

-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage products" ON public.products;
CREATE POLICY "Admin can manage products" ON public.products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- PRICES
DROP POLICY IF EXISTS "Authenticated can read prices" ON public.prices;
CREATE POLICY "Authenticated can read prices" ON public.prices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage prices" ON public.prices;
CREATE POLICY "Admin can manage prices" ON public.prices FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- STOCK
DROP POLICY IF EXISTS "Authenticated can read stock" ON public.stock;
CREATE POLICY "Authenticated can read stock" ON public.stock FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage stock" ON public.stock;
CREATE POLICY "Admin can manage stock" ON public.stock FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- STOCK_IN
DROP POLICY IF EXISTS "Authenticated can read stock_in" ON public.stock_in;
CREATE POLICY "Authenticated can read stock_in" ON public.stock_in FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert stock_in" ON public.stock_in;
CREATE POLICY "Authenticated can insert stock_in" ON public.stock_in FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can manage stock_in" ON public.stock_in;
CREATE POLICY "Admin can manage stock_in" ON public.stock_in FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- STOCK_OUT
DROP POLICY IF EXISTS "Authenticated can read stock_out" ON public.stock_out;
CREATE POLICY "Authenticated can read stock_out" ON public.stock_out FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert stock_out" ON public.stock_out;
CREATE POLICY "Authenticated can insert stock_out" ON public.stock_out FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can manage stock_out" ON public.stock_out;
CREATE POLICY "Admin can manage stock_out" ON public.stock_out FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- STOCK_OPNAME_LOG
DROP POLICY IF EXISTS "Authenticated can read opname" ON public.stock_opname_log;
CREATE POLICY "Authenticated can read opname" ON public.stock_opname_log FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert opname" ON public.stock_opname_log;
CREATE POLICY "Authenticated can insert opname" ON public.stock_opname_log FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can manage opname" ON public.stock_opname_log;
CREATE POLICY "Admin can manage opname" ON public.stock_opname_log FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- PRODUCT_ALIASES
DROP POLICY IF EXISTS "Authenticated can read aliases" ON public.product_aliases;
CREATE POLICY "Authenticated can read aliases" ON public.product_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage aliases" ON public.product_aliases;
CREATE POLICY "Admin can manage aliases" ON public.product_aliases FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- PROFILES - keep existing structure, just recreate as PERMISSIVE
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can read all profiles" ON public.profiles;
CREATE POLICY "Admin can read all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can manage profiles" ON public.profiles;
CREATE POLICY "Admin can manage profiles" ON public.profiles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- USER_ROLES
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can manage roles" ON public.user_roles;
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
