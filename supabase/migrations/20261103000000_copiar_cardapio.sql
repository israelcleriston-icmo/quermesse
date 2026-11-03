-- =====================================================================
-- Copiar o cardápio de um evento para outro (o cardápio é por evento).
-- Copia os itens ativos com os preços. Itens com estoque controlado entram com
-- estoque 0 (a menos que p_copiar_estoque), para não vender o que ainda não existe.
-- Itens que o destino já tem são mantidos como estão (nada é sobrescrito).
-- Devolve quantos itens foram copiados.
-- =====================================================================
create function copiar_cardapio(p_origem uuid, p_destino uuid, p_copiar_estoque boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_org_origem  uuid;
  v_org_destino uuid;
  v_qtd         int;
begin
  if p_origem is null or p_destino is null then
    raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001';
  end if;
  select organizacao_id into v_org_origem  from eventos where id = p_origem;
  select organizacao_id into v_org_destino from eventos where id = p_destino;
  if v_org_origem is null or v_org_destino is null or v_org_origem <> v_org_destino then
    raise exception 'EVENTO_INEXISTENTE' using errcode = 'P0001';
  end if;
  if not tem_papel(v_org_destino, array['secretaria', 'conselho', 'admin']) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_origem = p_destino then
    raise exception 'EVENTOS_IGUAIS' using errcode = 'P0001';
  end if;

  with novos as (
    insert into evento_produto (organizacao_id, evento_id, produto_id, valor, estoque_inicial)
    select ep.organizacao_id, p_destino, ep.produto_id, ep.valor,
           case when ep.estoque_inicial is null then null
                when coalesce(p_copiar_estoque, false) then ep.estoque_inicial
                else 0 end
      from evento_produto ep
      join produtos p on p.id = ep.produto_id and p.ativo
     where ep.evento_id = p_origem and ep.ativo
    on conflict (evento_id, produto_id) do nothing
    returning 1
  )
  select count(*) into v_qtd from novos;

  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_org_destino, auth.uid(), 'CARDAPIO_COPIADO',
          jsonb_build_object('origem', p_origem, 'destino', p_destino, 'itens', v_qtd, 'com_estoque', coalesce(p_copiar_estoque, false)));
  return v_qtd;
end $$;

revoke all on function copiar_cardapio(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function copiar_cardapio(uuid, uuid, boolean) to authenticated;
