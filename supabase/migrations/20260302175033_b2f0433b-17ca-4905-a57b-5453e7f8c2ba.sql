
-- Table to store pending restock orders
CREATE TABLE public.pending_restock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ordered_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table to store items in each pending restock
CREATE TABLE public.pending_restock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restock_id uuid NOT NULL REFERENCES public.pending_restock(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  kode text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_restock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_restock_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for pending_restock
CREATE POLICY "Users can read own pending restock"
ON public.pending_restock FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending restock"
ON public.pending_restock FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending restock"
ON public.pending_restock FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending restock"
ON public.pending_restock FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admin can manage pending restock"
ON public.pending_restock FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for pending_restock_items (via restock ownership)
CREATE POLICY "Users can read own restock items"
ON public.pending_restock_items FOR SELECT
USING (EXISTS (SELECT 1 FROM public.pending_restock WHERE id = restock_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert own restock items"
ON public.pending_restock_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.pending_restock WHERE id = restock_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete own restock items"
ON public.pending_restock_items FOR DELETE
USING (EXISTS (SELECT 1 FROM public.pending_restock WHERE id = restock_id AND user_id = auth.uid()));

CREATE POLICY "Admin can manage restock items"
ON public.pending_restock_items FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pending_restock_updated_at
BEFORE UPDATE ON public.pending_restock
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
