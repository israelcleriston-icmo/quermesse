-- =====================================================================
-- Relatório do evento (Conselho/admin): números LÍQUIDOS, já descontadas as anulações.
-- Um único retorno em JSON para a tela, o CSV e o PDF.
-- =====================================================================
create function relatorio_evento(p_evento uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ev eventos;
  r jsonb;
begin
  select * into v_ev from eventos where id = p_evento;
  if not found then raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_ev.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;

  with
  vd as (select v.* from vendas v where v.evento_id = p_evento),
  dev as (select a.venda_id, sum(a.valor) as valor from anulacoes a join vd on vd.id = a.venda_id group by a.venda_id),
  pag as (select p.forma, sum(p.valor) as v from vd join vendas_pagamentos p on p.venda_id = vd.id group by p.forma),
  est as (select e.forma, sum(e.valor) as e from anulacoes a join vd on vd.id = a.venda_id
            join anulacoes_estornos e on e.anulacao_id = a.id group by e.forma),
  formas as (
    select coalesce(pag.forma, est.forma) as forma, coalesce(pag.v, 0) as vendido, coalesce(est.e, 0) as devolvido
      from pag full join est on est.forma = pag.forma),
  prod as (
    select i.nome, sum(i.quantidade - i.quantidade_anulada) as quantidade,
           sum((i.quantidade - i.quantidade_anulada) * i.valor_unitario) as faturamento
      from vendas_itens i join vd on vd.id = i.venda_id
     group by i.nome having sum(i.quantidade - i.quantidade_anulada) > 0),
  cx as (
    select pf.nome as caixa, count(*) filter (where vd.status <> 'anulada') as vendas,
           sum(vd.valor_total) - coalesce(sum(dev.valor), 0) as liquido
      from vd join perfis pf on pf.id = vd.vendedor_id left join dev on dev.venda_id = vd.id
     group by pf.nome),
  dia as (
    select (vd.finalizada_em at time zone 'America/Sao_Paulo')::date as dia, count(*) filter (where vd.status <> 'anulada') as vendas,
           sum(vd.valor_total) - coalesce(sum(dev.valor), 0) as liquido
      from vd left join dev on dev.venda_id = vd.id group by 1),
  an as (
    select vd.numero, a.valor, a.motivo, pf.nome as por, a.criada_em
      from anulacoes a join vd on vd.id = a.venda_id join perfis pf on pf.id = a.anulada_por
     order by a.criada_em desc limit 100),
  sg as (
    select coalesce(sum(s.valor), 0) as total, coalesce(sum(s.valor) filter (where s.confirmada_em is null), 0) as pendentes
      from sangrias s join turnos_caixa t on t.id = s.turno_id where t.evento_id = p_evento),
  tn as (
    select count(*) as total, count(*) filter (where fechado_em is null) as abertos,
           count(*) filter (where fechado_em is not null and conferido_em is null) as sem_conferir
      from turnos_caixa where evento_id = p_evento)
  select jsonb_build_object(
    'evento', jsonb_build_object('id', v_ev.id, 'codigo', v_ev.codigo, 'nome', v_ev.nome, 'status', v_ev.status),
    'gerado_em', now(),
    'resumo', jsonb_build_object(
      'vendas', (select count(*) from vd where status <> 'anulada'),
      'anuladas', (select count(*) from vd where status = 'anulada'),
      'parciais', (select count(*) from vd where status = 'parcialmente_anulada'),
      'cortesias', (select count(*) from vd where cortesia and status <> 'anulada'),
      'bruto', coalesce((select sum(valor_total) from vd), 0),
      'devolvido', coalesce((select sum(valor) from dev), 0),
      'liquido', coalesce((select sum(valor_total) from vd), 0) - coalesce((select sum(valor) from dev), 0)),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'vendido', vendido, 'devolvido', devolvido, 'liquido', vendido - devolvido) order by vendido - devolvido desc) from formas), '[]'),
    'por_produto', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'faturamento', faturamento) order by faturamento desc, nome) from prod), '[]'),
    'por_caixa', coalesce((select jsonb_agg(jsonb_build_object('caixa', caixa, 'vendas', vendas, 'liquido', liquido) order by liquido desc) from cx), '[]'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'vendas', vendas, 'liquido', liquido) order by dia) from dia), '[]'),
    'anulacoes', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'valor', valor, 'motivo', motivo, 'por', por, 'em', criada_em)) from an), '[]'),
    'sangrias', (select jsonb_build_object('total', total, 'pendentes', pendentes) from sg),
    'turnos', (select jsonb_build_object('total', total, 'abertos', abertos, 'sem_conferir', sem_conferir) from tn)
  ) into r;
  return r;
end $$;
revoke all on function relatorio_evento(uuid) from public, anon, authenticated;
grant execute on function relatorio_evento(uuid) to authenticated;
