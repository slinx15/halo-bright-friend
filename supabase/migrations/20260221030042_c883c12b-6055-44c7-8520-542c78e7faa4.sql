
-- Create product_aliases table for synonym mapping
CREATE TABLE public.product_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint on alias (one alias maps to one product)
CREATE UNIQUE INDEX idx_product_aliases_alias ON public.product_aliases (UPPER(alias));

-- Enable RLS
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read aliases
CREATE POLICY "Authenticated can read aliases"
ON public.product_aliases
FOR SELECT
USING (true);

-- Admin can manage aliases
CREATE POLICY "Admin can manage aliases"
ON public.product_aliases
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
