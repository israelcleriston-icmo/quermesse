-- =====================================================================
-- Crédito e débito no lugar de "cartão" (débito é só para estatística).
-- forma_pagamento deixa de ser enum: vira texto com CHECK, o que facilita novas formas.
-- Pagamentos antigos em "cartao" viram "credito" (a distinção não existia).
-- =====================================================================
drop view v_vendas_por_forma;

-- Remove os CHECKs da tabela (referenciam o enum), troca o tipo e recria
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'vendas_pagamentos'::regclass and contype = 'c' loop
    execute format('alter table vendas_pagamentos drop constraint %I', c);
  end loop;
end $$;

alter table vendas_pagamentos alter column forma type text using forma::text;
update vendas_pagamentos set forma = 'credito' where forma = 'cartao';

alter table vendas_pagamentos
  add constraint pagamentos_forma_valida check (forma in ('pix', 'dinheiro', 'credito', 'debito')),
  add constraint pagamentos_valor_positivo check (valor > 0),
  add constraint pagamentos_pix_txid check ((forma = 'pix') = (txid is not null)),
  add constraint pagamentos_pix_comprovante check (forma <> 'pix' or comprovante_path is not null),
  add constraint pagamentos_dinheiro_recebido check ((forma = 'dinheiro') = (valor_recebido is not null)),
  add constraint pagamentos_dinheiro_troco check ((forma = 'dinheiro') = (troco is not null)),
  add constraint pagamentos_dinheiro_conta check (forma <> 'dinheiro' or (valor_recebido >= valor and troco = valor_recebido - valor));

drop type forma_pagamento;

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

create or replace function finalizar_venda(p_venda_id uuid, p_evento_id uuid, p_itens jsonb, p_pagamentos jsonb)
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
      if v_forma is null or v_forma not in ('pix', 'dinheiro', 'credito', 'debito')
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
    select p_venda_id, p->>'forma', (p->>'valor')::numeric,
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
