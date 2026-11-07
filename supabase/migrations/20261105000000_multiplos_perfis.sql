-- =====================================================================
-- Vários perfis por pessoa. `membros.papel` continua sendo o perfil ATIVO
-- (todas as regras de segurança já leem esse campo); `papeis_permitidos`
-- guarda quais perfis a pessoa pode assumir. A troca é validada aqui.
-- =====================================================================
alter table membros add column papeis_permitidos papel_usuario[] not null default '{}';
update membros set papeis_permitidos = array[papel];

-- Quem insere só informando `papel` (seed, testes, bootstrap) fica com um perfil só.
create function tg_membros_papeis() returns trigger language plpgsql as $$
begin
  if coalesce(cardinality(new.papeis_permitidos), 0) = 0 then
    new.papeis_permitidos := array[new.papel];
  end if;
  return new;
end $$;
create trigger membros_papeis before insert on membros for each row execute function tg_membros_papeis();

alter table membros add constraint membros_papel_permitido check (papel = any (papeis_permitidos));

-- Admin define a lista de perfis e a situação. Substitui a versão de um perfil só.
drop function alterar_membro(uuid, uuid, text, boolean);
create function alterar_membro(p_usuario uuid, p_organizacao uuid, p_papeis text[], p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_atual membros;
  v_lista papel_usuario[];
  v_novo  papel_usuario;
begin
  if not tem_papel(p_organizacao, array['admin']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_papeis is null or cardinality(p_papeis) = 0 or p_ativo is null
     or exists (select 1 from unnest(p_papeis) x where x is null or x not in ('caixa', 'secretaria', 'conselho', 'admin', 'porteiro')) then
    raise exception 'DADOS_INVALIDOS' using errcode = 'P0001';
  end if;
  select array_agg(distinct x::papel_usuario) into v_lista from unnest(p_papeis) x;
  select * into v_atual from membros
   where usuario_id = p_usuario and organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'USUARIO_INEXISTENTE' using errcode = 'P0001';
  end if;
  if p_usuario = auth.uid() and (not ('admin'::papel_usuario = any (v_lista)) or not p_ativo) then
    raise exception 'NAO_PODE_ALTERAR_A_SI_MESMO' using errcode = 'P0001';
  end if;
  -- mantém o perfil ativo se ainda for permitido; senão, o primeiro da lista informada
  v_novo := case when v_atual.papel = any (v_lista) then v_atual.papel else p_papeis[1]::papel_usuario end;
  update membros set papeis_permitidos = v_lista, papel = v_novo, ativo = p_ativo where id = v_atual.id;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (p_organizacao, auth.uid(), 'MEMBRO_ALTERADO',
          jsonb_build_object('usuario_id', p_usuario, 'papel_de', v_atual.papel, 'papel_para', v_novo,
                             'papeis_para', to_jsonb(v_lista),
                             'ativo_de', v_atual.ativo, 'ativo_para', p_ativo));
end $$;
revoke all on function alterar_membro(uuid, uuid, text[], boolean) from public, anon, authenticated;
grant execute on function alterar_membro(uuid, uuid, text[], boolean) to authenticated;

-- A própria pessoa troca o perfil ativo, só entre os que o admin liberou.
create function trocar_papel(p_organizacao uuid, p_papel text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m membros;
begin
  select * into v_m from membros
   where usuario_id = auth.uid() and organizacao_id = p_organizacao and ativo for update;
  if not found then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_papel is null or p_papel not in ('caixa', 'secretaria', 'conselho', 'admin', 'porteiro')
     or not (p_papel::papel_usuario = any (v_m.papeis_permitidos)) then
    raise exception 'PAPEL_NAO_PERMITIDO' using errcode = 'P0001';
  end if;
  if v_m.papel <> p_papel::papel_usuario then
    update membros set papel = p_papel::papel_usuario where id = v_m.id;
    insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
    values (p_organizacao, auth.uid(), 'PAPEL_TROCADO', jsonb_build_object('de', v_m.papel, 'para', p_papel));
  end if;
end $$;
revoke all on function trocar_papel(uuid, text) from public, anon, authenticated;
grant execute on function trocar_papel(uuid, text) to authenticated;
