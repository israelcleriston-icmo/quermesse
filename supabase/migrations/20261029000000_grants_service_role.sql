-- A função criar-usuario (e futuras Edge Functions) usam a service_role.
-- Em projetos criados com "Automatically expose new tables = não", o Supabase
-- não concede privilégios padrão às roles da API, então concedemos explicitamente.
-- A service_role é uma chave de servidor: nunca vai no front-end.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
