-- Add tumpukan_detail JSONB column to store array of stack sizes
-- e.g. [15, 25, 25] means 3 stacks
ALTER TABLE public.stock ADD COLUMN tumpukan_detail jsonb DEFAULT '[]'::jsonb;

-- Migrate existing data: convert current jumlah into stack breakdown
-- For BLCK/WHT products (max 50), for others (max 25)
UPDATE public.stock s
SET tumpukan_detail = (
  SELECT jsonb_agg(stack_size ORDER BY stack_size)
  FROM (
    SELECT 
      CASE 
        WHEN rn < full_stacks THEN max_stack
        WHEN remainder > 0 AND rn = full_stacks THEN remainder
      END as stack_size
    FROM (
      SELECT 
        generate_series(0, 
          CASE WHEN s.jumlah > 0 THEN 
            (s.jumlah / (CASE WHEN p.kode IN ('BLCK', 'WHT') THEN 50 ELSE 25 END)) + 
            CASE WHEN s.jumlah % (CASE WHEN p.kode IN ('BLCK', 'WHT') THEN 50 ELSE 25 END) > 0 THEN 1 ELSE 0 END - 1
          ELSE -1 END
        ) as rn,
        s.jumlah / (CASE WHEN p.kode IN ('BLCK', 'WHT') THEN 50 ELSE 25 END) as full_stacks,
        s.jumlah % (CASE WHEN p.kode IN ('BLCK', 'WHT') THEN 50 ELSE 25 END) as remainder,
        CASE WHEN p.kode IN ('BLCK', 'WHT') THEN 50 ELSE 25 END as max_stack
    ) sub
  ) stacks
  WHERE stack_size IS NOT NULL AND stack_size > 0
)
FROM public.products p
WHERE s.product_id = p.id AND s.jumlah > 0;