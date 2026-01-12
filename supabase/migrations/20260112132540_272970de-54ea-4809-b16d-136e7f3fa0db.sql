-- Alterar coluna role de enum para text (permite mais flexibilidade)
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE text USING role::text;

-- Adicionar constraint para validar valores permitidos
ALTER TABLE public.user_roles 
DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_role_check 
CHECK (role IN ('superadmin', 'org_admin', 'manager', 'uploader', 'viewer', 'admin', 'user'));