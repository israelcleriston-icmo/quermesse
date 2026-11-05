-- =====================================================================
-- Conferência do Pix pelo Conselho: marcar cada pagamento Pix como conferido
-- (comprovante x extrato do banco). Quem vendeu não confere a própria venda.
-- A leitura das fotos já é liberada ao Conselho/admin pela política do bucket "comprovantes".
-- =====================================================================
alter table vendas_pagamentos
  add column conferido_por uuid references perfis(id),
  add column conferido_em  timestamptz,
  add constraint pagamentos_conferido_par check ((conferido_em is null) = (conferido_por is null));

create function conferir_pagamento_pix(p_pagamento uuid, p_conferido boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p vendas_pagamentos;
  v_v vendas;
begin
  select * into v_p from vendas_pagamentos where id = p_pagamento for update;
  if not found then raise exception 'PAGAMENTO_INEXISTENTE' using errcode = 'P0001'; end if;
  select * into v_v from vendas where id = v_p.venda_id;
  if not tem_papel(v_v.organizacao_id, array['conselho','admin']) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if v_p.forma <> 'pix' or p_conferido is null then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  if v_v.vendedor_id = auth.uid() then raise exception 'PROPRIA_VENDA' using errcode = 'P0001'; end if;
  update vendas_pagamentos
     set conferido_por = case when p_conferido then auth.uid() end,
         conferido_em  = case when p_conferido then now() end
   where id = p_pagamento;
  insert into logs_auditoria (organizacao_id, usuario_id, acao, detalhes)
  values (v_v.organizacao_id, auth.uid(), case when p_conferido then 'PIX_CONFERIDO' else 'PIX_DESMARCADO' end,
          jsonb_build_object('pagamento_id', p_pagamento, 'venda_numero', v_v.numero, 'valor', v_p.valor));
end $$;
revoke all on function conferir_pagamento_pix(uuid, boolean) from public, anon, authenticated;
grant execute on function conferir_pagamento_pix(uuid, boolean) to authenticated;
