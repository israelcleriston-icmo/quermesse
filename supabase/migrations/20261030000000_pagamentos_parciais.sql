-- =====================================================================
-- Pagamentos parciais (várias formas na mesma venda) e troco em dinheiro.
--  * vendas passa a ter 1..6 linhas em vendas_pagamentos (soma = total, no servidor).
--  * dinheiro guarda valor aplicado, valor recebido e troco.
--  * vários Pix na mesma venda: TXID = <evento>V<nº da venda>A|B|C... (uma letra por parte).
--  * o nº da venda é reservado no 1º QR (vendas_numeros) e reaproveitado na finalização.
-- =====================================================================

-- 1. Reserva do número da venda (acesso só por funções do servidor)
create table vendas_numeros (
  venda_id    uuid primary key,
  evento_id   uuid not null references eventos(id),
  vendedor_id uuid not null references perfis(id),
  numero      int  not null check (numero between 1 and 999999),
  criado_em   timestamptz not null default now(),
  unique (evento_id, numero)
);
alter table vendas_numeros enable row level security;
revoke all on vendas_numeros from anon, authenticated;
grant all on vendas_numeros to service_role;

-- 2. Pix gerado: pertence a uma venda e é a "parte" N dela
alter table pix_gerados add column venda_id uuid, add column parcela int;
update pix_gerados p set venda_id = v.id from vendas v where v.txid = p.txid;
update pix_gerados set venda_id = gen_random_uuid() where venda_id is null;
update pix_gerados set parcela = 1;
alter table pix_gerados alter column venda_id set not null, alter column parcela set not null;
alter table pix_gerados drop constraint pix_gerados_evento_numero_key;
alter table pix_gerados
  add constraint pix_gerados_venda_parcela_key unique (venda_id, parcela),
  add constraint pix_gerados_parcela_faixa check (parcela between 1 and 6);

-- 3. Pagamentos da venda
create table vendas_pagamentos (
  id               uuid primary key default gen_random_uuid(),
  venda_id         uuid not null references vendas(id),
  forma            forma_pagamento not null check (forma in ('pix', 'dinheiro', 'cartao')),
  valor            numeric(10,2) not null check (valor > 0),      -- valor aplicado na venda
  valor_recebido   numeric(10,2),                                 -- só dinheiro
  troco            numeric(10,2),                                 -- só dinheiro
  txid             text unique references pix_gerados(txid),
  comprovante_path text,
  check ((forma = 'pix') = (txid is not null)),
  check (forma <> 'pix' or comprovante_path is not null),
  check ((forma = 'dinheiro') = (valor_recebido is not null)),
  check ((forma = 'dinheiro') = (troco is not null)),
  check (forma <> 'dinheiro' or (valor_recebido >= valor and troco = valor_recebido - valor))
);
create index vendas_pagamentos_venda_idx on vendas_pagamentos (venda_id);

-- 4. Venda: migra dados existentes e remove as colunas de pagamento único
drop view v_vendas_por_forma;
alter table vendas add column cortesia boolean not null default false;
update vendas set cortesia = (forma_pagamento = 'cortesia');
insert into vendas_pagamentos (venda_id, forma, valor, valor_recebido, troco, txid, comprovante_path)
select id, forma_pagamento, valor_total,
       case when forma_pagamento = 'dinheiro' then valor_total end,
       case when forma_pagamento = 'dinheiro' then 0 end,
       txid, comprovante_path
  from vendas where forma_pagamento <> 'cortesia';
alter table vendas drop column forma_pagamento, drop column txid, drop column comprovante_path;
alter table vendas add constraint vendas_cortesia_total check ((valor_total = 0) = cortesia);

-- 5. RLS e privilégios
alter table vendas_pagamentos enable row level security;
create policy pagamentos_sel on vendas_pagamentos for select to authenticated
  using (exists (select 1 from vendas v where v.id = venda_id));      -- herda o RLS de vendas
revoke all on vendas_pagamentos from anon, authenticated;
grant select on vendas_pagamentos to authenticated;
grant all on vendas_pagamentos to service_role;

-- 6. Relatório por forma de pagamento (agora vem dos pagamentos)
create view v_vendas_por_forma with (security_invoker = true) as
select v.evento_id, v.vendedor_id,
       (v.finalizada_em at time zone 'America/Sao_Paulo')::date as dia,
       p.forma as forma_pagamento,
       count(distinct v.id) as qtd_vendas,
       sum(p.valor) as total,
       sum(coalesce(p.valor_recebido, 0)) as total_recebido,
       sum(coalesce(p.troco, 0)) as total_troco
  from vendas_pagamentos p join vendas v on v.id = p.venda_id
 where v.status <> 'anulada'
 group by 1, 2, 3, 4;
grant select on v_vendas_por_forma to authenticated;

-- 7. Funções
drop function finalizar_venda(uuid, uuid, forma_pagamento, jsonb, text, text);
drop function registrar_pix(uuid, numeric);
drop function _txid_da_venda(text, int);

create function _txid_da_venda(p_codigo text, p_numero int, p_parcela int) returns text
language sql immutable as $$
  select p_codigo || 'V' || lpad(p_numero::text, 6, '0') || chr(64 + p_parcela)
$$;

-- Número da venda: reservado na 1ª vez (1º QR ou finalização) e reaproveitado depois
create function _numero_da_venda(p_venda uuid, p_evento uuid, p_vendedor uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_res vendas_numeros;
  v     int;
begin
  select * into v_res from vendas_numeros where venda_id = p_venda;
  if not found then
    v := _proximo_numero(p_evento);
    insert into vendas_numeros (venda_id, evento_id, vendedor_id, numero)
    values (p_venda, p_evento, p_vendedor, v)
    on conflict (venda_id) do nothing;
    select * into v_res from vendas_numeros where venda_id = p_venda;
  end if;
  if v_res.vendedor_id <> p_vendedor or v_res.evento_id <> p_evento then
    raise exception 'VENDA_ID_EM_USO' using errcode = 'P0001';
  end if;
  return v_res.numero;
end $$;

revoke all on function _txid_da_venda(text, int, int), _numero_da_venda(uuid, uuid, uuid)
  from public, anon, authenticated;

-- Gera uma parte Pix da venda: devolve o TXID (EVT1V000123A, ...B)
create function registrar_pix(p_evento_id uuid, p_valor numeric, p_venda_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ev      eventos := _evento_para_venda(p_evento_id);
  v_numero  int;
  v_parcela int;
  v_txid    text;
begin
  if p_venda_id is null then
    raise exception 'VENDA_ID_OBRIGATORIO' using errcode = 'P0001';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) then
    raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end if;
  if exists (select 1 from vendas where id = p_venda_id) then
    raise exception 'VENDA_JA_FINALIZADA' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_venda_id::text, 0));
  v_numero := _numero_da_venda(p_venda_id, v_ev.id, auth.uid());
  select coalesce(max(parcela), 0) + 1 into v_parcela from pix_gerados where venda_id = p_venda_id;
  if v_parcela > 6 then
    raise exception 'PARCELAS_DEMAIS' using errcode = 'P0001';
  end if;
  v_txid := _txid_da_venda(v_ev.codigo, v_numero, v_parcela);
  insert into pix_gerados (txid, numero, parcela, venda_id, organizacao_id, evento_id, vendedor_id, valor)
  values (v_txid, v_numero, v_parcela, p_venda_id, v_ev.organizacao_id, v_ev.id, auth.uid(), p_valor);
  return v_txid;
end $$;

-- Finaliza a venda (atômica e idempotente).
-- p_itens:      [{"ep":"<evento_produto_id>","q":2}, {"avulso":true,"desc":"Bolo","valor":12.5,"q":1}]
-- p_pagamentos: [{"forma":"cartao","valor":15},
--                {"forma":"pix","valor":17,"txid":"EVT1V000123A","comprovante":"<evento>/<usuario>/x.jpg"},
--                {"forma":"dinheiro","valor":20,"recebido":50}]      -- [] só para cortesia (total 0)
create function finalizar_venda(p_venda_id uuid, p_evento_id uuid, p_itens jsonb, p_pagamentos jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_ev      eventos;
  v_exist   vendas;
  v_item    jsonb;
  v_ep      record;
  v_linhas  jsonb := '[]'::jsonb;
  v_total   numeric(10,2) := 0;
  v_q       int;
  v_valor   numeric;
  v_desc    text;
  v_avulso  uuid;
  v_numero  int;
  v_pag     jsonb;
  v_pags    jsonb := '[]'::jsonb;
  v_soma    numeric(10,2) := 0;
  v_forma   text;
  v_receb   numeric;
  v_troco   numeric(10,2);
  v_troco_total numeric(10,2) := 0;
  v_txid    text;
  v_comp    text;
begin
  select * into v_exist from vendas where id = p_venda_id;
  if found then
    if v_exist.vendedor_id <> v_uid then
      raise exception 'VENDA_ID_EM_USO' using errcode = 'P0001';
    end if;
    return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
      'valor_total', v_exist.valor_total, 'ja_existia', true,
      'troco_total', (select coalesce(sum(troco), 0) from vendas_pagamentos where venda_id = v_exist.id));
  end if;

  v_ev := _evento_para_venda(p_evento_id);

  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
  end if;
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array'
     or jsonb_array_length(p_pagamentos) > 6 then
    raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';
  end if;

  begin
    -- Passo A: itens (valida, trava as linhas em ordem fixa, baixa estoque)
    for v_item in
      select e from jsonb_array_elements(p_itens) as t(e)
      order by coalesce(e->>'ep', '~')
    loop
      begin
        v_q := (v_item->>'q')::int;
      exception when others then
        raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
      end;
      if v_q is null or v_q < 1 or v_q > 999 then
        raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
      end if;

      if v_item ? 'ep' then
        begin
          select ep.id, ep.produto_id, ep.valor, ep.estoque_atual, p.nome
            into v_ep
            from evento_produto ep join produtos p on p.id = ep.produto_id
           where ep.id = (v_item->>'ep')::uuid and ep.evento_id = v_ev.id
             and ep.ativo and p.ativo and p.tipo = 'normal'
             for update of ep;
        exception when invalid_text_representation then
          raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
        end;
        if not found then
          raise exception 'ITEM_INDISPONIVEL' using errcode = 'P0001';
        end if;
        if v_ep.estoque_atual is not null then
          if v_ep.estoque_atual < v_q then
            raise exception 'ESTOQUE_ESGOTADO' using errcode = 'P0001', detail = v_ep.nome;
          end if;
          update evento_produto set estoque_atual = estoque_atual - v_q where id = v_ep.id;
        end if;
        v_total  := v_total + round(v_ep.valor * v_q, 2);
        v_linhas := v_linhas || jsonb_build_object(
          'ep', v_ep.id, 'produto_id', v_ep.produto_id, 'nome', v_ep.nome,
          'q', v_q, 'valor', v_ep.valor);

      elsif coalesce((v_item->>'avulso')::boolean, false) then
        v_desc := btrim(v_item->>'desc');
        begin
          v_valor := (v_item->>'valor')::numeric;
        exception when others then
          raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
        end;
        if v_desc is null or v_desc = '' or length(v_desc) > 255
           or v_valor is null or v_valor <= 0 or v_valor <> round(v_valor, 2) then
          raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
        end if;
        if v_avulso is null then
          select id into v_avulso from produtos
           where organizacao_id = v_ev.organizacao_id and tipo = 'avulso' and ativo;
          if v_avulso is null then
            raise exception 'PRODUTO_AVULSO_NAO_CADASTRADO' using errcode = 'P0001';
          end if;
        end if;
        v_total  := v_total + round(v_valor * v_q, 2);
        v_linhas := v_linhas || jsonb_build_object(
          'produto_id', v_avulso, 'nome', 'Outros', 'desc', v_desc,
          'q', v_q, 'valor', v_valor);
      else
        raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
      end if;
    end loop;

    -- Passo B: pagamentos (a soma tem que fechar com o total, centavo por centavo)
    for v_pag in select p from jsonb_array_elements(p_pagamentos) as t(p) loop
      begin
        v_forma := v_pag->>'forma';
        v_valor := (v_pag->>'valor')::numeric;
      exception when others then
        raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';
      end;
      if v_forma is null or v_forma not in ('pix', 'dinheiro', 'cartao')
         or v_valor is null or v_valor <= 0 or v_valor <> round(v_valor, 2) then
        raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';
      end if;
      v_soma  := v_soma + v_valor;
      v_receb := null; v_troco := null; v_txid := null; v_comp := null;

      if v_forma = 'dinheiro' then
        begin
          v_receb := (v_pag->>'recebido')::numeric;
        exception when others then
          raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';
        end;
        if v_receb is null or v_receb < v_valor or v_receb <> round(v_receb, 2) then
          raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';
        end if;
        v_troco       := v_receb - v_valor;
        v_troco_total := v_troco_total + v_troco;
      elsif v_forma = 'pix' then
        v_txid := v_pag->>'txid';
        v_comp := v_pag->>'comprovante';
        if v_txid is null then
          raise exception 'PIX_INVALIDO' using errcode = 'P0001';
        end if;
        if v_comp is null then
          raise exception 'COMPROVANTE_OBRIGATORIO' using errcode = 'P0001';
        end if;
        if v_comp not like (v_ev.id::text || '/' || v_uid::text || '/%') then
          raise exception 'COMPROVANTE_INVALIDO' using errcode = 'P0001';
        end if;
        update pix_gerados set situacao = 'convertido_em_venda'
         where txid = v_txid and vendedor_id = v_uid and evento_id = v_ev.id
           and venda_id = p_venda_id and valor = v_valor and situacao = 'aguardando';
        if not found then
          raise exception 'PIX_INVALIDO' using errcode = 'P0001';
        end if;
      elsif v_pag ? 'recebido' or v_pag ? 'txid' or v_pag ? 'comprovante' then
        raise exception 'PAGAMENTOS_INVALIDOS' using errcode = 'P0001';   -- cartão sem campos extras
      end if;

      v_pags := v_pags || jsonb_build_object('forma', v_forma, 'valor', v_valor,
        'recebido', v_receb, 'troco', v_troco, 'txid', v_txid, 'comp', v_comp);
    end loop;

    if v_soma <> v_total then
      raise exception 'PAGAMENTO_NAO_FECHA' using errcode = 'P0001';
    end if;

    -- Passo C: número da venda (o do 1º QR, se houve Pix) e gravação
    v_numero := _numero_da_venda(p_venda_id, v_ev.id, v_uid);

    insert into vendas (id, numero, organizacao_id, evento_id, vendedor_id, valor_total, cortesia)
    values (p_venda_id, v_numero, v_ev.organizacao_id, v_ev.id, v_uid, v_total, v_total = 0);

    insert into vendas_pagamentos (venda_id, forma, valor, valor_recebido, troco, txid, comprovante_path)
    select p_venda_id, (p->>'forma')::forma_pagamento, (p->>'valor')::numeric,
           (p->>'recebido')::numeric, (p->>'troco')::numeric, p->>'txid', p->>'comp'
      from jsonb_array_elements(v_pags) p;

    insert into vendas_itens (venda_id, evento_produto_id, produto_id, nome,
                              descricao_avulsa, quantidade, valor_unitario)
    select p_venda_id, (l->>'ep')::uuid, (l->>'produto_id')::uuid, l->>'nome',
           l->>'desc', (l->>'q')::int, (l->>'valor')::numeric
      from jsonb_array_elements(v_linhas) l;

  exception when unique_violation then
    -- Corrida: dois envios simultâneos do mesmo carrinho (o bloco desfaz estoque e Pix).
    select * into v_exist from vendas where id = p_venda_id;
    if found and v_exist.vendedor_id = v_uid then
      return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
        'valor_total', v_exist.valor_total, 'ja_existia', true,
        'troco_total', (select coalesce(sum(troco), 0) from vendas_pagamentos where venda_id = v_exist.id));
    end if;
    raise exception 'CONFLITO_DE_DADOS' using errcode = 'P0001';
  end;

  return jsonb_build_object('venda_id', p_venda_id, 'numero', v_numero, 'valor_total', v_total,
                            'troco_total', v_troco_total, 'ja_existia', false);
end $$;

revoke all on function registrar_pix(uuid, numeric, uuid),
                       finalizar_venda(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function registrar_pix(uuid, numeric, uuid),
                          finalizar_venda(uuid, uuid, jsonb, jsonb) to authenticated;
