\set ON_ERROR_STOP on
create schema t;
create table t.res (n serial, nome text, ok boolean, info text);
-- executa SQL escalar como o usuário (role authenticated/anon); devolve 'OK:valor' ou 'ERR:mensagem'
create function t.run(uid uuid, q text, papel text default 'authenticated') returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text,''), true);
  execute 'set local role ' || papel;
  begin
    execute q into r;
    execute 'reset role';
    return 'OK:' || coalesce(r,'null');
  exception when others then
    execute 'reset role';
    return 'ERR:' || sqlerrm || coalesce(' / ' || sqlstate,'');
  end;
end $$;
create function t.check(nome text, cond boolean, info text default '') returns void language sql as
$$ insert into t.res(nome, ok, info) values (nome, coalesce(cond,false), info) $$;


-- verifica o resultado da RPC e, DEPOIS, um estado do banco (evita ordem de avaliação do AND)
create function t.after(nome text, res text, pat text, extra text default 'select true') returns void language plpgsql as $$
declare e boolean;
begin
  execute extra into e;
  insert into t.res(nome, ok, info) values (nome, res like pat and coalesce(e,false), res);
end $$;

-- Massa de dados (superusuário)
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000a1','c1'),('00000000-0000-0000-0000-0000000000a2','c2'),
 ('00000000-0000-0000-0000-0000000000b1','sec'),('00000000-0000-0000-0000-0000000000c1','con'),
 ('00000000-0000-0000-0000-0000000000d1','adm');
insert into organizacoes(id,nome) values ('10000000-0000-0000-0000-000000000001','Paróquia Teste');
insert into perfis(id,nome,cpf) values
 ('00000000-0000-0000-0000-0000000000a1','Caixa 1','11111111111'),
 ('00000000-0000-0000-0000-0000000000a2','Caixa 2','22222222222'),
 ('00000000-0000-0000-0000-0000000000b1','Secretaria','33333333333'),
 ('00000000-0000-0000-0000-0000000000c1','Conselho','44444444444'),
 ('00000000-0000-0000-0000-0000000000d1','Admin','55555555555');
insert into membros(usuario_id,organizacao_id,papel) select id,'10000000-0000-0000-0000-000000000001',
 case id::text when '00000000-0000-0000-0000-0000000000a1' then 'caixa'::papel_usuario
  when '00000000-0000-0000-0000-0000000000a2' then 'caixa' when '00000000-0000-0000-0000-0000000000b1' then 'secretaria'
  when '00000000-0000-0000-0000-0000000000c1' then 'conselho' else 'admin' end from perfis;
insert into categorias(id,organizacao_id,nome) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Comidas');
insert into produtos(id,organizacao_id,categoria_id,nome) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Pastel'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Rifa'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Brinde');
insert into chaves_pix(id,organizacao_id,chave,nome_recebedor,cidade_recebedor) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','123e4567-e12b-12d1-a456-426655440000','PAROQUIA TESTE','FORTALEZA');
insert into eventos(id,organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id,padrao) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','EVT1','Festa do Padroeiro',
  (now() at time zone 'America/Sao_Paulo')::date - 1,(now() at time zone 'America/Sao_Paulo')::date + 1,
  '40000000-0000-0000-0000-000000000001', true),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','EVT2','Evento passado',
  '2020-01-01','2020-01-02','40000000-0000-0000-0000-000000000001', false);
-- Pastel: R$7, estoque 3. Rifa: R$5 ilimitada. Brinde: R$0 ilimitado
insert into evento_produto(id,evento_id,produto_id,valor,estoque_inicial) values
 ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',7.00,3),
 ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',5.00,null),
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',0.00,null);

\set c1 '00000000-0000-0000-0000-0000000000a1'
\set c2 '00000000-0000-0000-0000-0000000000a2'
\set sec '00000000-0000-0000-0000-0000000000b1'
\set con '00000000-0000-0000-0000-0000000000c1'
\set ev '50000000-0000-0000-0000-000000000001'
\set pastel '60000000-0000-0000-0000-000000000001'
\set rifa '60000000-0000-0000-0000-000000000002'
\set brinde '60000000-0000-0000-0000-000000000003'

-- T1 venda em dinheiro: 2 pastéis + 1 rifa = 19,00
select t.after('T1 venda dinheiro total 19,00 e estoque 3->1',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000001','%s','dinheiro','[{"ep":"%s","q":2},{"ep":"%s","q":1}]')->>'valor_total'$q$,:'ev',:'pastel',:'rifa')),
  'OK:19.00', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000001')=1$x$);

-- T2 idempotência: mesmo UUID não baixa estoque de novo
select t.after('T2 reenvio idempotente (ja_existia, estoque segue 1)',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000001','%s','dinheiro','[{"ep":"%s","q":2},{"ep":"%s","q":1}]')->>'ja_existia'$q$,:'ev',:'pastel',:'rifa')),
  'OK:true', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000001')=1 and (select count(*) from vendas)=1$x$);

-- T3 estoque insuficiente: erro e nada muda
select t.check('T3 estoque insuficiente barra a venda',
  t.run(:'c2'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000002','%s','dinheiro','[{"ep":"%s","q":2}]')::text$q$,:'ev',:'pastel')) like 'ERR:ESTOQUE_ESGOTADO%'
  and (select estoque_atual from evento_produto where id=:'pastel') = 1
  and (select count(*) from vendas) = 1);

-- T4 escritas diretas negadas
select t.check('T4a caixa não insere venda direto', t.run(:'c1'::uuid, $q$insert into vendas(id,organizacao_id,evento_id,vendedor_id,forma_pagamento,valor_total) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','dinheiro',1)$q$) like 'ERR:permission denied%');
select t.check('T4b caixa não altera estoque', t.run(:'c1'::uuid, format($q$update evento_produto set estoque_atual=999 where id='%s'$q$,:'pastel')) like 'ERR:permission denied%');
select t.after('T4c caixa não consegue alterar preço (RLS filtra 0 linhas)',
  t.run(:'c1'::uuid, format($q$with u as (update evento_produto set valor=0.01 where id='%s' returning 1) select count(*)::text from u$q$,:'pastel')),
  'OK:0', $x$select (select valor from evento_produto where id='60000000-0000-0000-0000-000000000001')=7.00$x$);
select t.check('T4d anon não lê vendas', t.run(null, 'select count(*)::text from vendas','anon') like 'ERR:permission denied%');

-- T5 RLS de leitura
select t.check('T5a caixa2 não vê venda do caixa1', t.run(:'c2'::uuid,'select count(*)::text from vendas') = 'OK:0');
select t.check('T5b caixa1 vê a própria', t.run(:'c1'::uuid,'select count(*)::text from vendas') = 'OK:1');
select t.check('T5c conselho vê todas', t.run(:'con'::uuid,'select count(*)::text from vendas') = 'OK:1');
select t.check('T5d itens seguem o RLS (caixa2=0, conselho>0)',
  t.run(:'c2'::uuid,'select count(*)::text from vendas_itens')='OK:0' and t.run(:'con'::uuid,'select count(*)::text from vendas_itens')='OK:2');

-- T6 item avulso "Outros"
select t.check('T6 avulso: 2 x 12,50 = 25,00',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000003','%s','cartao','[{"avulso":true,"desc":"Bolo inteiro","valor":12.50,"q":2}]')->>'valor_total'$q$,:'ev')) = 'OK:25.00');
select t.check('T6b avulso com valor negativo é recusado',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000004','%s','cartao','[{"avulso":true,"desc":"x","valor":-5,"q":1}]')::text$q$,:'ev')) like 'ERR:ITENS_INVALIDOS%');

-- T7 Pix completo
create temp table px(txid text);
insert into px select split_part(t.run(:'c1'::uuid, format($q$select registrar_pix('%s', 5.00)$q$,:'ev')), ':', 2);
select t.check('T7a txid com 25 chars, prefixo EVT1, só A-Z0-9 sem 0O1IL',
  (select txid ~ '^EVT1[A-HJKMN-Z2-9]{21}$' and length(txid)=25 from px));
select t.check('T7b valor do QR diferente do total é recusado',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000005','%s','pix','[{"ep":"%s","q":2}]','%s','%s/%s/c.jpg')::text$q$,:'ev',:'rifa',(select txid from px),:'ev',:'c1')) like 'ERR:PIX_INVALIDO%');
select t.check('T7c Pix sem comprovante é recusado',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000005','%s','pix','[{"ep":"%s","q":1}]','%s')::text$q$,:'ev',:'rifa',(select txid from px))) like 'ERR:COMPROVANTE_OBRIGATORIO%');
select t.check('T7d comprovante de outro usuário é recusado',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000005','%s','pix','[{"ep":"%s","q":1}]','%s','%s/%s/c.jpg')::text$q$,:'ev',:'rifa',(select txid from px),:'ev',:'c2')) like 'ERR:COMPROVANTE_INVALIDO%');
select t.check('T7e caixa2 não usa o QR do caixa1',
  t.run(:'c2'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000006','%s','pix','[{"ep":"%s","q":1}]','%s','%s/%s/c.jpg')::text$q$,:'ev',:'rifa',(select txid from px),:'ev',:'c2')) like 'ERR:PIX_INVALIDO%');
select t.after('T7f Pix correto finaliza e QR vira convertido_em_venda',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000005','%s','pix','[{"ep":"%s","q":1}]','%s','%s/%s/c.jpg')->>'valor_total'$q$,:'ev',:'rifa',(select txid from px),:'ev',:'c1')),
  'OK:5.00', $x$select situacao='convertido_em_venda' from pix_gerados where txid=(select txid from px)$x$);
select t.check('T7g QR já convertido não descarta',
  t.run(:'c1'::uuid, format($q$select descartar_pix('%s')::text$q$,(select txid from px))) like 'ERR:PIX_NAO_DESCARTAVEL%');
delete from px;
insert into px select split_part(t.run(:'c1'::uuid, format($q$select registrar_pix('%s', 9.00)$q$,:'ev')), ':', 2);
select t.after('T7h descartar QR sem pagamento registra situação e hora',
  t.run(:'c1'::uuid, format($q$select descartar_pix('%s')::text$q$,(select txid from px))),
  'OK:%', $x$select situacao='confirmado_sem_pagamento' and confirmado_sem_pagamento_em is not null from pix_gerados where txid=(select txid from px)$x$);

-- T8 cortesia e regras de total
select t.check('T8a cortesia com itens de R$0 funciona',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000007','%s','cortesia','[{"ep":"%s","q":1}]')->>'valor_total'$q$,:'ev',:'brinde')) = 'OK:0.00');
select t.check('T8b cortesia com total > 0 é recusada',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000008','%s','cortesia','[{"ep":"%s","q":1}]')::text$q$,:'ev',:'rifa')) like 'ERR:TOTAL_INVALIDO%');
select t.check('T8c pagamento em dinheiro com total 0 é recusado',
  t.run(:'c1'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-000000000009','%s','dinheiro','[{"ep":"%s","q":1}]')::text$q$,:'ev',:'brinde')) like 'ERR:TOTAL_INVALIDO%');

-- T9 evento fora do período e papel
select t.check('T9a evento fora do período é recusado',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000002', 5)$q$) like 'ERR:EVENTO_FORA_DO_PERIODO%');
select t.check('T9b conselho não vende',
  t.run(:'con'::uuid, format($q$select finalizar_venda('a0000000-0000-0000-0000-00000000000a','%s','dinheiro','[{"ep":"%s","q":1}]')::text$q$,:'ev',:'rifa')) like 'ERR:SEM_PERMISSAO%');

-- T10 remessa
select t.check('T10a secretaria adiciona remessa (+50)', t.run(:'sec'::uuid, format($q$select adicionar_remessa('%s',50)::text$q$,:'pastel'))='OK:51');
select t.check('T10b caixa não adiciona remessa', t.run(:'c1'::uuid, format($q$select adicionar_remessa('%s',50)::text$q$,:'pastel')) like 'ERR:SEM_PERMISSAO%');
select t.check('T10c item ilimitado não recebe remessa', t.run(:'sec'::uuid, format($q$select adicionar_remessa('%s',5)::text$q$,:'rifa')) like 'ERR:ITEM_ILIMITADO%');

-- T11 preço + auditoria
select t.after('T11a secretaria altera preço e gera log',
  t.run(:'sec'::uuid, format($q$with u as (update evento_produto set valor=8.00 where id='%s' returning 1) select count(*)::text from u$q$,:'pastel')),
  'OK:1', $x$select exists(select 1 from logs_auditoria where acao='PRECO_ALTERADO')$x$);
select t.check('T11b venda antiga mantém preço congelado (7,00)', (select valor_unitario from vendas_itens where nome='Pastel' limit 1)=7.00);
select t.check('T11c logs são imutáveis (até para superusuário)',
  (select count(*) from (select 1) s where false) = 0 and
  t.run(null, 'update logs_auditoria set acao=''x'' returning 1','postgres') like 'ERR:logs_auditoria é append-only%');
select t.check('T11d caixa não lê logs', t.run(:'c1'::uuid,'select count(*)::text from logs_auditoria')='OK:0');

-- T12 cardápio público
select t.check('T12a anon lê cardápio com 3 itens, sem estoque exato',
  t.run(null,'select jsonb_array_length(cardapio_publico()->''itens'')::text','anon')='OK:3'
  and t.run(null,'select (cardapio_publico()->''itens''->0 ? ''estoque_atual'')::text','anon')='OK:false');
select t.check('T12b anon não executa finalizar_venda',
  t.run(null,$q$select finalizar_venda(gen_random_uuid(),'50000000-0000-0000-0000-000000000001','dinheiro','[]')::text$q$,'anon') like 'ERR:permission denied%');
select t.check('T12c Outros não aparece no cardápio',
  not exists(select 1 from jsonb_array_elements(cardapio_publico()->'itens') i where i->>'nome'='Outros'));

-- T13 views
select t.check('T13 relatório de quantidades (pastel = 2) e por forma',
  (select quantidade from v_itens_vendidos where nome='Pastel') = 2
  and (select sum(total) from v_vendas_por_forma where forma_pagamento='dinheiro') = 19.00);

-- T14 produto avulso fora do cardápio e unicidade do Outros
select t.check('T14 "Outros" não entra no cardápio',
  t.run(null,$q$insert into evento_produto(evento_id,produto_id,valor) select '50000000-0000-0000-0000-000000000001', id, 1 from produtos where tipo='avulso' returning 1$q$,'postgres') like 'ERR:PRODUTO_AVULSO%');

select n, case when ok then 'PASS' else 'FAIL' end as resultado, nome from t.res order by n;
select count(*) filter (where ok) as passou, count(*) filter (where not ok) as falhou from t.res;
