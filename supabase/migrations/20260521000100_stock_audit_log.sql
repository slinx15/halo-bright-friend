CREATE TABLE IF NOT EXISTS public.stock_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_jumlah integer,
  new_jumlah integer,
  old_tumpukan_detail jsonb,
  new_tumpukan_detail jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_audit_log_product_changed
  ON public.stock_audit_log(product_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_audit_log_changed_at
  ON public.stock_audit_log(changed_at DESC);

ALTER TABLE public.stock_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read stock audit" ON public.stock_audit_log;
CREATE POLICY "Admin can read stock audit"
ON public.stock_audit_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_stock_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.stock_audit_log (
      stock_id, product_id, operation, new_jumlah, new_tumpukan_detail, changed_by
    )
    VALUES (
      NEW.id, NEW.product_id, TG_OP, NEW.jumlah, NEW.tumpukan_detail, auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.jumlah IS DISTINCT FROM NEW.jumlah
      OR OLD.tumpukan_detail IS DISTINCT FROM NEW.tumpukan_detail THEN
      INSERT INTO public.stock_audit_log (
        stock_id, product_id, operation, old_jumlah, new_jumlah,
        old_tumpukan_detail, new_tumpukan_detail, changed_by
      )
      VALUES (
        NEW.id, NEW.product_id, TG_OP, OLD.jumlah, NEW.jumlah,
        OLD.tumpukan_detail, NEW.tumpukan_detail, auth.uid()
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.stock_audit_log (
      stock_id, product_id, operation, old_jumlah, old_tumpukan_detail, changed_by
    )
    VALUES (
      OLD.id, OLD.product_id, TG_OP, OLD.jumlah, OLD.tumpukan_detail, auth.uid()
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS stock_audit_trigger ON public.stock;
CREATE TRIGGER stock_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.stock
FOR EACH ROW EXECUTE FUNCTION public.log_stock_audit();
