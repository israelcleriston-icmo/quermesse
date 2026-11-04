-- =====================================================================
-- Anulação de venda (total ou parcial) pelo Conselho/admin.
--  * Motivo obrigatório; quem anula nunca é quem vendeu (vale para quem tem os dois perfis).
--  * O Conselho informa COMO o dinheiro foi devolvido (forma a forma), dentro do que foi pago.
--  * Opcionalmente devolve o produto ao estoque.
--  * Devoluções em dinheiro feitas durante um turno entram na conta da gaveta (conferência).
-- =====================================================================
create table anulacoes (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  venda_id        uuid not null references vendas(id),
  anulada_por     uuid not null references perfis(id),
  motivo          text not null check (char_length(motivo) between 5 and 200),
  valor           numeric(10,2) not null check (valor >= 0),
  devolveu_estoque boolean not null,
  itens           jsonb not null,
  criada_em       timestamptz not null default now()
);
create index anulacoes_venda_idx on anulacoes (venda_id);

create table anulacoes_estornos (
  id           uuid primary key default gen_random_uuid(),
  anulacao_id  uuid not null references anulacoes(id),
  forma        text not null check (forma in ('pix', 'dinheiro', 'credito', 'debito')),
  valor        numeric(10,2) not null check (valor > 0)
);
create index anulacoes_estornos_idx on anulacoes_estornos (anulacao_id);

alter table anulacoes enable row level security;
alter table anulacoes_estornos enable row level security;
create policy anulacoes_leitura on anulacoes for select to authenticated
  using (tem_papel(organizacao_id, array['conselho','admin']));
create policy estornos_leitura on anulacoes_estornos for select to authenticated
  using (exists (select 1 from anulacoes a where a.id = anulacao_id));
grant select on anulacoes, anulacoes_estornos to authenticated;

-- p_itens   : [{"item":"<vendas_itens.id>","q":1}]  — null ou [] = tudo que ainda não foi anulado
-- p_estornos: [{"forma":"dinheiro","valor":8.00}]   — a soma tem de bater com o valor anulado
create function anular_venda(p_venda uuid, p_itens jsonb, p_estornos jsonb, p_motivo text, p_devolver_estoque boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_v      vendas;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_it     record;
  v_sel    jsonb := '[]'::jsonb;
  v_q      int;
  v_valor  numeric(10,2) := 0;
  v_est    jsonb;
  v_soma   numeric(10,2) := 0;
  v_forma  text;
  v_val    numeric;
  v_livre  numeric;
  v_ids    uuid[] := '{}';
  v_item   uuid;
  v_aid    uuid;
  v_resta  int;
begin
  select * into v_v from vendas where id = p_venda for update;
  if not found then raise exception 'VENDA_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_v.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_v.vendedor_id = auth.uid() then raise exception 'PROPRIA_VENDA' using errcode = 'P0001'; end if;
  if v_v.status = 'anulada' then raise exception 'VENDA_ANULADA' using errcode = 'P0001'; end if;
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 200 then raise exception 'MOTIVO_OBRIGATORIO' using errcode = 'P0001'; end if;
  if p_devolver_estoque is null then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;

  -- itens a anular
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    for v_it in select id, quantidade - quantidade_anulada as resta from vendas_itens
                 where venda_id = p_venda and quantidade > quantidade_anulada loop
      v_sel := v_sel || jsonb_build_object('item', v_it.id, 'q', v_it.resta);
    end loop;
  else
    v_sel := p_itens;
  end if;
  if jsonb_array_length(v_sel) = 0 then raise exception 'VENDA_ANULADA' using errcode = 'P0001'; end if;

  for v_est in select * from jsonb_array_elements(v_sel) loop
    begin
      v_item := (v_est->>'item')::uuid;
      v_q := (v_est->>'q')::int;
    exception when others then
      raise exception 'QUANTIDADE_INVALIDA' using errcode = 'P0001';
    end;
    if v_item = any (v_ids) then raise exception 'QUANTIDADE_INVALIDA' using errcode = 'P0001'; end if;
    v_ids := v_ids || v_item;
    select * into v_it from vendas_itens where id = v_item and venda_id = p_venda for update;
    if not found or v_q is null or v_q < 1 or v_q > v_it.quantidade - v_it.quantidade_anulada then
      raise exception 'QUANTIDADE_INVALIDA' using errcode = 'P0001';
    end if;
    v_valor := v_valor + v_q * v_it.valor_unitario;
  end loop;

  -- estornos: por forma, dentro do que foi pago e ainda não devolvido; soma = valor anulado
  if p_estornos is null or jsonb_typeof(p_estornos) <> 'array' then p_estornos := '[]'::jsonb; end if;
  for v_est in select * from jsonb_array_elements(p_estornos) loop
    begin
      v_forma := v_est->>'forma';
      v_val := (v_est->>'valor')::numeric;
    exception when others then
      raise exception 'ESTORNO_INVALIDO' using errcode = 'P0001';
    end;
    if v_forma is null or v_forma not in ('pix','dinheiro','credito','debito') or v_val is null or v_val <= 0 or v_val <> round(v_val, 2) then
      raise exception 'ESTORNO_INVALIDO' using errcode = 'P0001';
    end if;
    select coalesce((select sum(p.valor) from vendas_pagamentos p where p.venda_id = p_venda and p.forma = v_forma), 0)
         - coalesce((select sum(e.valor) from anulacoes_estornos e join anulacoes a on a.id = e.anulacao_id
                      where a.venda_id = p_venda and e.forma = v_forma), 0)
         - coalesce((select sum((x->>'valor')::numeric) from jsonb_array_elements(p_estornos) x
                      where x->>'forma' = v_forma and x is distinct from v_est), 0)
      into v_livre;
    if v_val > v_livre then raise exception 'ESTORNO_INVALIDO' using errcode = 'P0001'; end if;
    v_soma := v_soma + v_val;
  end loop;
  if v_soma <> v_valor then raise exception 'ESTORNO_INVALIDO' using errcode = 'P0001'; end if;

  -- aplica
  insert into anulacoes (organizacao_id, venda_id, anulada_por, motivo, valor, devolveu_estoque, itens)
  values (v_v.organizacao_id, p_venda, auth.uid(), v_motivo, v_valor, p_devolver_estoque, v_sel) returning id into v_aid;
  for v_est in select * from jsonb_array_elements(p_estornos) loop
    insert into anulacoes_estornos (anulacao_id, forma, valor) values (v_aid, v_est->>'forma', (v_est->>'valor')::numeric);
  end loop;
  for v_est in select * from jsonb_array_elements(v_sel) loop
    v_item := (v_est->>'item')::uuid;
    v_q := (v_est->>'q')::int;
    update vendas_itens set quantidade_anulada = quantidade_anulada + v_q where id = v_item returning * into v_it;
    if p_devolver_estoque and v_it.evento_produto_id is not null then
      update evento_produto set estoque_atual = estoque_atual + v_q where id = v_it.evento_produto_id and estoque_atual is not null;
    end if;
  end loop;
  select coalesce(sum(quantidade - quantidade_anulada), 0) into v_resta from vendas_itens where venda_id = p_venda;
  update vendas set status = case when v_resta = 0 then 'anulada'::status_venda else 'parcialmente_anulada'::status_venda end where id = p_venda;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_v.organizacao_id, auth.uid(), 'VENDA_ANULADA',
          jsonb_build_object('venda_id', p_venda, 'numero', v_v.numero, 'anulacao_id', v_aid, 'valor', v_valor,
                             'motivo', v_motivo, 'devolveu_estoque', p_devolver_estoque, 'estornos', p_estornos));
  return jsonb_build_object('anulacao_id', v_aid, 'valor', v_valor, 'status', case when v_resta = 0 then 'anulada' else 'parcialmente_anulada' end);
end $$;
revoke all on function anular_venda(uuid, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function anular_venda(uuid, jsonb, jsonb, text, boolean) to authenticated;

-- ---------- Conferência do caixa: agora considera as devoluções ----------------
-- Vendas entram brutas (mesmo as depois anuladas); o que foi devolvido no período do turno é descontado.
create or replace function conferencia_turnos(p_evento uuid) returns jsonb
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
        'fundo_inicial', t.fundo_inicial, 'vendas_dinheiro', d.dinheiro, 'devolucoes_dinheiro', d.estornos,
        'sangrias_total', s.total, 'sangrias_pendentes', s.pendentes,
        'sangrias', s.lista,
        'outras_formas', d.outras,
        'contado', t.contado_dinheiro, 'obs_fechamento', t.obs_fechamento,
        'esperado', case when t.caixa_id = auth.uid() then null else t.fundo_inicial + d.dinheiro - d.estornos - s.total end,
        'diferenca', case when t.caixa_id = auth.uid() or t.fechado_em is null then null
                          else t.contado_dinheiro - (t.fundo_inicial + d.dinheiro - d.estornos - s.total) end,
        'conferido_em', t.conferido_em, 'obs_conferencia', t.obs_conferencia) as l
      from turnos_caixa t
      join perfis pf on pf.id = t.caixa_id
      cross join lateral (
        select coalesce(sum(m.v) filter (where m.forma = 'dinheiro'), 0) as dinheiro,
               coalesce(sum(m.e) filter (where m.forma = 'dinheiro'), 0) as estornos,
               coalesce(jsonb_object_agg(m.forma, coalesce(m.v, 0) - coalesce(m.e, 0)) filter (where m.forma <> 'dinheiro'), '{}'::jsonb) as outras
          from (
            select u.forma, sum(u.valor) filter (where u.tipo = 'v') as v, sum(u.valor) filter (where u.tipo = 'e') as e
              from (
                select p.forma, p.valor, 'v' as tipo
                  from vendas v join vendas_pagamentos p on p.venda_id = v.id
                 where v.vendedor_id = t.caixa_id and v.evento_id = t.evento_id
                   and v.finalizada_em >= t.aberto_em and (t.fechado_em is null or v.finalizada_em <= t.fechado_em)
                union all
                select e.forma, e.valor, 'e'
                  from anulacoes a join anulacoes_estornos e on e.anulacao_id = a.id join vendas v on v.id = a.venda_id
                 where v.vendedor_id = t.caixa_id and v.evento_id = t.evento_id
                   and a.criada_em >= t.aberto_em and (t.fechado_em is null or a.criada_em <= t.fechado_em)
              ) u group by u.forma
          ) m
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
