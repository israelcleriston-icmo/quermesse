-- =====================================================================
-- Turno do caixa: fundo inicial, sangrias, fechamento cego e conferência do Conselho.
--  * O caixa abre o turno informando o fundo de troco, registra sangrias (dinheiro retirado
--    da gaveta) e, ao fechar, informa só o valor CONTADO. O app nunca mostra a ele o esperado.
--  * O Conselho confirma as sangrias, vê esperado x contado e confere o turno.
--  * Quem tem os dois perfis nunca confere (nem confirma sangria do) o próprio turno.
-- Esperado em dinheiro = fundo + vendas em dinheiro (já descontado o troco) − sangrias.
-- =====================================================================
create table turnos_caixa (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null,
  evento_id        uuid not null,
  caixa_id         uuid not null references perfis(id),
  aberto_em        timestamptz not null default now(),
  fundo_inicial    numeric(10,2) not null check (fundo_inicial >= 0),
  fechado_em       timestamptz,
  contado_dinheiro numeric(10,2) check (contado_dinheiro >= 0),
  obs_fechamento   text check (char_length(obs_fechamento) <= 200),
  conferido_por    uuid references perfis(id),
  conferido_em     timestamptz,
  obs_conferencia  text check (char_length(obs_conferencia) <= 200),
  foreign key (evento_id, organizacao_id) references eventos (id, organizacao_id),
  check ((fechado_em is null) = (contado_dinheiro is null)),
  check ((conferido_em is null) = (conferido_por is null)),
  check (conferido_em is null or fechado_em is not null)
);
create unique index turno_aberto_unico on turnos_caixa (caixa_id) where fechado_em is null;
create index turnos_evento_idx on turnos_caixa (evento_id, aberto_em);

create table sangrias (
  id              uuid primary key default gen_random_uuid(),
  turno_id        uuid not null references turnos_caixa(id),
  valor           numeric(10,2) not null check (valor > 0),
  motivo          text check (char_length(motivo) <= 100),
  registrada_em   timestamptz not null default now(),
  confirmada_por  uuid references perfis(id),
  confirmada_em   timestamptz,
  check ((confirmada_em is null) = (confirmada_por is null))
);
create index sangrias_turno_idx on sangrias (turno_id);

alter table turnos_caixa enable row level security;
alter table sangrias enable row level security;
create policy turnos_leitura on turnos_caixa for select to authenticated
  using (caixa_id = auth.uid() or tem_papel(organizacao_id, array['conselho','admin']));
create policy sangrias_leitura on sangrias for select to authenticated
  using (exists (select 1 from turnos_caixa t where t.id = turno_id));
grant select on turnos_caixa, sangrias to authenticated;   -- escrita só pelas funções abaixo

-- ---------- Caixa: abrir turno ------------------------------------------------
create function abrir_turno(p_evento uuid, p_fundo numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ev eventos;
  v_id uuid;
begin
  select * into v_ev from eventos where id = p_evento;
  if not found then raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_ev.organizacao_id, array['caixa','secretaria']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if v_ev.status <> 'aberto' then raise exception 'EVENTO_ENCERRADO' using errcode = 'P0001'; end if;
  if p_fundo is null or p_fundo < 0 or p_fundo > 100000 or p_fundo <> round(p_fundo, 2) then
    raise exception 'FUNDO_INVALIDO' using errcode = 'P0001';
  end if;
  if exists (select 1 from turnos_caixa where caixa_id = auth.uid() and fechado_em is null) then
    raise exception 'TURNO_JA_ABERTO' using errcode = 'P0001';
  end if;
  insert into turnos_caixa (organizacao_id, evento_id, caixa_id, fundo_inicial)
  values (v_ev.organizacao_id, p_evento, auth.uid(), p_fundo) returning id into v_id;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_ev.organizacao_id, auth.uid(), 'TURNO_ABERTO', jsonb_build_object('turno_id', v_id, 'evento_id', p_evento, 'fundo', p_fundo));
  return v_id;
end $$;

-- ---------- Caixa: sangria ---------------------------------------------------
create function registrar_sangria(p_turno uuid, p_valor numeric, p_motivo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_t turnos_caixa;
  v_id uuid;
begin
  select * into v_t from turnos_caixa where id = p_turno for update;
  if not found or v_t.caixa_id <> auth.uid() then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.fechado_em is not null then raise exception 'TURNO_FECHADO' using errcode = 'P0001'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 or p_valor <> round(p_valor, 2) then
    raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end if;
  insert into sangrias (turno_id, valor, motivo) values (p_turno, p_valor, nullif(trim(p_motivo), '')) returning id into v_id;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'SANGRIA_REGISTRADA', jsonb_build_object('turno_id', p_turno, 'sangria_id', v_id, 'valor', p_valor));
  return v_id;
end $$;

-- ---------- Conselho: confirmar que recebeu o dinheiro da sangria --------------
create function confirmar_sangria(p_sangria uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s sangrias;
  v_t turnos_caixa;
begin
  select * into v_s from sangrias where id = p_sangria for update;
  if not found then raise exception 'SANGRIA_INEXISTENTE' using errcode = 'P0001'; end if;
  select * into v_t from turnos_caixa where id = v_s.turno_id;
  if not tem_papel(v_t.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.caixa_id = auth.uid() then raise exception 'PROPRIO_TURNO' using errcode = 'P0001'; end if;
  if v_s.confirmada_em is not null then raise exception 'JA_CONFIRMADA' using errcode = 'P0001'; end if;
  update sangrias set confirmada_por = auth.uid(), confirmada_em = now() where id = p_sangria;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'SANGRIA_CONFIRMADA', jsonb_build_object('turno_id', v_t.id, 'sangria_id', p_sangria, 'valor', v_s.valor));
end $$;

-- ---------- Caixa: fechamento cego -------------------------------------------
create function fechar_turno(p_turno uuid, p_contado numeric, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t turnos_caixa;
begin
  select * into v_t from turnos_caixa where id = p_turno for update;
  if not found or v_t.caixa_id <> auth.uid() then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.fechado_em is not null then raise exception 'TURNO_FECHADO' using errcode = 'P0001'; end if;
  if p_contado is null or p_contado < 0 or p_contado > 1000000 or p_contado <> round(p_contado, 2) then
    raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end if;
  update turnos_caixa set fechado_em = now(), contado_dinheiro = p_contado, obs_fechamento = nullif(trim(p_obs), '') where id = p_turno;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'TURNO_FECHADO', jsonb_build_object('turno_id', p_turno, 'contado', p_contado));
end $$;

-- ---------- Conselho: esperado x contado de todos os turnos do evento ----------
-- Para o turno do próprio usuário (quem tem os dois perfis) esperado e diferença vêm nulos.
create function conferencia_turnos(p_evento uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from eventos where id = p_evento;
  if v_org is null then raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_org, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(l order by (l->>'aberto_em') desc) from (
      select jsonb_build_object(
        'turno_id', t.id, 'caixa', pf.nome, 'proprio', t.caixa_id = auth.uid(),
        'aberto_em', t.aberto_em, 'fechado_em', t.fechado_em,
        'fundo_inicial', t.fundo_inicial, 'vendas_dinheiro', d.dinheiro,
        'sangrias_total', s.total, 'sangrias_pendentes', s.pendentes,
        'sangrias', s.lista,
        'outras_formas', d.outras,
        'contado', t.contado_dinheiro, 'obs_fechamento', t.obs_fechamento,
        'esperado', case when t.caixa_id = auth.uid() then null else t.fundo_inicial + d.dinheiro - s.total end,
        'diferenca', case when t.caixa_id = auth.uid() or t.fechado_em is null then null
                          else t.contado_dinheiro - (t.fundo_inicial + d.dinheiro - s.total) end,
        'conferido_em', t.conferido_em, 'obs_conferencia', t.obs_conferencia) as l
      from turnos_caixa t
      join perfis pf on pf.id = t.caixa_id
      cross join lateral (
        select coalesce(sum(p.valor) filter (where p.forma = 'dinheiro'), 0) as dinheiro,
               coalesce((select jsonb_object_agg(f.forma, f.total) from (
                           select p3.forma, sum(p3.valor) as total
                             from vendas v3 join vendas_pagamentos p3 on p3.venda_id = v3.id
                            where v3.vendedor_id = t.caixa_id and v3.evento_id = t.evento_id and v3.status <> 'anulada'
                              and v3.finalizada_em >= t.aberto_em and (t.fechado_em is null or v3.finalizada_em <= t.fechado_em)
                              and p3.forma <> 'dinheiro'
                            group by p3.forma) f), '{}'::jsonb) as outras
          from vendas v join vendas_pagamentos p on p.venda_id = v.id
         where v.vendedor_id = t.caixa_id and v.evento_id = t.evento_id and v.status <> 'anulada'
           and v.finalizada_em >= t.aberto_em and (t.fechado_em is null or v.finalizada_em <= t.fechado_em)
      ) d
      cross join lateral (
        select coalesce(sum(valor), 0) as total,
               coalesce(sum(valor) filter (where confirmada_em is null), 0) as pendentes,
               coalesce(jsonb_agg(jsonb_build_object('id', id, 'valor', valor, 'motivo', motivo, 'registrada_em', registrada_em,
                          'confirmada', confirmada_em is not null) order by registrada_em), '[]'::jsonb) as lista
          from sangrias where turno_id = t.id
      ) s
      where t.evento_id = p_evento
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------- Conselho: conferir o turno -----------------------------------------
create function conferir_turno(p_turno uuid, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t turnos_caixa;
begin
  select * into v_t from turnos_caixa where id = p_turno for update;
  if not found then raise exception 'TURNO_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_t.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.caixa_id = auth.uid() then raise exception 'PROPRIO_TURNO' using errcode = 'P0001'; end if;
  if v_t.fechado_em is null then raise exception 'TURNO_ABERTO' using errcode = 'P0001'; end if;
  if v_t.conferido_em is not null then raise exception 'JA_CONFERIDO' using errcode = 'P0001'; end if;
  update turnos_caixa set conferido_por = auth.uid(), conferido_em = now(), obs_conferencia = nullif(trim(p_obs), '') where id = p_turno;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'TURNO_CONFERIDO', jsonb_build_object('turno_id', p_turno));
end $$;

revoke all on function abrir_turno(uuid, numeric), registrar_sangria(uuid, numeric, text), confirmar_sangria(uuid),
  fechar_turno(uuid, numeric, text), conferencia_turnos(uuid), conferir_turno(uuid, text) from public, anon, authenticated;
grant execute on function abrir_turno(uuid, numeric), registrar_sangria(uuid, numeric, text), confirmar_sangria(uuid),
  fechar_turno(uuid, numeric, text), conferencia_turnos(uuid), conferir_turno(uuid, text) to authenticated;
