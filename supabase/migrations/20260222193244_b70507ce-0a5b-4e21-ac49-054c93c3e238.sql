-- Fix user_roles RLS: change to PERMISSIVE so either policy can grant access
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admin can manage roles" ON public.user_roles;

-- Permissive: users can read their own role
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Permissive: admins can manage all roles
CREATE POLICY "Admin can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
