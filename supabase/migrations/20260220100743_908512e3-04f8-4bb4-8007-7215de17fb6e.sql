-- Grant SELECT permission on user_roles to authenticated and anon roles
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_roles TO anon;

-- Grant ALL to service_role (used by SECURITY DEFINER functions)
GRANT ALL ON public.user_roles TO service_role;