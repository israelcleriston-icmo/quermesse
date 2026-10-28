-- Simula o ambiente Supabase (apenas para teste local)
do $do$ declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop if not exists (select 1 from pg_roles where rolname=r) then execute format('create role %I nologin', r); end if; end loop; end $do$;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select on all tables in schema storage to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
