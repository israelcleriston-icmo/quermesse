-- Keep-alive: tabela lida por um script externo (Google Apps Script) para o projeto gratuito
-- do Supabase não ser pausado por inatividade. Só devolve 'ok'; leitura anônima é segura.
-- IDEMPOTENTE: a tabela já foi criada à mão no training e no prod; esta migration só
-- garante que o mesmo exista em qualquer ambiente (dev local, projeto recriado).
create table if not exists public.health_check (
  id     int primary key generated always as identity,
  status text not null default 'ok'
);

insert into public.health_check (status)
select 'ok' where not exists (select 1 from public.health_check);

alter table public.health_check enable row level security;

drop policy if exists "Permitir leitura anonima para keep-alive" on public.health_check;
create policy "Permitir leitura anonima para keep-alive"
  on public.health_check for select to anon using (true);

grant usage on schema public to anon;
revoke all on table public.health_check from anon, authenticated;
grant select on table public.health_check to anon;
