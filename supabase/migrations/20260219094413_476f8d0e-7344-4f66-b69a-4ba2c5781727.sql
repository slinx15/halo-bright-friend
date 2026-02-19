
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'karyawan');

-- 2. User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Products (master) table - matches MASTER sheet
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL DEFAULT '',
  kategori TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 5. Stock table - matches STOCK sheet
CREATE TABLE public.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL UNIQUE,
  jumlah INTEGER NOT NULL DEFAULT 0,
  tumpukan TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

-- 6. Prices table - matches HARGA sheet
CREATE TABLE public.prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL UNIQUE,
  harga_modal INTEGER NOT NULL DEFAULT 0,
  harga_normal INTEGER NOT NULL DEFAULT 0,
  harga_grosir INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;

-- 7. Stock In table - matches MASUK sheet
CREATE TABLE public.stock_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  qty INTEGER NOT NULL,
  tumpukan TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_in ENABLE ROW LEVEL SECURITY;

-- 8. Stock Out table - matches KELUAR sheet
CREATE TABLE public.stock_out (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  qty_pesan INTEGER NOT NULL DEFAULT 0,
  qty_kirim INTEGER NOT NULL DEFAULT 0,
  harga_type TEXT NOT NULL DEFAULT 'normal',
  harga_satuan INTEGER NOT NULL DEFAULT 0,
  total_harga INTEGER NOT NULL DEFAULT 0,
  catatan TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_out ENABLE ROW LEVEL SECURITY;

-- 9. Stock Opname Log - matches SO_LOG sheet
CREATE TABLE public.stock_opname_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  stok_sistem INTEGER NOT NULL DEFAULT 0,
  stok_fisik INTEGER NOT NULL DEFAULT 0,
  selisih INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  catatan TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_opname_log ENABLE ROW LEVEL SECURITY;

-- 10. Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 11. Trigger for auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 12. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON public.stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prices_updated_at BEFORE UPDATE ON public.prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. RLS Policies

-- user_roles: only admin can manage, users can read own
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- products: all authenticated can read, admin can manage
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- stock: all authenticated can read, admin can manage
CREATE POLICY "Authenticated can read stock" ON public.stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage stock" ON public.stock FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- prices: all authenticated can read, admin can manage
CREATE POLICY "Authenticated can read prices" ON public.prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage prices" ON public.prices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- stock_in: all authenticated can read & insert, admin can manage all
CREATE POLICY "Authenticated can read stock_in" ON public.stock_in FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert stock_in" ON public.stock_in FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage stock_in" ON public.stock_in FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- stock_out: all authenticated can read & insert, admin can manage all
CREATE POLICY "Authenticated can read stock_out" ON public.stock_out FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert stock_out" ON public.stock_out FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage stock_out" ON public.stock_out FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- stock_opname_log: all authenticated can read & insert, admin can manage all
CREATE POLICY "Authenticated can read opname" ON public.stock_opname_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert opname" ON public.stock_opname_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage opname" ON public.stock_opname_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
