-- =====================================================================
-- Sangria confirmada na hora por um CÓDIGO gerado pelo Conselho (OTP de 6 dígitos).
--  1. Conselho/admin gera o código para um turno aberto e um valor (vale 10 min, uso único).
--  2. O caixa digita o código ao registrar a sangria: ela já nasce confirmada.
--  3. Sem código, o caixa ainda pode registrar (fica "aguardando confirmação", como antes).
-- O código nunca é guardado em claro (só o hash). 5 erros bloqueiam aquele código.
-- =====================================================================
create table sangria_codigos (
  id            uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes(id),
  turno_id      uuid not null references turnos_caixa(id),
  valor         numeric(10,2) not null check (valor > 0),
  codigo_hash   text not null,
  gerado_por    uuid not null references perfis(id),
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null default now() + interval '10 minutes',
  usado_em      timestamptz,
  tentativas    int not null default 0
);
create index sangria_codigos_turno_idx on sangria_codigos (turno_id, criado_em desc);
alter table sangria_codigos enable row level security;      -- sem política: ninguém lê direto, só as funções

create function _hash_codigo(p_id uuid, p_codigo text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_id::text || ':' || p_codigo, 'utf8')), 'hex') $$;

create function gerar_codigo_sangria(p_turno uuid, p_valor numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t turnos_caixa;
  v_id uuid := gen_random_uuid();
  v_cod text;
  v_exp timestamptz;
begin
  select * into v_t from turnos_caixa where id = p_turno;
  if not found then raise exception 'TURNO_INEXISTENTE' using errcode = 'P0001'; end if;
  if not tem_papel(v_t.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.caixa_id = auth.uid() then raise exception 'PROPRIO_TURNO' using errcode = 'P0001'; end if;
  if v_t.fechado_em is not null then raise exception 'TURNO_FECHADO' using errcode = 'P0001'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 or p_valor <> round(p_valor, 2) then raise exception 'VALOR_INVALIDO' using errcode = 'P0001'; end if;
  update sangria_codigos set expira_em = least(expira_em, now()) where turno_id = p_turno and usado_em is null;   -- só o último vale
  v_cod := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into sangria_codigos (id, organizacao_id, turno_id, valor, codigo_hash, gerado_por)
  values (v_id, v_t.organizacao_id, p_turno, p_valor, _hash_codigo(v_id, v_cod), auth.uid()) returning expira_em into v_exp;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'SANGRIA_CODIGO_GERADO', jsonb_build_object('turno_id', p_turno, 'valor', p_valor));
  return jsonb_build_object('codigo', v_cod, 'expira_em', v_exp, 'valor', p_valor);
end $$;

-- Devolve {ok:true,...} ou {ok:false,erro:'CODIGO_INVALIDO',restantes:n}. Código errado NÃO usa exceção:
-- uma exceção desfaria a contagem de tentativas.
create function registrar_sangria_codigo(p_turno uuid, p_valor numeric, p_codigo text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t turnos_caixa;
  v_c sangria_codigos;
  v_sid uuid;
begin
  select * into v_t from turnos_caixa where id = p_turno for update;
  if not found or v_t.caixa_id <> auth.uid() then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_t.fechado_em is not null then raise exception 'TURNO_FECHADO' using errcode = 'P0001'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000 or p_valor <> round(p_valor, 2) then raise exception 'VALOR_INVALIDO' using errcode = 'P0001'; end if;
  select * into v_c from sangria_codigos
   where turno_id = p_turno and usado_em is null and expira_em > now() and valor = p_valor
   order by criado_em desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'CODIGO_INVALIDO', 'restantes', null); end if;
  if v_c.tentativas >= 5 then raise exception 'CODIGO_BLOQUEADO' using errcode = 'P0001'; end if;
  if _hash_codigo(v_c.id, trim(coalesce(p_codigo, ''))) <> v_c.codigo_hash then
    update sangria_codigos set tentativas = tentativas + 1 where id = v_c.id;
    return jsonb_build_object('ok', false, 'erro', 'CODIGO_INVALIDO', 'restantes', 4 - v_c.tentativas);
  end if;
  update sangria_codigos set usado_em = now() where id = v_c.id;
  insert into sangrias (turno_id, valor, motivo, confirmada_por, confirmada_em)
  values (p_turno, p_valor, nullif(trim(p_motivo), ''), v_c.gerado_por, now()) returning id into v_sid;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_t.organizacao_id, auth.uid(), 'SANGRIA_REGISTRADA',
          jsonb_build_object('turno_id', p_turno, 'sangria_id', v_sid, 'valor', p_valor, 'confirmada_por_codigo_de', v_c.gerado_por));
  return jsonb_build_object('ok', true, 'sangria_id', v_sid);
end $$;

revoke all on function _hash_codigo(uuid, text), gerar_codigo_sangria(uuid, numeric), registrar_sangria_codigo(uuid, numeric, text, text)
  from public, anon, authenticated;
grant execute on function gerar_codigo_sangria(uuid, numeric), registrar_sangria_codigo(uuid, numeric, text, text) to authenticated;
