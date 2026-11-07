-- =====================================================================
-- Gestão: trocar perfil / desativar usuário (só admin) e encerrar evento.
-- =====================================================================

-- Alterar perfil e situação de um membro. O admin não pode rebaixar nem desativar a si mesmo
-- (evita deixar a organização sem administrador).
create function alterar_membro(p_usuario uuid, p_organizacao uuid, p_papel text, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_atual membros;
begin
  if not tem_papel(p_organizacao, array['admin']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_papel is null or p_papel not in ('caixa', 'secretaria', 'conselho', 'admin', 'porteiro') or p_ativo is null then
    raise exception 'DADOS_INVALIDOS' using errcode = 'P0001';
  end if;
  select * into v_atual from membros
   where usuario_id = p_usuario and organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'USUARIO_INEXISTENTE' using errcode = 'P0001';
  end if;
  if p_usuario = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'NAO_PODE_ALTERAR_A_SI_MESMO' using errcode = 'P0001';
  end if;
  update membros set papel = p_papel::papel_usuario, ativo = p_ativo where id = v_atual.id;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (p_organizacao, auth.uid(), 'MEMBRO_ALTERADO',
          jsonb_build_object('usuario_id', p_usuario, 'papel_de', v_atual.papel, 'papel_para', p_papel,
                             'ativo_de', v_atual.ativo, 'ativo_para', p_ativo));
end $$;

revoke all on function alterar_membro(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function alterar_membro(uuid, uuid, text, boolean) to authenticated;

-- Ao encerrar o evento, os QRs Pix que ficaram aguardando são cancelados automaticamente
-- (ninguém precisa auditar um a um).
create function tg_evento_encerra() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'encerrado' and old.status = 'aberto' then
    update pix_gerados set situacao = 'cancelado_por_encerramento'
     where evento_id = new.id and situacao = 'aguardando';
    insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
    values (new.organizacao_id, auth.uid(), 'EVENTO_ENCERRADO', jsonb_build_object('evento_id', new.id));
  end if;
  return new;
end $$;
create trigger evento_encerra after update of status on eventos
  for each row execute function tg_evento_encerra();
