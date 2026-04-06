-- Exécuter après schema_profiles_rbac.sql si des utilisateurs existaient déjà dans auth.users.
insert into public.profiles (id, role)
select au.id, 'user'
from auth.users au
where not exists (select 1 from public.profiles p where p.id = au.id);
