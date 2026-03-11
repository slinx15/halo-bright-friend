
CREATE TABLE public.restock_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  total_budget integer NOT NULL,
  total_days integer NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restock_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plans" ON public.restock_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans" ON public.restock_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON public.restock_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plans" ON public.restock_plans FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_restock_plans_updated_at 
  BEFORE UPDATE ON public.restock_plans 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
