
CREATE TABLE public.ivory_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  paid_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  note text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_at timestamptz,
  source_image text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ivory_debts_status ON public.ivory_debts(status);
CREATE INDEX idx_ivory_debts_created_at ON public.ivory_debts(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ivory_debts TO authenticated;
GRANT ALL ON public.ivory_debts TO service_role;
ALTER TABLE public.ivory_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ivory_debts" ON public.ivory_debts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ivory_debts" ON public.ivory_debts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ivory_debts" ON public.ivory_debts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete ivory_debts" ON public.ivory_debts FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_ivory_debts_updated_at
BEFORE UPDATE ON public.ivory_debts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.ivory_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ivory_debt_payments_paid_at ON public.ivory_debt_payments(paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ivory_debt_payments TO authenticated;
GRANT ALL ON public.ivory_debt_payments TO service_role;
ALTER TABLE public.ivory_debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ivory_debt_payments" ON public.ivory_debt_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ivory_debt_payments" ON public.ivory_debt_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete ivory_debt_payments" ON public.ivory_debt_payments FOR DELETE TO authenticated USING (true);


CREATE TABLE public.ivory_debt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  source_image text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ivory_debt_snapshots_created_at ON public.ivory_debt_snapshots(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ivory_debt_snapshots TO authenticated;
GRANT ALL ON public.ivory_debt_snapshots TO service_role;
ALTER TABLE public.ivory_debt_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ivory_debt_snapshots" ON public.ivory_debt_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ivory_debt_snapshots" ON public.ivory_debt_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete ivory_debt_snapshots" ON public.ivory_debt_snapshots FOR DELETE TO authenticated USING (true);


CREATE TABLE public.ivory_debt_settings (
  id integer PRIMARY KEY DEFAULT 1,
  debt_limit integer NOT NULL DEFAULT 40000000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ivory_debt_settings_singleton CHECK (id = 1)
);
INSERT INTO public.ivory_debt_settings (id, debt_limit) VALUES (1, 40000000) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.ivory_debt_settings TO authenticated;
GRANT ALL ON public.ivory_debt_settings TO service_role;
ALTER TABLE public.ivory_debt_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ivory_debt_settings" ON public.ivory_debt_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update ivory_debt_settings" ON public.ivory_debt_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can insert ivory_debt_settings" ON public.ivory_debt_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER trg_ivory_debt_settings_updated_at
BEFORE UPDATE ON public.ivory_debt_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
