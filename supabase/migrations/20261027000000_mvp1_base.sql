-- =====================================================================
-- Sistema de Quermesse — MVP 1 (PDV + Pix estático + Fura-fila + estoque)
-- Migration única e idempotente-por-ordem. Rodar com `supabase db reset`.
--
-- Princípios:
--  1. Nenhuma escrita financeira direta: vendas, itens, pix e logs só
--     são gravados por funções SECURITY DEFINER (RPC).
--  2. O servidor calcula preço e total; o cliente nunca é confiável.
--  3. Auth: desligar "Enable sign ups" no painel. Usuários são criados
--     por Edge Function (service role), que insere em perfis e membros.
--     O papel NUNCA vem de metadata do token.
-- =====================================================================

-- ---------- Tipos ----------------------------------------------------
create type papel_usuario   as enum ('caixa','secretaria','conselho','admin','porteiro');
create type forma_pagamento as enum ('pix','dinheiro','cartao','cortesia');
create type status_evento   as enum ('aberto','encerrado');
create type status_venda    as enum ('finalizada','parcialmente_anulada','anulada');
create type situacao_pix    as enum ('aguardando','convertido_em_venda',
                                     'confirmado_sem_pagamento','cancelado_por_encerramento');
create type tipo_produto    as enum ('normal','avulso');

-- ---------- Organização, usuários e papéis ---------------------------
create table organizacoes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cnpj       char(14) unique check (cnpj ~ '^[0-9]{14}$'),
  created_at timestamptz not null default now()
);

create table perfis (                       -- 1:1 com auth.users
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  cpf        char(11) not null unique check (cpf ~ '^[0-9]{11}$'),
  created_at timestamptz not null default now()
);

create table membros (                      -- papel do usuário em cada organização
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references perfis(id) on delete cascade,
  organizacao_id  uuid not null references organizacoes(id),
  papel           papel_usuario not null,
  ativo           boolean not null default true,
  unique (usuario_id, organizacao_id)
);

-- ---------- Catálogo -------------------------------------------------
create table categorias (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  nome            text not null,
  ordem           int  not null default 0,
  ativo           boolean not null default true,
  unique (organizacao_id, nome)
);

create table produtos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  categoria_id    uuid references categorias(id),
  nome            text not null,
  tipo            tipo_produto not null default 'normal',
  imagem_path     text,                    -- caminho no bucket público "produtos"
  ativo           boolean not null default true,
  unique (organizacao_id, nome),
  unique (id, organizacao_id),
  check (tipo = 'avulso' or categoria_id is not null)
);
-- Exatamente um produto "Outros" (valor e descrição digitados) por organização
create unique index produtos_avulso_unico on produtos (organizacao_id) where tipo = 'avulso';

-- ---------- Pix e eventos --------------------------------------------
create table chaves_pix (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references organizacoes(id),
  chave            text not null check (length(chave) between 1 and 77),
  descricao        text,
  nome_recebedor   varchar(25) not null,   -- BR Code tag 59 (máx. 25)
  cidade_recebedor varchar(15) not null,   -- BR Code tag 60 (máx. 15)
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organizacao_id, chave),
  unique (id, organizacao_id)
);

create table eventos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references organizacoes(id),
  codigo          varchar(10) not null unique check (codigo ~ '^[A-Z0-9]{1,10}$'),
  nome            text not null,
  data_inicio     date not null,
  data_fim        date not null,
  chave_pix_id    uuid not null,
  status          status_evento not null default 'aberto',
  padrao          boolean not null default false,
  created_at      timestamptz not null default now(),
  check (data_fim >= data_inicio),
  unique (id, organizacao_id),
  foreign key (chave_pix_id, organizacao_id) references chaves_pix (id, organizacao_id)
);
-- No máximo um evento "padrão" aberto por organização
create unique index eventos_padrao_unico on eventos (organizacao_id) where padrao and status = 'aberto';

-- Cardápio do evento: preço e estoque específicos
create table evento_produto (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity unique,  -- id curto p/ QR do fura-fila
  organizacao_id  uuid not null,
  evento_id       uuid not null,
  produto_id      uuid not null,
  valor           numeric(10,2) not null check (valor >= 0),
  estoque_inicial int check (estoque_inicial >= 0),            -- NULL = ilimitado
  carga_adicional int not null default 0 check (carga_adicional >= 0),
  estoque_atual   int check (estoque_atual >= 0),
  ativo           boolean not null default true,
  unique (evento_id, produto_id),
  check ((estoque_inicial is null) = (estoque_atual is null)),
  foreign key (evento_id,  organizacao_id) references eventos  (id, organizacao_id),
  foreign key (produto_id, organizacao_id) references produtos (id, organizacao_id)
);

-- ---------- Pix gerado, vendas e itens -------------------------------
create table pix_gerados (
  txid           text primary key check (txid ~ '^[A-Z0-9]{1,25}$'),
  organizacao_id uuid not null,
  evento_id      uuid not null,
  vendedor_id    uuid not null references perfis(id),
  valor          numeric(10,2) not null check (valor > 0),
  situacao       situacao_pix not null default 'aguardando',
  gerado_em      timestamptz not null default now(),
  confirmado_sem_pagamento_em timestamptz,
  check ((situacao = 'confirmado_sem_pagamento') = (confirmado_sem_pagamento_em is not null)),
  foreign key (evento_id, organizacao_id) references eventos (id, organizacao_id)
);

create sequence vendas_numero_seq;         -- pode ter saltos (decisão RN-16)

create table vendas (
  id               uuid primary key,       -- gerado no cliente (idempotência)
  numero           bigint not null unique default nextval('vendas_numero_seq'),
  organizacao_id   uuid not null,
  evento_id        uuid not null,
  vendedor_id      uuid not null references perfis(id),
  forma_pagamento  forma_pagamento not null,
  txid             text unique references pix_gerados(txid),
  comprovante_path text,                   -- bucket privado "comprovantes"
  valor_total      numeric(10,2) not null check (valor_total >= 0),
  status           status_venda not null default 'finalizada',
  finalizada_em    timestamptz not null default now(),
  foreign key (evento_id, organizacao_id) references eventos (id, organizacao_id),
  check ((forma_pagamento = 'pix') = (txid is not null)),
  check (forma_pagamento <> 'pix' or comprovante_path is not null),
  check ((forma_pagamento = 'cortesia') = (valor_total = 0))
);
alter sequence vendas_numero_seq owned by vendas.numero;

create table vendas_itens (
  id                 uuid primary key default gen_random_uuid(),
  venda_id           uuid not null references vendas(id),
  evento_produto_id  uuid references evento_produto(id),   -- NULL no item "Outros"
  produto_id         uuid not null references produtos(id),
  nome               text not null,                        -- nome congelado p/ relatórios
  descricao_avulsa   text,
  quantidade         int  not null check (quantidade > 0),
  quantidade_anulada int  not null default 0,
  valor_unitario     numeric(10,2) not null check (valor_unitario >= 0),
  check (quantidade_anulada between 0 and quantidade),
  check ((evento_produto_id is null) = (descricao_avulsa is not null))
);
create index vendas_itens_venda_idx   on vendas_itens (venda_id);
create index vendas_evento_vend_idx   on vendas (evento_id, vendedor_id, finalizada_em);

-- ---------- Auditoria (append-only) ----------------------------------
create table logs_auditoria (
  id              bigint generated always as identity primary key,
  organizacao_id  uuid,
  usuario_id      uuid,
  acao            text not null,
  detalhes        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create function tg_logs_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'logs_auditoria é append-only';
end $$;
create trigger logs_sem_update_delete before update or delete on logs_auditoria
  for each row execute function tg_logs_imutavel();
create trigger logs_sem_truncate before truncate on logs_auditoria
  for each statement execute function tg_logs_imutavel();

-- ---------- Funções auxiliares (usadas pelo RLS) ---------------------
create function papel_na_org(p_org uuid) returns papel_usuario
language sql stable security definer set search_path = public as $$
  select m.papel from membros m
   where m.usuario_id = auth.uid() and m.organizacao_id = p_org and m.ativo
   limit 1
$$;

create function tem_papel(p_org uuid, p_papeis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(papel_na_org(p_org)::text = any (p_papeis), false)
$$;

-- Gestores (admin/conselho/secretaria) enxergam nomes de quem é da mesma organização
create function compartilha_org_gestao(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros alvo
    join membros eu on eu.organizacao_id = alvo.organizacao_id
    where alvo.usuario_id = p_usuario
      and eu.usuario_id = auth.uid() and eu.ativo
      and eu.papel in ('admin','conselho','secretaria'))
$$;

-- ---------- Triggers de integridade ----------------------------------
-- Cria o produto "Outros" automaticamente em toda organização nova
create function tg_org_cria_outros() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into produtos (organizacao_id, nome, tipo) values (new.id, 'Outros', 'avulso');
  return new;
end $$;
create trigger org_cria_outros after insert on organizacoes
  for each row execute function tg_org_cria_outros();

-- No INSERT do cardápio: herda a organização, impede "Outros" e fixa o estoque
create function tg_evento_produto_ins() returns trigger language plpgsql as $$
begin
  select organizacao_id into new.organizacao_id from eventos where id = new.evento_id;
  if new.organizacao_id is null then
    raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001';
  end if;
  if exists (select 1 from produtos where id = new.produto_id and tipo = 'avulso') then
    raise exception 'PRODUTO_AVULSO_NAO_VAI_AO_CARDAPIO' using errcode = 'P0001';
  end if;
  new.estoque_atual   := new.estoque_inicial;
  new.carga_adicional := 0;
  return new;
end $$;
create trigger evento_produto_ins before insert on evento_produto
  for each row execute function tg_evento_produto_ins();

-- Mudança de preço durante o evento fica registrada
create function tg_audita_preco() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.valor is distinct from old.valor then
    insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
    values (new.organizacao_id, auth.uid(), 'PRECO_ALTERADO',
            jsonb_build_object('evento_produto_id', new.id, 'de', old.valor, 'para', new.valor));
  end if;
  return new;
end $$;
create trigger evento_produto_preco after update on evento_produto
  for each row execute function tg_audita_preco();

-- ---------- RPCs -----------------------------------------------------
-- TXID: prefixo (código do evento) + aleatório até 25 chars, sem 0 O 1 I L
create function _txid_aleatorio(p_prefixo text) returns text
language plpgsql volatile as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 símbolos
  bytes bytea := decode(replace(gen_random_uuid()::text,'-','') ||
                        replace(gen_random_uuid()::text,'-',''), 'hex');
  r text := p_prefixo;
  i int := 0;
begin
  while length(r) < 25 loop
    r := r || substr(alfabeto, (get_byte(bytes, i) % 31) + 1, 1);
    i := i + 1;
  end loop;
  return r;
end $$;

-- Valida usuário, papel (caixa/secretaria), evento aberto e dentro do período
create function _evento_para_venda(p_evento_id uuid) returns eventos
language plpgsql stable security definer set search_path = public as $$
declare
  v_ev eventos;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then
    raise exception 'NAO_AUTENTICADO' using errcode = 'P0001';
  end if;
  select * into v_ev from eventos where id = p_evento_id;
  if not found then
    raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001';
  end if;
  if not tem_papel(v_ev.organizacao_id, array['caixa','secretaria']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if v_ev.status <> 'aberto' or v_hoje < v_ev.data_inicio or v_hoje > v_ev.data_fim then
    raise exception 'EVENTO_FORA_DO_PERIODO' using errcode = 'P0001';
  end if;
  return v_ev;
end $$;

-- Registra o QR Pix que vai ser exibido; devolve o TXID gerado no servidor
create function registrar_pix(p_evento_id uuid, p_valor numeric) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ev eventos := _evento_para_venda(p_evento_id);
  v_txid text;
begin
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) then
    raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end if;
  loop
    v_txid := _txid_aleatorio(v_ev.codigo);
    begin
      insert into pix_gerados (txid, organizacao_id, evento_id, vendedor_id, valor)
      values (v_txid, v_ev.organizacao_id, v_ev.id, auth.uid(), p_valor);
      exit;
    exception when unique_violation then
      null;   -- colisão: sorteia outro
    end;
  end loop;
  return v_txid;
end $$;

-- Vendedor confirma que o cliente NÃO pagou (sai da tela do QR sem vender)
create function descartar_pix(p_txid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pix_gerados
     set situacao = 'confirmado_sem_pagamento', confirmado_sem_pagamento_em = now()
   where txid = p_txid and vendedor_id = auth.uid() and situacao = 'aguardando';
  if not found then
    raise exception 'PIX_NAO_DESCARTAVEL' using errcode = 'P0001';
  end if;
end $$;

-- Finaliza a venda de forma atômica e idempotente.
-- p_itens: [{"ep":"<evento_produto_id>","q":2}, {"avulso":true,"desc":"Bolo","valor":12.50,"q":1}]
create function finalizar_venda(
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
  v_numero  bigint;
begin
  -- Reenvio do mesmo carrinho (rede oscilou): devolve o resultado já gravado
  select * into v_exist from vendas where id = p_venda_id;
  if found then
    if v_exist.vendedor_id <> v_uid then
      raise exception 'VENDA_ID_EM_USO' using errcode = 'P0001';
    end if;
    return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
                              'valor_total', v_exist.valor_total, 'ja_existia', true);
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

    -- Passo B: regras de pagamento
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
         and valor = v_total and situacao = 'aguardando';
      if not found then
        raise exception 'PIX_INVALIDO' using errcode = 'P0001';
      end if;
    elsif p_txid is not null or p_comprovante_path is not null then
      raise exception 'PIX_INVALIDO' using errcode = 'P0001';
    end if;

    -- Passo C: grava venda e itens (preço/nome congelados)
    insert into vendas (id, organizacao_id, evento_id, vendedor_id, forma_pagamento,
                        txid, comprovante_path, valor_total)
    values (p_venda_id, v_ev.organizacao_id, v_ev.id, v_uid, p_forma,
            p_txid, p_comprovante_path, v_total)
    returning numero into v_numero;

    insert into vendas_itens (venda_id, evento_produto_id, produto_id, nome,
                              descricao_avulsa, quantidade, valor_unitario)
    select p_venda_id, (l->>'ep')::uuid, (l->>'produto_id')::uuid, l->>'nome',
           l->>'desc', (l->>'q')::int, (l->>'valor')::numeric
      from jsonb_array_elements(v_linhas) l;

  exception when unique_violation then
    -- Corrida: dois envios simultâneos do mesmo carrinho. O bloco desfaz estoque e pix.
    select * into v_exist from vendas where id = p_venda_id;
    if found and v_exist.vendedor_id = v_uid then
      return jsonb_build_object('venda_id', v_exist.id, 'numero', v_exist.numero,
                                'valor_total', v_exist.valor_total, 'ja_existia', true);
    end if;
    raise exception 'CONFLITO_DE_DADOS' using errcode = 'P0001';
  end;

  return jsonb_build_object('venda_id', p_venda_id, 'numero', v_numero,
                            'valor_total', v_total, 'ja_existia', false);
end $$;

-- Reforço de estoque durante o evento ("+50 pastéis")
create function adicionar_remessa(p_evento_produto_id uuid, p_qtd int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ep evento_produto;
  v_novo int;
begin
  select * into v_ep from evento_produto where id = p_evento_produto_id for update;
  if not found then
    raise exception 'ITEM_INEXISTENTE' using errcode = 'P0001';
  end if;
  if not tem_papel(v_ep.organizacao_id, array['secretaria','conselho','admin']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 100000 then
    raise exception 'QUANTIDADE_INVALIDA' using errcode = 'P0001';
  end if;
  if v_ep.estoque_atual is null then
    raise exception 'ITEM_ILIMITADO' using errcode = 'P0001';
  end if;
  update evento_produto
     set carga_adicional = carga_adicional + p_qtd,
         estoque_atual   = estoque_atual + p_qtd
   where id = v_ep.id
  returning estoque_atual into v_novo;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_ep.organizacao_id, auth.uid(), 'REMESSA_ADICIONADA',
          jsonb_build_object('evento_produto_id', v_ep.id, 'qtd', p_qtd, 'estoque_apos', v_novo));
  return v_novo;
end $$;

-- Cardápio público do fura-fila (sem login). Não expõe estoque exato.
-- Com mais de uma organização, passe p_evento_id no link do cartaz.
create function cardapio_publico(p_evento_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ev   eventos;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_evento_id is not null then
    select * into v_ev from eventos
     where id = p_evento_id and status = 'aberto' and v_hoje between data_inicio and data_fim;
  else
    select * into v_ev from eventos
     where status = 'aberto' and v_hoje between data_inicio and data_fim
     order by padrao desc, data_inicio limit 1;
  end if;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'evento', jsonb_build_object('id', v_ev.id, 'codigo', v_ev.codigo, 'nome', v_ev.nome),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', ep.seq, 'id', ep.id, 'nome', p.nome, 'categoria', c.nome,
               'valor', ep.valor, 'imagem_path', p.imagem_path,
               'esgotado', (ep.estoque_atual is not null and ep.estoque_atual <= 0))
             order by c.ordem, p.nome)
        from evento_produto ep
        join produtos p on p.id = ep.produto_id
        left join categorias c on c.id = p.categoria_id
       where ep.evento_id = v_ev.id and ep.ativo and p.ativo), '[]'::jsonb));
end $$;

-- ---------- Views de relatório (respeitam o RLS de quem consulta) ----
create view v_vendas_por_forma with (security_invoker = true) as
select v.evento_id, v.vendedor_id,
       (v.finalizada_em at time zone 'America/Sao_Paulo')::date as dia,
       v.forma_pagamento, count(*) as qtd_vendas, sum(v.valor_total) as total
  from vendas v
 where v.status <> 'anulada'
 group by 1, 2, 3, 4;

create view v_itens_vendidos with (security_invoker = true) as
select v.evento_id, v.vendedor_id,
       (v.finalizada_em at time zone 'America/Sao_Paulo')::date as dia,
       i.produto_id, i.nome,
       sum(i.quantidade - i.quantidade_anulada) as quantidade,
       sum((i.quantidade - i.quantidade_anulada) * i.valor_unitario) as faturamento
  from vendas_itens i join vendas v on v.id = i.venda_id
 where v.status <> 'anulada'
 group by 1, 2, 3, 4, 5;

-- ---------- RLS ------------------------------------------------------
alter table organizacoes    enable row level security;
alter table perfis          enable row level security;
alter table membros         enable row level security;
alter table categorias      enable row level security;
alter table produtos        enable row level security;
alter table chaves_pix      enable row level security;
alter table eventos         enable row level security;
alter table evento_produto  enable row level security;
alter table pix_gerados     enable row level security;
alter table vendas          enable row level security;
alter table vendas_itens    enable row level security;
alter table logs_auditoria  enable row level security;

create policy organizacoes_sel on organizacoes for select to authenticated
  using (papel_na_org(id) is not null);

create policy perfis_sel on perfis for select to authenticated
  using (id = auth.uid() or compartilha_org_gestao(id));

create policy membros_sel on membros for select to authenticated
  using (usuario_id = auth.uid() or tem_papel(organizacao_id, array['admin','conselho','secretaria']));

-- Catálogo: todos os membros leem; secretaria/conselho/admin escrevem
create policy categorias_sel on categorias for select to authenticated
  using (papel_na_org(organizacao_id) is not null);
create policy categorias_ins on categorias for insert to authenticated
  with check (tem_papel(organizacao_id, array['secretaria','conselho','admin']));
create policy categorias_upd on categorias for update to authenticated
  using (tem_papel(organizacao_id, array['secretaria','conselho','admin']))
  with check (tem_papel(organizacao_id, array['secretaria','conselho','admin']));

create policy produtos_sel on produtos for select to authenticated
  using (papel_na_org(organizacao_id) is not null);
create policy produtos_ins on produtos for insert to authenticated
  with check (tipo = 'normal' and tem_papel(organizacao_id, array['secretaria','conselho','admin']));
create policy produtos_upd on produtos for update to authenticated
  using (tem_papel(organizacao_id, array['secretaria','conselho','admin']))
  with check (tipo = 'normal' and tem_papel(organizacao_id, array['secretaria','conselho','admin']));

-- Chaves Pix e eventos: conselho/admin escrevem; todos os membros leem
create policy chaves_sel on chaves_pix for select to authenticated
  using (papel_na_org(organizacao_id) is not null);
create policy chaves_ins on chaves_pix for insert to authenticated
  with check (tem_papel(organizacao_id, array['conselho','admin']));
create policy chaves_upd on chaves_pix for update to authenticated
  using (tem_papel(organizacao_id, array['conselho','admin']))
  with check (tem_papel(organizacao_id, array['conselho','admin']));

create policy eventos_sel on eventos for select to authenticated
  using (papel_na_org(organizacao_id) is not null);
create policy eventos_ins on eventos for insert to authenticated
  with check (tem_papel(organizacao_id, array['conselho','admin']));
create policy eventos_upd on eventos for update to authenticated
  using (tem_papel(organizacao_id, array['conselho','admin']))
  with check (tem_papel(organizacao_id, array['conselho','admin']));

-- Cardápio do evento
create policy evprod_sel on evento_produto for select to authenticated
  using (papel_na_org(organizacao_id) is not null);
create policy evprod_ins on evento_produto for insert to authenticated
  with check (tem_papel(organizacao_id, array['secretaria','conselho','admin']));
create policy evprod_upd on evento_produto for update to authenticated
  using (tem_papel(organizacao_id, array['secretaria','conselho','admin']))
  with check (tem_papel(organizacao_id, array['secretaria','conselho','admin']));

-- Pix, vendas e itens: o próprio vendedor ou conselho/admin. Sem escrita direta.
create policy pix_sel on pix_gerados for select to authenticated
  using (vendedor_id = auth.uid() or tem_papel(organizacao_id, array['conselho','admin']));
create policy vendas_sel on vendas for select to authenticated
  using (vendedor_id = auth.uid() or tem_papel(organizacao_id, array['conselho','admin']));
create policy itens_sel on vendas_itens for select to authenticated
  using (exists (select 1 from vendas v where v.id = venda_id));   -- herda o RLS de vendas

create policy logs_sel on logs_auditoria for select to authenticated
  using (tem_papel(organizacao_id, array['conselho','admin']));

-- ---------- Privilégios (o Supabase concede tudo por padrão: revogar) -
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on organizacoes, perfis, membros, pix_gerados, vendas, vendas_itens,
                logs_auditoria, v_vendas_por_forma, v_itens_vendidos to authenticated;
grant select, insert, update on categorias, produtos, chaves_pix, eventos to authenticated;
grant select, insert on evento_produto to authenticated;
grant update (valor, ativo) on evento_produto to authenticated;  -- estoque só via RPC

-- Funções: nada para PUBLIC/anon por padrão; liberar uma a uma
revoke all on function
  papel_na_org(uuid), tem_papel(uuid, text[]), compartilha_org_gestao(uuid),
  _txid_aleatorio(text), _evento_para_venda(uuid),
  registrar_pix(uuid, numeric), descartar_pix(text),
  finalizar_venda(uuid, uuid, forma_pagamento, jsonb, text, text),
  adicionar_remessa(uuid, int), cardapio_publico(uuid)
  from public, anon, authenticated;

grant execute on function papel_na_org(uuid), tem_papel(uuid, text[]),
                          compartilha_org_gestao(uuid) to authenticated;
grant execute on function registrar_pix(uuid, numeric), descartar_pix(text),
                          finalizar_venda(uuid, uuid, forma_pagamento, jsonb, text, text),
                          adicionar_remessa(uuid, int) to authenticated;
grant execute on function cardapio_publico(uuid) to anon, authenticated;

-- ---------- Storage --------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true), ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Imagens de produto: leitura pública pela URL do bucket; escrita só da gestão
create policy produtos_img_escrita on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and exists (
    select 1 from membros m where m.usuario_id = auth.uid() and m.ativo
       and m.papel in ('secretaria','conselho','admin')));
create policy produtos_img_update on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and exists (
    select 1 from membros m where m.usuario_id = auth.uid() and m.ativo
       and m.papel in ('secretaria','conselho','admin')));

-- Comprovantes (privado): caminho  <evento_id>/<usuario_id>/<arquivo>
create policy comprovantes_ins on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[2] = auth.uid()::text
    and tem_papel((select organizacao_id from eventos
                    where id = ((storage.foldername(name))[1])::uuid),
                  array['caixa','secretaria']));
create policy comprovantes_sel on storage.objects for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or tem_papel((select organizacao_id from eventos
                        where id = ((storage.foldername(name))[1])::uuid),
                      array['conselho','admin'])));
