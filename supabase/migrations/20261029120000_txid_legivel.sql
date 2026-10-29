-- =====================================================================
-- TXID legível, ligado ao evento e à venda.
--   TXID = <código do evento> + 'V' + <nº da venda no evento, 6 dígitos>
--   Exemplo: EVT1V000123  (venda 123 do evento EVT1)
-- O número é reservado quando o QR Pix é gerado e vira o número da venda
-- quando ela é finalizada. Vendas em dinheiro/cartão usam o mesmo contador.
-- Numeração por evento; pode haver saltos (QR descartado = número não usado).
-- Também remove nome/cidade do recebedor da chave Pix (o app do pagador usa o
-- nome do DICT; o QR leva valores fixos definidos no código).
-- =====================================================================

-- 1. Contador por evento (acesso só por funções do servidor)
create table evento_contadores (
  evento_id uuid primary key references eventos(id),
  ultimo    int  not null default 0
);
alter table evento_contadores enable row level security;   -- sem políticas: ninguém lê pela API
revoke all on evento_contadores from anon, authenticated;
grant all on evento_contadores to service_role;

-- 2. Número reservado no Pix gerado
alter table pix_gerados add column numero int;
update pix_gerados p set numero = x.n
  from (select txid, row_number() over (partition by evento_id order by gerado_em, txid) as n
          from pix_gerados) x
 where x.txid = p.txid;
alter table pix_gerados alter column numero set not null;
alter table pix_gerados
  add constraint pix_gerados_evento_numero_key unique (evento_id, numero),
  add constraint pix_gerados_numero_faixa check (numero between 1 and 999999);

-- 3. Número da venda passa a ser por evento (sai a sequência global)
alter table vendas alter column numero drop default;
alter table vendas drop constraint vendas_numero_key;
alter table vendas
  add constraint vendas_evento_numero_key unique (evento_id, numero),
  add constraint vendas_numero_faixa check (numero between 1 and 999999);
drop sequence vendas_numero_seq;

insert into evento_contadores (evento_id, ultimo)
select e.id,
       greatest(coalesce((select max(v.numero) from vendas v where v.evento_id = e.id), 0),
                coalesce((select max(p.numero) from pix_gerados p where p.evento_id = e.id), 0))::int
  from eventos e
on conflict (evento_id) do nothing;

-- 4. Chave Pix: nome e cidade do recebedor não são mais usados
alter table chaves_pix drop column nome_recebedor, drop column cidade_recebedor;

-- 5. Funções
drop function _txid_aleatorio(text);

create function _proximo_numero(p_evento uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare v int;
begin
  insert into evento_contadores (evento_id, ultimo) values (p_evento, 1)
  on conflict (evento_id) do update set ultimo = evento_contadores.ultimo + 1
  returning ultimo into v;
  if v > 999999 then
    raise exception 'NUMERACAO_ESGOTADA' using errcode = 'P0001';
  end if;
  return v;
end $$;

create function _txid_da_venda(p_codigo text, p_numero int) returns text
language sql immutable as $$
  select p_codigo || 'V' || lpad(p_numero::text, 6, '0')
$$;

revoke all on function _proximo_numero(uuid), _txid_da_venda(text, int)
  from public, anon, authenticated;

-- Registra o QR Pix: reserva o número e devolve o TXID (EVT1V000123)
create or replace function registrar_pix(p_evento_id uuid, p_valor numeric) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ev     eventos := _evento_para_venda(p_evento_id);
  v_numero int;
  v_txid   text;
begin
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) then
    raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end if;
  v_numero := _proximo_numero(v_ev.id);
  v_txid   := _txid_da_venda(v_ev.codigo, v_numero);
  insert into pix_gerados (txid, numero, organizacao_id, evento_id, vendedor_id, valor)
  values (v_txid, v_numero, v_ev.organizacao_id, v_ev.id, auth.uid(), p_valor);
  return v_txid;
end $$;

-- Finaliza a venda (atômica e idempotente). Pix: o número da venda é o do QR.
create or replace function finalizar_venda(
  p_venda_id uuid, p_evento_id uuid, p_forma forma_pagamento, p_itens jsonb,
  p_txid text default null, p_comprovante_path text default null
) returns jsonb
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
begin
  select * into v_exist from vendas where id = p_venda_id;
  if found then
    if v_exist.vendedor_id <> v_uid then
      raise exception 'VENDA_ID_EM_USO' using errcode = 'P0001';
    end if;
    return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
                              'txid', v_exist.txid, 'valor_total', v_exist.valor_total,
                              'ja_existia', true);
  end if;

  v_ev := _evento_para_venda(p_evento_id);

  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'ITENS_INVALIDOS' using errcode = 'P0001';
  end if;

  begin
    -- Passo A: valida, trava as linhas (ordem fixa evita deadlock), baixa estoque
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

    -- Passo B: regras de pagamento e número da venda
    if p_forma = 'cortesia' then
      if v_total <> 0 then
        raise exception 'TOTAL_INVALIDO' using errcode = 'P0001';
      end if;
    elsif v_total <= 0 then
      raise exception 'TOTAL_INVALIDO' using errcode = 'P0001';
    end if;

    if p_forma = 'pix' then
      if p_txid is null then
        raise exception 'PIX_INVALIDO' using errcode = 'P0001';
      end if;
      if p_comprovante_path is null then
        raise exception 'COMPROVANTE_OBRIGATORIO' using errcode = 'P0001';
      end if;
      if p_comprovante_path not like (v_ev.id::text || '/' || v_uid::text || '/%') then
        raise exception 'COMPROVANTE_INVALIDO' using errcode = 'P0001';
      end if;
      update pix_gerados set situacao = 'convertido_em_venda'
       where txid = p_txid and vendedor_id = v_uid and evento_id = v_ev.id
         and valor = v_total and situacao = 'aguardando'
      returning numero into v_numero;          -- o número da venda é o do QR
      if not found then
        raise exception 'PIX_INVALIDO' using errcode = 'P0001';
      end if;
    else
      if p_txid is not null or p_comprovante_path is not null then
        raise exception 'PIX_INVALIDO' using errcode = 'P0001';
      end if;
      v_numero := _proximo_numero(v_ev.id);
    end if;

    -- Passo C: grava venda e itens (preço/nome congelados)
    insert into vendas (id, numero, organizacao_id, evento_id, vendedor_id, forma_pagamento,
                        txid, comprovante_path, valor_total)
    values (p_venda_id, v_numero, v_ev.organizacao_id, v_ev.id, v_uid, p_forma,
            p_txid, p_comprovante_path, v_total);

    insert into vendas_itens (venda_id, evento_produto_id, produto_id, nome,
                              descricao_avulsa, quantidade, valor_unitario)
    select p_venda_id, (l->>'ep')::uuid, (l->>'produto_id')::uuid, l->>'nome',
           l->>'desc', (l->>'q')::int, (l->>'valor')::numeric
      from jsonb_array_elements(v_linhas) l;

  exception when unique_violation then
    select * into v_exist from vendas where id = p_venda_id;
    if found and v_exist.vendedor_id = v_uid then
      return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
                                'txid', v_exist.txid, 'valor_total', v_exist.valor_total,
                                'ja_existia', true);
    end if;
    raise exception 'CONFLITO_DE_DADOS' using errcode = 'P0001';
  end;

  return jsonb_build_object('venda_id', p_venda_id, 'numero', v_numero, 'txid', p_txid,
                            'valor_total', v_total, 'ja_existia', false);
end $$;
