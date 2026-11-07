-- Keep-alive com ESCRITA: uma leitura simples não evitou a pausa por inatividade do plano gratuito.
-- O script do Google passa a chamar rpc/ping_keepalive (POST), que atualiza UMA linha (não cresce).
alter table public.health_check add column if not exists ultimo_ping timestamptz;
alter table public.health_check add column if not exists total_pings bigint not null default 0;

create or replace function public.ping_keepalive() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ultimo timestamptz;
begin
  update public.health_check set ultimo_ping = now(), total_pings = total_pings + 1
   where id = (select min(id) from public.health_check)
  returning ultimo_ping into v_ultimo;
  return jsonb_build_object('ok', true, 'ultimo_ping', v_ultimo);
end $$;

revoke all on function public.ping_keepalive() from public;
grant execute on function public.ping_keepalive() to anon, authenticated;
