CREATE TABLE public.shopee_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopee_product_id text NOT NULL,
  shopee_product_name text NOT NULL DEFAULT '',
  variation_id text NOT NULL UNIQUE,
  variation_name text NOT NULL DEFAULT '',
  parent_sku text,
  sku text,
  price text,
  min_qty text,
  max_qty text,
  kode text NOT NULL,
  kategori text NOT NULL DEFAULT '2 Ons',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopee_listings TO authenticated;
GRANT ALL ON public.shopee_listings TO service_role;

ALTER TABLE public.shopee_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory users can view shopee listings"
ON public.shopee_listings FOR SELECT TO authenticated
USING (public.has_inventory_access(auth.uid()));

CREATE POLICY "Inventory users can insert shopee listings"
ON public.shopee_listings FOR INSERT TO authenticated
WITH CHECK (public.has_inventory_access(auth.uid()));

CREATE POLICY "Inventory users can update shopee listings"
ON public.shopee_listings FOR UPDATE TO authenticated
USING (public.has_inventory_access(auth.uid()))
WITH CHECK (public.has_inventory_access(auth.uid()));

CREATE POLICY "Inventory users can delete shopee listings"
ON public.shopee_listings FOR DELETE TO authenticated
USING (public.has_inventory_access(auth.uid()));

CREATE TRIGGER update_shopee_listings_updated_at
BEFORE UPDATE ON public.shopee_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shopee_listings_product_id ON public.shopee_listings(product_id);