\set ON_ERROR_STOP on
create schema t;
create table t.res (n serial, nome text, ok boolean, info text);
-- executa SQL escalar como o usuário; devolve 'OK:valor' ou 'ERR:mensagem'
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
-- verifica a resposta da RPC e, DEPOIS, um estado do banco (evita ordem de avaliação do AND)
create function t.after(nome text, res text, pat text, extra text default 'select true') returns void language plpgsql as $$
declare e boolean;
begin
  execute extra into e;
  insert into t.res(nome, ok, info) values (nome, res like pat and coalesce(e,false), res);
end $$;
-- chama finalizar_venda como o usuário
create function t.fin(uid uuid, venda text, ev text, itens text, pags text) returns text language sql as $$
  select t.run(uid, format($q$select finalizar_venda('%s','%s','%s'::jsonb,'%s'::jsonb)::text$q$, venda, ev, itens, pags)) $$;
create function t.fin_json(uid uuid, venda text, ev text, itens text, pags text, campo text) returns text language sql as $$
  select t.run(uid, format($q$select finalizar_venda('%s','%s','%s'::jsonb,'%s'::jsonb)->>'%s'$q$, venda, ev, itens, pags, campo)) $$;

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
insert into chaves_pix(id,organizacao_id,chave) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','123e4567-e12b-12d1-a456-426655440000');
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
\set vp '[{"ep":"60000000-0000-0000-0000-000000000001","q":2},{"ep":"60000000-0000-0000-0000-000000000002","q":1}]'
\set r10 '[{"ep":"60000000-0000-0000-0000-000000000002","q":10}]'
\set r6 '[{"ep":"60000000-0000-0000-0000-000000000002","q":6}]'
\set r1 '[{"ep":"60000000-0000-0000-0000-000000000002","q":1}]'

-- T1 dinheiro com troco: 2 pastéis + 1 rifa = 19,00; entregou 20,00 -> troco 1,00; estoque 3->1
select t.after('T1 dinheiro 19,00 com troco 1,00; estoque 3->1',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-000000000001',:'ev',:'vp','[{"forma":"dinheiro","valor":19.00,"recebido":20.00}]','troco_total'),
  'OK:1.00', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000001')=1$x$);
select t.check('T1b pagamento gravado: aplicado 19,00, recebido 20,00, troco 1,00',
  exists(select 1 from vendas_pagamentos where forma='dinheiro' and valor=19 and valor_recebido=20 and troco=1));

-- T2 idempotência
select t.after('T2 reenvio idempotente (ja_existia; estoque segue 1; 1 venda)',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-000000000001',:'ev',:'vp','[{"forma":"dinheiro","valor":19.00,"recebido":20.00}]','ja_existia'),
  'OK:true', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000001')=1 and (select count(*) from vendas)=1$x$);

-- T3 estoque insuficiente
select t.after('T3 estoque insuficiente barra a venda',
  t.fin(:'c2'::uuid,'a0000000-0000-0000-0000-000000000002',:'ev','[{"ep":"60000000-0000-0000-0000-000000000001","q":2}]','[{"forma":"credito","valor":14.00}]'),
  'ERR:ESTOQUE_ESGOTADO%', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000001')=1 and (select count(*) from vendas)=1$x$);

-- T4 escritas diretas negadas
select t.check('T4a caixa não insere venda direto', t.run(:'c1'::uuid, $q$insert into vendas(id,organizacao_id,evento_id,vendedor_id,valor_total,cortesia) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',1,false)$q$) like 'ERR:permission denied%');
select t.check('T4b caixa não altera estoque', t.run(:'c1'::uuid, format($q$update evento_produto set estoque_atual=999 where id='%s'$q$,:'pastel')) like 'ERR:permission denied%');
select t.after('T4c caixa não consegue alterar preço (RLS filtra 0 linhas)',
  t.run(:'c1'::uuid, format($q$with u as (update evento_produto set valor=0.01 where id='%s' returning 1) select count(*)::text from u$q$,:'pastel')),
  'OK:0', $x$select (select valor from evento_produto where id='60000000-0000-0000-0000-000000000001')=7.00$x$);
select t.check('T4d anon não lê vendas', t.run(null, 'select count(*)::text from vendas','anon') like 'ERR:permission denied%');
select t.check('T4e caixa não insere pagamento direto', t.run(:'c1'::uuid, $q$insert into vendas_pagamentos(venda_id,forma,valor) values ('a0000000-0000-0000-0000-000000000001','credito',1)$q$) like 'ERR:permission denied%');

-- T5 RLS de leitura
select t.check('T5a caixa2 não vê venda nem pagamentos do caixa1',
  t.run(:'c2'::uuid,'select count(*)::text from vendas')='OK:0' and t.run(:'c2'::uuid,'select count(*)::text from vendas_pagamentos')='OK:0');
select t.check('T5b caixa1 vê a própria venda e o pagamento',
  t.run(:'c1'::uuid,'select count(*)::text from vendas')='OK:1' and t.run(:'c1'::uuid,'select count(*)::text from vendas_pagamentos')='OK:1');
select t.check('T5c conselho vê tudo (vendas, itens, pagamentos)',
  t.run(:'con'::uuid,'select count(*)::text from vendas')='OK:1' and t.run(:'con'::uuid,'select count(*)::text from vendas_itens')='OK:2'
  and t.run(:'con'::uuid,'select count(*)::text from vendas_pagamentos')='OK:1');

-- T6 item avulso
select t.check('T6 avulso: 2 x 12,50 = 25,00 no cartão',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-000000000003',:'ev','[{"avulso":true,"desc":"Bolo inteiro","valor":12.50,"q":2}]','[{"forma":"credito","valor":25.00}]','valor_total') = 'OK:25.00');
select t.check('T6b avulso com valor negativo é recusado',
  t.fin(:'c1'::uuid,'a0000000-0000-0000-0000-000000000004',:'ev','[{"avulso":true,"desc":"x","valor":-5,"q":1}]','[{"forma":"credito","valor":5.00}]') like 'ERR:ITENS_INVALIDOS%');

-- T7 pagamentos parciais: 50,00 = cartão 15 + pix 17 + dinheiro 18 (entregou 20, troco 2)
create temp table px(txid text);
insert into px select split_part(t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 17.00, 'b0000000-0000-0000-0000-000000000001')$q$), ':', 2);
select t.check('T7a TXID do 1º Pix: EVT1V + 6 dígitos + A', (select txid ~ '^EVT1V[0-9]{6}A$' from px));
select t.check('T7b 2º QR da mesma venda tem o mesmo número e letra B',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 3.00, 'b0000000-0000-0000-0000-000000000001')$q$)
    = 'OK:' || left((select txid from px), 11) || 'B');
select t.check('T7c outra venda recebe outro número',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 5.00, 'b0000000-0000-0000-0000-000000000002')$q$)
    not like ('OK:' || left((select txid from px), 11) || '%'));
select t.check('T7d caixa2 não usa o número de outra venda',
  t.run(:'c2'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 5.00, 'b0000000-0000-0000-0000-000000000001')$q$) like 'ERR:VENDA_ID_EM_USO%');
-- o 2º QR (3,00) é descartado: cliente não pagou essa parte
select t.check('T7e descartar o QR B',
  t.run(:'c1'::uuid, format($q$select descartar_pix('%s')::text$q$, left((select txid from px), 11) || 'B')) like 'OK:%');
select t.check('T7f soma não fecha (49 de 50) é recusada',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":17,"txid":"%s","comprovante":"%s/%s/c.jpg"},{"forma":"dinheiro","valor":17,"recebido":20}]',(select txid from px),:'ev',:'c1')) like 'ERR:PAGAMENTO_NAO_FECHA%');
select t.check('T7g Pix com valor diferente do QR é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":18,"txid":"%s","comprovante":"%s/%s/c.jpg"},{"forma":"dinheiro","valor":17,"recebido":20}]',(select txid from px),:'ev',:'c1')) like 'ERR:PIX_INVALIDO%');
select t.check('T7h Pix sem comprovante é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":17,"txid":"%s"},{"forma":"dinheiro","valor":18,"recebido":20}]',(select txid from px))) like 'ERR:COMPROVANTE_OBRIGATORIO%');
select t.check('T7i comprovante de outro usuário é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":17,"txid":"%s","comprovante":"%s/%s/c.jpg"},{"forma":"dinheiro","valor":18,"recebido":20}]',(select txid from px),:'ev',:'c2')) like 'ERR:COMPROVANTE_INVALIDO%');
select t.check('T7j dinheiro recebido menor que o valor é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":17,"txid":"%s","comprovante":"%s/%s/c.jpg"},{"forma":"dinheiro","valor":18,"recebido":10}]',(select txid from px),:'ev',:'c1')) like 'ERR:PAGAMENTOS_INVALIDOS%');
select t.check('T7k cartão com campo extra (recebido) é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10','[{"forma":"credito","valor":50,"recebido":50}]') like 'ERR:PAGAMENTOS_INVALIDOS%');
select t.check('T7l mais de 6 pagamentos é recusado',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10','[{"forma":"credito","valor":5},{"forma":"credito","valor":5},{"forma":"credito","valor":5},{"forma":"credito","valor":5},{"forma":"credito","valor":5},{"forma":"credito","valor":5},{"forma":"credito","valor":20}]') like 'ERR:PAGAMENTOS_INVALIDOS%');
select t.after('T7m venda mista fecha (troco 2,00) e o QR vira convertido',
  t.fin_json(:'c1'::uuid,'b0000000-0000-0000-0000-000000000001',:'ev',:'r10',
    format('[{"forma":"credito","valor":15},{"forma":"pix","valor":17,"txid":"%s","comprovante":"%s/%s/c.jpg"},{"forma":"dinheiro","valor":18,"recebido":20}]',(select txid from px),:'ev',:'c1'),'troco_total'),
  'OK:2.00', $x$select situacao='convertido_em_venda' from pix_gerados where txid=(select txid from px)$x$);
select t.check('T7n o número da venda é o do TXID e há 3 pagamentos',
  (select numero from vendas where id='b0000000-0000-0000-0000-000000000001') = substr((select txid from px),6,6)::int
  and (select count(*) from vendas_pagamentos where venda_id='b0000000-0000-0000-0000-000000000001') = 3);
select t.check('T7o QR já convertido não pode ser reutilizado em outra venda',
  t.fin(:'c1'::uuid,'b0000000-0000-0000-0000-000000000009',:'ev',:'r1',
    format('[{"forma":"pix","valor":17,"txid":"%s","comprovante":"%s/%s/c.jpg"}]',(select txid from px),:'ev',:'c1')) like 'ERR:%');
select t.check('T7p venda finalizada não aceita novo QR',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 5.00, 'b0000000-0000-0000-0000-000000000001')$q$) like 'ERR:VENDA_JA_FINALIZADA%');

select t.after('T7q débito é aceito e entra no relatório como forma própria',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000e1',:'ev',:'r1','[{"forma":"debito","valor":5}]','valor_total'),
  'OK:5.00', $x$select (select total from v_vendas_por_forma where forma_pagamento='debito') = 5.00$x$);
select t.check('T7r "cartao" (forma antiga) é recusada',
  t.fin(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000e2',:'ev',:'r1','[{"forma":"cartao","valor":5}]') like 'ERR:PAGAMENTOS_INVALIDOS%');
select t.check('T7s troco considera as outras formas: 50 = crédito 15 + débito 15 + dinheiro 20 (entregou 50): troco 30',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000e3',:'ev',:'r10','[{"forma":"credito","valor":15},{"forma":"debito","valor":15},{"forma":"dinheiro","valor":20,"recebido":50}]','troco_total') = 'OK:30.00');

-- T8 dois Pix na mesma venda (A e B) + cartão
delete from px;
insert into px select split_part(t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 10.00, 'b0000000-0000-0000-0000-000000000003')$q$), ':', 2);
insert into px select split_part(t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000001', 20.00, 'b0000000-0000-0000-0000-000000000003')$q$), ':', 2);
select t.check('T8a dois QR da mesma venda: ...A e ...B', (select count(*) = 2 and count(distinct left(txid,11)) = 1 and bool_or(txid like '%A') and bool_or(txid like '%B') from px));
select t.after('T8b venda com dois Pix + cartão fecha (30,00)',
  t.fin_json(:'c1'::uuid,'b0000000-0000-0000-0000-000000000003',:'ev',:'r6',
    format('[{"forma":"pix","valor":10,"txid":"%s","comprovante":"%s/%s/a.jpg"},{"forma":"pix","valor":20,"txid":"%s","comprovante":"%s/%s/b.jpg"}]',
      (select txid from px where txid like '%A'),:'ev',:'c1',(select txid from px where txid like '%B'),:'ev',:'c1'),'valor_total'),
  'OK:30.00', $x$select (select count(*) from pix_gerados where venda_id='b0000000-0000-0000-0000-000000000003' and situacao='convertido_em_venda')=2$x$);

-- T9 cortesia e totais
select t.after('T9a cortesia: total 0 com pagamentos [] e venda marcada como cortesia',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-000000000007',:'ev',format('[{"ep":"%s","q":1}]',:'brinde'),'[]','valor_total'),
  'OK:0.00', $x$select cortesia from vendas where id='a0000000-0000-0000-0000-000000000007'$x$);
select t.check('T9b total > 0 sem pagamentos é recusado',
  t.fin(:'c1'::uuid,'a0000000-0000-0000-0000-000000000008',:'ev',:'r1','[]') like 'ERR:PAGAMENTO_NAO_FECHA%');
select t.check('T9c total 0 com pagamento é recusado',
  t.fin(:'c1'::uuid,'a0000000-0000-0000-0000-000000000009',:'ev',format('[{"ep":"%s","q":1}]',:'brinde'),'[{"forma":"dinheiro","valor":1,"recebido":1}]') like 'ERR:PAGAMENTO_NAO_FECHA%');

-- T10 período e papel
select t.check('T10a evento fora do período é recusado',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000002', 5, gen_random_uuid())$q$) like 'ERR:EVENTO_FORA_DO_PERIODO%');
select t.check('T10b conselho não vende',
  t.fin(:'con'::uuid,'a0000000-0000-0000-0000-00000000000a',:'ev',:'r1','[{"forma":"credito","valor":5}]') like 'ERR:SEM_PERMISSAO%');

-- T11 remessa, preço e auditoria
select t.check('T11a secretaria adiciona remessa (+50): 1 -> 51', t.run(:'sec'::uuid, format($q$select adicionar_remessa('%s',50)::text$q$,:'pastel'))='OK:51');
select t.check('T11b caixa não adiciona remessa', t.run(:'c1'::uuid, format($q$select adicionar_remessa('%s',50)::text$q$,:'pastel')) like 'ERR:SEM_PERMISSAO%');
select t.check('T11c item ilimitado não recebe remessa', t.run(:'sec'::uuid, format($q$select adicionar_remessa('%s',5)::text$q$,:'rifa')) like 'ERR:ITEM_ILIMITADO%');
select t.after('T11d secretaria altera preço e gera log',
  t.run(:'sec'::uuid, format($q$with u as (update evento_produto set valor=8.00 where id='%s' returning 1) select count(*)::text from u$q$,:'pastel')),
  'OK:1', $x$select exists(select 1 from logs_auditoria where acao='PRECO_ALTERADO')$x$);
select t.check('T11e venda antiga mantém preço congelado (7,00)', (select valor_unitario from vendas_itens where nome='Pastel' limit 1)=7.00);
select t.check('T11f logs são imutáveis', t.run(null, 'update logs_auditoria set acao=''x'' returning 1','postgres') like 'ERR:logs_auditoria é append-only%');
select t.check('T11g caixa não lê logs', t.run(:'c1'::uuid,'select count(*)::text from logs_auditoria')='OK:0');

-- T12 cardápio público
select t.check('T12a anon lê cardápio com 3 itens, sem estoque exato',
  t.run(null,'select jsonb_array_length(cardapio_publico()->''itens'')::text','anon')='OK:3'
  and t.run(null,'select (cardapio_publico()->''itens''->0 ? ''estoque_atual'')::text','anon')='OK:false');
select t.check('T12b anon não executa finalizar_venda nem registrar_pix',
  t.run(null,$q$select finalizar_venda(gen_random_uuid(),'50000000-0000-0000-0000-000000000001','[]','[]')::text$q$,'anon') like 'ERR:permission denied%'
  and t.run(null,$q$select registrar_pix('50000000-0000-0000-0000-000000000001',1,gen_random_uuid())$q$,'anon') like 'ERR:permission denied%');
select t.check('T12c Outros não aparece no cardápio',
  not exists(select 1 from jsonb_array_elements(cardapio_publico()->'itens') i where i->>'nome'='Outros'));

-- T13 relatórios
select t.check('T13a quantidades vendidas (pastel = 2)', (select quantidade from v_itens_vendidos where nome='Pastel') = 2);
select t.check('T13b relatório por forma: dinheiro aplicado 57,00 (19+18+20), recebido 90,00, troco 33,00',
  (select total from v_vendas_por_forma where forma_pagamento='dinheiro') = 57.00
  and (select total_recebido from v_vendas_por_forma where forma_pagamento='dinheiro') = 90.00
  and (select total_troco from v_vendas_por_forma where forma_pagamento='dinheiro') = 33.00);
select t.check('T13c Pix total 47,00 (17+10+20)', (select sum(total) from v_vendas_por_forma where forma_pagamento='pix') = 47.00);

-- T14 numeração por evento e funções internas
insert into eventos(id,organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id) values
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','EVT3','Outro evento',
  (now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,'40000000-0000-0000-0000-000000000001');
insert into evento_produto(id,evento_id,produto_id,valor,estoque_inicial) values
 ('60000000-0000-0000-0000-000000000009','50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',5.00,null);
select t.check('T14a outro evento começa do número 1',
  t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000f1','50000000-0000-0000-0000-000000000003','[{"ep":"60000000-0000-0000-0000-000000000009","q":1}]','[{"forma":"credito","valor":5}]','numero')='OK:1');
select t.check('T14b Pix do evento 3 = EVT3V000002A',
  t.run(:'c1'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000003', 5, 'b0000000-0000-0000-0000-0000000000f2')$q$) = 'OK:EVT3V000002A');
select t.check('T14c números únicos por evento', (select count(*) = count(distinct numero) from vendas where evento_id = :'ev'));
select t.check('T14d funções internas e tabelas de controle fechadas para o caixa',
  t.run(:'c1'::uuid, $q$select _proximo_numero('50000000-0000-0000-0000-000000000003')::text$q$) like 'ERR:permission denied%'
  and t.run(:'c1'::uuid, $q$select _txid_da_venda('X',1,1)$q$) like 'ERR:permission denied%'
  and t.run(:'c1'::uuid, $q$select _numero_da_venda(gen_random_uuid(),'50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1')::text$q$) like 'ERR:permission denied%'
  and t.run(:'c1'::uuid, 'select count(*)::text from evento_contadores') like 'ERR:permission denied%'
  and t.run(:'c1'::uuid, 'select count(*)::text from vendas_numeros') like 'ERR:permission denied%');
select t.check('T14e "Outros" não entra no cardápio',
  t.run(null,$q$insert into evento_produto(evento_id,produto_id,valor) select '50000000-0000-0000-0000-000000000001', id, 1 from produtos where tipo='avulso' returning 1$q$,'postgres') like 'ERR:PRODUTO_AVULSO%');

-- T16 cadastro de produto direto nas tabelas, como o app faz (secretaria permitida, caixa não)
select t.after('T16a secretaria cria produto com foto genérica',
  t.run(:'sec'::uuid, $q$with i as (insert into produtos(organizacao_id,categoria_id,nome,imagem_path) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Produto novo','generico/pastel') returning id) select count(*)::text from i$q$),
  'OK:1', $x$select exists(select 1 from produtos where nome='Produto novo' and imagem_path='generico/pastel')$x$);
select t.after('T16b secretaria coloca o produto no cardápio do evento com valor e estoque inicial',
  t.run(:'sec'::uuid, format($q$with i as (insert into evento_produto(evento_id,produto_id,valor,estoque_inicial) select '%s', id, 9.50, 30 from produtos where nome='Produto novo' returning id) select count(*)::text from i$q$, :'ev')),
  'OK:1', $x$select (select estoque_atual from evento_produto ep join produtos p on p.id=ep.produto_id where p.nome='Produto novo') = 30$x$);
select t.after('T16c secretaria edita o nome do produto',
  t.run(:'sec'::uuid, $q$with u as (update produtos set nome='Produto editado' where nome='Produto novo' returning 1) select count(*)::text from u$q$),
  'OK:1', $x$select exists(select 1 from produtos where nome='Produto editado')$x$);
select t.after('T16c2 secretaria altera o valor do produto no evento',
  t.run(:'sec'::uuid, $q$with u as (update evento_produto set valor=10 where produto_id=(select id from produtos where nome='Produto editado') returning 1) select count(*)::text from u$q$),
  'OK:1', $x$select (select valor from evento_produto where produto_id=(select id from produtos where nome='Produto editado')) = 10.00$x$);
select t.check('T16d caixa não cria produto',
  t.run(:'c1'::uuid, $q$insert into produtos(organizacao_id,categoria_id,nome) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Do caixa')$q$) like 'ERR:new row violates row-level security%');
select t.check('T16e caixa não coloca produto no cardápio',
  t.run(:'c1'::uuid, format($q$insert into evento_produto(evento_id,produto_id,valor,estoque_inicial) select '%s', id, 1, 1 from produtos where nome='Produto editado'$q$, :'ev')) like 'ERR:new row violates row-level security%');
select t.check('T16f produto novo aparece no cardápio público e na venda',
  exists(select 1 from jsonb_array_elements(cardapio_publico()->'itens') i where i->>'nome'='Produto editado')
  and t.fin_json(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000f9',:'ev',
        format('[{"ep":"%s","q":2}]',(select ep.id from evento_produto ep join produtos p on p.id=ep.produto_id where p.nome='Produto editado')),
        '[{"forma":"debito","valor":20}]','valor_total') = 'OK:20.00');

-- T17 gestão de usuários e encerramento de evento
\set adm '00000000-0000-0000-0000-0000000000d1'
select t.after('T17a admin troca o perfil do caixa 2 para secretaria',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001',array['secretaria'],true)::text$q$),
  'OK:%', $x$select (select papel from membros where usuario_id='00000000-0000-0000-0000-0000000000a2')='secretaria' and exists(select 1 from logs_auditoria where acao='MEMBRO_ALTERADO')$x$);
select t.check('T17b só admin altera membros',
  t.run(:'sec'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001',array['admin'],true)::text$q$) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'con'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001',array['admin'],true)::text$q$) like 'ERR:SEM_PERMISSAO%');
select t.check('T17c admin não rebaixa nem desativa a si mesmo',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001',array['caixa'],true)::text$q$) like 'ERR:NAO_PODE_ALTERAR_A_SI_MESMO%'
  and t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001',array['admin'],false)::text$q$) like 'ERR:NAO_PODE_ALTERAR_A_SI_MESMO%');
select t.check('T17d perfil inválido e usuário inexistente são recusados',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001',array['presidente'],true)::text$q$) like 'ERR:DADOS_INVALIDOS%'
  and t.run(:'adm'::uuid, $q$select alterar_membro(gen_random_uuid(),'10000000-0000-0000-0000-000000000001',array['caixa'],true)::text$q$) like 'ERR:USUARIO_INEXISTENTE%');
select t.after('T17e usuário desativado perde o acesso na hora (RLS)',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001',array['caixa'],false)::text$q$),
  'OK:%', $x$select true$x$);
select t.check('T17f caixa desativado não vê eventos nem consegue vender',
  t.run(:'c1'::uuid, 'select count(*)::text from eventos') = 'OK:0'
  and t.fin(:'c1'::uuid,'a0000000-0000-0000-0000-0000000000f7',:'ev',:'r1','[{"forma":"debito","valor":5}]') like 'ERR:SEM_PERMISSAO%');
select t.after('T17g encerrar o evento cancela os QR Pix pendentes',
  t.run(:'con'::uuid, $q$with u as (update eventos set status='encerrado' where id='50000000-0000-0000-0000-000000000003' returning 1) select count(*)::text from u$q$),
  'OK:1', $x$select (select situacao from pix_gerados where txid='EVT3V000002A')='cancelado_por_encerramento' and exists(select 1 from logs_auditoria where acao='EVENTO_ENCERRADO')$x$);
select t.check('T17h evento encerrado não aceita QR nem venda',
  t.run(:'sec'::uuid, $q$select registrar_pix('50000000-0000-0000-0000-000000000003', 5, gen_random_uuid())$q$) like 'ERR:EVENTO_FORA_DO_PERIODO%');
select t.check('T17i conselho cria evento e chave Pix (permitido); caixa/secretaria não',
  t.run(:'con'::uuid, $q$with i as (insert into chaves_pix(organizacao_id,chave,descricao) values ('10000000-0000-0000-0000-000000000001','outra-chave','Reserva') returning id) select count(*)::text from i$q$) = 'OK:1'
  and t.run(:'sec'::uuid, $q$insert into chaves_pix(organizacao_id,chave) values ('10000000-0000-0000-0000-000000000001','x')$q$) like 'ERR:new row violates row-level security%'
  and t.run(:'sec'::uuid, $q$insert into eventos(organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id) values ('10000000-0000-0000-0000-000000000001','Z1','x',current_date,current_date,'40000000-0000-0000-0000-000000000001')$q$) like 'ERR:new row violates row-level security%');

-- T18 copiar cardápio de outro evento
select t.after('T18a secretaria copia o cardápio do evento 1 para o 2: todos os itens, estoque controlado entra com 0',
  t.run(:'sec'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002')::text$q$),
  'OK:4', $x$select (select estoque_inicial from evento_produto where evento_id='50000000-0000-0000-0000-000000000002' and produto_id='30000000-0000-0000-0000-000000000001') = 0
  and (select estoque_inicial is null from evento_produto where evento_id='50000000-0000-0000-0000-000000000002' and produto_id='30000000-0000-0000-0000-000000000002')
  and (select valor from evento_produto where evento_id='50000000-0000-0000-0000-000000000002' and produto_id='30000000-0000-0000-0000-000000000001') = (select valor from evento_produto where evento_id='50000000-0000-0000-0000-000000000001' and produto_id='30000000-0000-0000-0000-000000000001')
  and exists(select 1 from logs_auditoria where acao='CARDAPIO_COPIADO')$x$);
select t.check('T18b copiar de novo não duplica nem sobrescreve (0 itens)',
  t.run(:'con'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002', true)::text$q$) = 'OK:0'
  and (select estoque_inicial from evento_produto where evento_id='50000000-0000-0000-0000-000000000002' and produto_id='30000000-0000-0000-0000-000000000001') = 0);
select t.check('T18c caixa não copia; mesmo evento e evento inexistente são recusados',
  t.run(:'c1'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002')::text$q$) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'con'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')::text$q$) like 'ERR:EVENTOS_IGUAIS%'
  and t.run(:'con'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001', gen_random_uuid())::text$q$) like 'ERR:EVENTO_INEXISTENTE%');
insert into eventos(id,organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id)
  values ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','EVT4','Evento novo',current_date,current_date,'40000000-0000-0000-0000-000000000001');
select t.after('T18d com p_copiar_estoque o estoque inicial é levado junto',
  t.run(:'adm'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004', true)::text$q$),
  'OK:4', $x$select (select estoque_inicial from evento_produto where evento_id='50000000-0000-0000-0000-000000000004' and produto_id='30000000-0000-0000-0000-000000000001') = 3$x$);

-- ---------- T19: vários perfis por pessoa --------------------------------
select t.after('T19a admin libera dois perfis (secretaria e caixa) para a mesma pessoa; o ativo continua secretaria',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001',array['secretaria','caixa'],true)::text$q$),
  'OK:%', $x$select (select papel from membros where usuario_id='00000000-0000-0000-0000-0000000000b1')='secretaria'
    and (select papeis_permitidos from membros where usuario_id='00000000-0000-0000-0000-0000000000b1') @> array['secretaria','caixa']::papel_usuario[]$x$);
select t.after('T19b a pessoa troca para caixa (perfil permitido) e a troca fica no log',
  t.run(:'sec'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','caixa')::text$q$),
  'OK:%', $x$select (select papel from membros where usuario_id='00000000-0000-0000-0000-0000000000b1')='caixa'
    and exists(select 1 from logs_auditoria where acao='PAPEL_TROCADO')$x$);
select t.check('T19c como caixa, não faz o que é da secretaria (copiar cardápio)',
  t.run(:'sec'::uuid, $q$select copiar_cardapio('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002')::text$q$) like 'ERR:SEM_PERMISSAO%');
select t.check('T19d perfil não liberado é recusado (admin/conselho) e usuário sem vínculo ativo também',
  t.run(:'sec'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','admin')::text$q$) like 'ERR:PAPEL_NAO_PERMITIDO%'
  and t.run(:'sec'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','presidente')::text$q$) like 'ERR:PAPEL_NAO_PERMITIDO%'
  and t.run(:'c1'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','caixa')::text$q$) like 'ERR:SEM_PERMISSAO%');
select t.after('T19e admin tira o perfil ativo da lista: o ativo passa para o primeiro informado',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001',array['secretaria'],true)::text$q$),
  'OK:%', $x$select (select papel from membros where usuario_id='00000000-0000-0000-0000-0000000000b1')='secretaria'$x$);
select t.check('T19f admin não pode tirar o perfil admin de si mesmo',
  t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001',array['admin','caixa'],true)::text$q$) like 'OK:%'
  and t.run(:'adm'::uuid, $q$select alterar_membro('00000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001',array['caixa','conselho'],true)::text$q$) like 'ERR:NAO_PODE_ALTERAR_A_SI_MESMO%');

-- ---------- T20: turno do caixa, sangria, fechamento cego e conferência -------
\set ev5 '50000000-0000-0000-0000-000000000005'
\set a3 '00000000-0000-0000-0000-0000000000a3'
\set a4 '00000000-0000-0000-0000-0000000000a4'
insert into auth.users(id,email) values (:'a3','cx3'),(:'a4','ambos');
insert into perfis(id,nome,cpf) values (:'a3','Caixa 3','66666666666'),(:'a4','Caixa e Conselho','77777777777');
insert into membros(usuario_id,organizacao_id,papel) values (:'a3','10000000-0000-0000-0000-000000000001','caixa');
insert into membros(usuario_id,organizacao_id,papel,papeis_permitidos) values (:'a4','10000000-0000-0000-0000-000000000001','caixa','{caixa,conselho}');
insert into eventos(id,organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id)
  values (:'ev5','10000000-0000-0000-0000-000000000001','EVT5','Evento do caixa',
  (now() at time zone 'America/Sao_Paulo')::date - 1,(now() at time zone 'America/Sao_Paulo')::date + 1,'40000000-0000-0000-0000-000000000001');
insert into evento_produto(id,evento_id,produto_id,valor,estoque_inicial) values
 ('60000000-0000-0000-0000-000000000051',:'ev5','30000000-0000-0000-0000-000000000002',10.00,null);
\set r5 '[{"ep":"60000000-0000-0000-0000-000000000051","q":2}]'
\set r5b '[{"ep":"60000000-0000-0000-0000-000000000051","q":1}]'

select t.check('T20a só caixa/secretaria abrem turno; fundo inválido e evento inexistente são recusados',
  t.run(:'con'::uuid, format($q$select abrir_turno('%s', 50)::text$q$, :'ev5')) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'a3'::uuid, format($q$select abrir_turno('%s', -1)::text$q$, :'ev5')) like 'ERR:FUNDO_INVALIDO%'
  and t.run(:'a3'::uuid, $q$select abrir_turno(gen_random_uuid(), 50)::text$q$) like 'ERR:EVENTO_INEXISTENTE%');
select t.after('T20b caixa abre o turno com fundo de 50,00; abrir outro enquanto há um aberto é recusado',
  t.run(:'a3'::uuid, format($q$select abrir_turno('%s', 50)::text$q$, :'ev5')),
  'OK:%', format($x$select (select fundo_inicial from turnos_caixa where caixa_id='%s' and fechado_em is null) = 50
    and (select count(*) from logs_auditoria where acao='TURNO_ABERTO') >= 1$x$, :'a3'));
select t.check('T20c segundo turno aberto do mesmo caixa -> TURNO_JA_ABERTO',
  t.run(:'a3'::uuid, format($q$select abrir_turno('%s', 10)::text$q$, :'ev5')) like 'ERR:TURNO_JA_ABERTO%');
-- vendas do turno: dinheiro 20,00 (recebido 50) e débito 10,00
select t.check('T20d vendas em dinheiro e débito entram no turno',
  t.fin(:'a3'::uuid,'a0000000-0000-0000-0000-0000000020d1',:'ev5',:'r5','[{"forma":"dinheiro","valor":20,"recebido":50}]') like 'OK:%'
  and t.fin(:'a3'::uuid,'a0000000-0000-0000-0000-0000000020d2',:'ev5',:'r5b','[{"forma":"debito","valor":10}]') like 'OK:%');
select t.after('T20e caixa registra sangria de 30,00; só o dono do turno registra; valor inválido é recusado',
  t.run(:'a3'::uuid, format($q$select registrar_sangria('%s', 30, 'Levar ao cofre')::text$q$, (select id from turnos_caixa where caixa_id=:'a3')) ),
  'OK:%', $x$select (select count(*) from sangrias) = 1$x$);
select t.check('T20f outro caixa, valor zero e valor com 3 casas são recusados',
  t.run(:'c2'::uuid, format($q$select registrar_sangria('%s', 5)::text$q$, (select id from turnos_caixa where caixa_id=:'a3')) ) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'a3'::uuid, format($q$select registrar_sangria('%s', 0)::text$q$, (select id from turnos_caixa where caixa_id=:'a3')) ) like 'ERR:VALOR_INVALIDO%'
  and t.run(:'a3'::uuid, format($q$select registrar_sangria('%s', 1.234)::text$q$, (select id from turnos_caixa where caixa_id=:'a3')) ) like 'ERR:VALOR_INVALIDO%');
select t.check('T20g caixa não confirma sangria; Conselho confirma; confirmar de novo é recusado',
  t.run(:'a3'::uuid, format($q$select confirmar_sangria('%s')::text$q$, (select id from sangrias limit 1))) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'con'::uuid, format($q$select confirmar_sangria('%s')::text$q$, (select id from sangrias limit 1))) like 'OK:%'
  and t.run(:'con'::uuid, format($q$select confirmar_sangria('%s')::text$q$, (select id from sangrias limit 1))) like 'ERR:JA_CONFIRMADA%');
select t.check('T20h caixa não vê o turno de outro caixa (RLS)',
  t.run(:'c2'::uuid, 'select count(*)::text from turnos_caixa') = 'OK:0'
  and t.run(:'a3'::uuid, 'select count(*)::text from turnos_caixa') = 'OK:1'
  and t.run(:'con'::uuid, 'select count(*)::text from turnos_caixa') = 'OK:1');
select t.check('T20i caixa não pode chamar a conferência nem conferir',
  t.run(:'a3'::uuid, format($q$select conferencia_turnos('%s')::text$q$, :'ev5')) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'a3'::uuid, format($q$select conferir_turno('%s')::text$q$, (select id from turnos_caixa limit 1))) like 'ERR:SEM_PERMISSAO%');
select t.check('T20j não confere turno ainda aberto',
  t.run(:'con'::uuid, format($q$select conferir_turno('%s')::text$q$, (select id from turnos_caixa limit 1))) like 'ERR:TURNO_ABERTO%');
-- fechamento cego: contou 39,00 (esperado 50 + 20 − 30 = 40,00; débito não entra na gaveta)
select t.after('T20k caixa fecha informando só o contado (39,00); fechar de novo ou sangrar depois é recusado',
  t.run(:'a3'::uuid, format($q$select fechar_turno('%s', 39, 'faltou um troco')::text$q$, (select id from turnos_caixa limit 1))),
  'OK:%', $x$select (select contado_dinheiro from turnos_caixa limit 1) = 39$x$);
select t.check('T20l turno fechado não aceita novo fechamento nem sangria',
  t.run(:'a3'::uuid, format($q$select fechar_turno('%s', 40)::text$q$, (select id from turnos_caixa limit 1))) like 'ERR:TURNO_FECHADO%'
  and t.run(:'a3'::uuid, format($q$select registrar_sangria('%s', 5)::text$q$, (select id from turnos_caixa limit 1))) like 'ERR:TURNO_FECHADO%');
select t.check('T20m Conselho vê esperado 40,00, contado 39,00 e diferença −1,00; débito aparece como outra forma',
  (select (j->0->>'esperado')::numeric = 40 and (j->0->>'contado')::numeric = 39 and (j->0->>'diferenca')::numeric = -1
          and (j->0->'outras_formas'->>'debito')::numeric = 10 and (j->0->>'vendas_dinheiro')::numeric = 20
          and (j->0->>'sangrias_pendentes')::numeric = 0
     from (select substring(t.run(:'con'::uuid, format($q$select conferencia_turnos('%s')::text$q$, :'ev5')) from 4)::jsonb as j) x));
select t.check('T20n Conselho confere o turno; conferir de novo é recusado',
  t.run(:'con'::uuid, format($q$select conferir_turno('%s','ok, diferença de 1 real')::text$q$, (select id from turnos_caixa limit 1))) like 'OK:%'
  and t.run(:'con'::uuid, format($q$select conferir_turno('%s')::text$q$, (select id from turnos_caixa limit 1))) like 'ERR:JA_CONFERIDO%');
-- quem tem caixa + conselho não confere nem confirma o próprio turno
select t.check('T20o pessoa com os dois perfis abre, sangra e fecha como caixa',
  t.run(:'a4'::uuid, format($q$select abrir_turno('%s', 20)::text$q$, :'ev5')) like 'OK:%');
select t.check('T20p ...registra sangria e fecha o turno',
  t.run(:'a4'::uuid, format($q$select registrar_sangria('%s', 5)::text$q$, (select id from turnos_caixa where caixa_id=:'a4'))) like 'OK:%');
select t.check('T20q ...fecha o turno',
  t.run(:'a4'::uuid, format($q$select fechar_turno('%s', 15)::text$q$, (select id from turnos_caixa where caixa_id=:'a4'))) like 'OK:%');
select t.check('T20r ...troca para conselho',
  t.run(:'a4'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','conselho')::text$q$) like 'OK:%');
select t.check('T20s como conselho NÃO vê esperado/diferença do próprio turno e não confere nem confirma sangria dele',
  substring(t.run(:'a4'::uuid, format($q$select conferencia_turnos('%s')::text$q$, :'ev5')) from 4)::jsonb @> '[{"proprio": true, "esperado": null, "diferenca": null}]'
  and t.run(:'a4'::uuid, format($q$select conferir_turno('%s')::text$q$, (select id from turnos_caixa where caixa_id=:'a4'))) like 'ERR:PROPRIO_TURNO%'
  and t.run(:'a4'::uuid, format($q$select confirmar_sangria('%s')::text$q$, (select id from sangrias where turno_id=(select id from turnos_caixa where caixa_id=:'a4')))) like 'ERR:PROPRIO_TURNO%');

-- ---------- T21: anulação de venda ------------------------------------------
\set ev6 '50000000-0000-0000-0000-000000000006'
insert into eventos(id,organizacao_id,codigo,nome,data_inicio,data_fim,chave_pix_id)
  values (:'ev6','10000000-0000-0000-0000-000000000001','EVT6','Evento da anulação',
  (now() at time zone 'America/Sao_Paulo')::date - 1,(now() at time zone 'America/Sao_Paulo')::date + 1,'40000000-0000-0000-0000-000000000001');
insert into evento_produto(id,evento_id,produto_id,valor,estoque_inicial) values
 ('60000000-0000-0000-0000-000000000061',:'ev6','30000000-0000-0000-0000-000000000001',10.00,5);
\set r6a '[{"ep":"60000000-0000-0000-0000-000000000061","q":3}]'
select t.after('T21a venda de 3 pastéis (30,00): 10 em débito + 20 em dinheiro; estoque 5 -> 2',
  t.fin(:'a3'::uuid,'a0000000-0000-0000-0000-0000000021a1',:'ev6',:'r6a','[{"forma":"debito","valor":10},{"forma":"dinheiro","valor":20,"recebido":20}]'),
  'OK:%', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000061') = 2$x$);
select t.check('T21b caixa não anula; Conselho sem motivo é recusado',
  t.run(:'a3'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', null, '[]', 'erro de digitação', true)::text$q$) like 'ERR:SEM_PERMISSAO%'
  and t.run(:'con'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', null, '[{"forma":"debito","valor":10},{"forma":"dinheiro","valor":20}]', '  ', true)::text$q$) like 'ERR:MOTIVO_OBRIGATORIO%');
select t.check('T21c quantidade acima da vendida e item de outra venda são recusados',
  t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":4}]', '[{"forma":"dinheiro","valor":40}]', 'cliente desistiu', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))) like 'ERR:QUANTIDADE_INVALIDA%'
  and t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":1}]', '[{"forma":"dinheiro","valor":10}]', 'cliente desistiu', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000020d1'))) like 'ERR:QUANTIDADE_INVALIDA%');
select t.check('T21d estorno que não bate com o valor, forma não paga ou acima do pago é recusado',
  t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":1}]', '[{"forma":"dinheiro","valor":5}]', 'cliente desistiu', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))) like 'ERR:ESTORNO_INVALIDO%'
  and t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":1}]', '[{"forma":"pix","valor":10}]', 'cliente desistiu', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))) like 'ERR:ESTORNO_INVALIDO%'
  and t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":3}]', '[{"forma":"debito","valor":30}]', 'cliente desistiu', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))) like 'ERR:ESTORNO_INVALIDO%');
select t.after('T21e anulação parcial de 1 pastel (10,00 em débito): venda fica parcialmente anulada e o estoque volta (2 -> 3)',
  t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":1}]', '[{"forma":"debito","valor":10}]', 'cliente devolveu um pastel', true)->>'status'$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))),
  'OK:parcialmente_anulada', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000061') = 3
    and (select status::text from vendas where id='a0000000-0000-0000-0000-0000000021a1') = 'parcialmente_anulada'
    and (select quantidade_anulada from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1') = 1
    and exists(select 1 from logs_auditoria where acao='VENDA_ANULADA' and detalhes->>'motivo' = 'cliente devolveu um pastel')$x$);
select t.check('T21f o débito já devolvido não pode ser devolvido de novo',
  t.run(:'con'::uuid, format($q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', '[{"item":"%s","q":1}]', '[{"forma":"debito","valor":10}]', 'segunda tentativa', true)::text$q$, (select id from vendas_itens where venda_id='a0000000-0000-0000-0000-0000000021a1'))) like 'ERR:ESTORNO_INVALIDO%');
select t.after('T21g anular o resto (2 pastéis, 20,00 em dinheiro), sem devolver ao estoque: venda anulada e estoque continua 3',
  t.run(:'con'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', null, '[{"forma":"dinheiro","valor":20}]', 'perdeu o pedido; o produto já foi feito', false)->>'status'$q$),
  'OK:anulada', $x$select (select estoque_atual from evento_produto where id='60000000-0000-0000-0000-000000000061') = 3
    and (select status::text from vendas where id='a0000000-0000-0000-0000-0000000021a1') = 'anulada'$x$);
select t.check('T21h venda totalmente anulada não anula de novo',
  t.run(:'con'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021a1', null, '[]', 'de novo', true)::text$q$) like 'ERR:VENDA_ANULADA%');
select t.check('T21i só Conselho/admin leem as anulações (caixa e outros não)',
  t.run(:'con'::uuid, 'select count(*)::text from anulacoes') = 'OK:2'
  and t.run(:'a3'::uuid, 'select count(*)::text from anulacoes') = 'OK:0'
  and t.run(:'con'::uuid, 'select count(*)::text from anulacoes_estornos') = 'OK:2');
-- quem tem caixa + conselho não anula a própria venda (a4 já está como conselho; volta a caixa, vende, e tenta)
select t.check('T21j pessoa com os dois perfis vende como caixa e, como conselho, não anula a própria venda',
  t.run(:'a4'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','caixa')::text$q$) like 'OK:%'
  and t.fin(:'a4'::uuid,'a0000000-0000-0000-0000-0000000021b1',:'ev6','[{"ep":"60000000-0000-0000-0000-000000000061","q":1}]','[{"forma":"debito","valor":10}]') like 'OK:%'
  and t.run(:'a4'::uuid, $q$select trocar_papel('10000000-0000-0000-0000-000000000001','conselho')::text$q$) like 'OK:%'
  and t.run(:'a4'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021b1', null, '[{"forma":"debito","valor":10}]', 'teste da própria venda', true)::text$q$) like 'ERR:PROPRIA_VENDA%');
-- devolução em dinheiro durante o turno entra na conta da gaveta
select t.check('T21k a3 abre novo turno (fundo 10,00) e vende 1 pastel de 10,00 em dinheiro',
  t.run(:'a3'::uuid, format($q$select abrir_turno('%s', 10)::text$q$, :'ev6')) like 'OK:%'
  and t.fin(:'a3'::uuid,'a0000000-0000-0000-0000-0000000021c1',:'ev6','[{"ep":"60000000-0000-0000-0000-000000000061","q":1}]','[{"forma":"dinheiro","valor":10,"recebido":10}]') like 'OK:%');
select t.check('T21l Conselho devolve esse dinheiro; a3 fecha contando 10,00; esperado = 10 + 10 − 10 = 10,00 e diferença 0',
  t.run(:'con'::uuid, $q$select anular_venda('a0000000-0000-0000-0000-0000000021c1', null, '[{"forma":"dinheiro","valor":10}]', 'cliente desistiu na hora', true)::text$q$) like 'OK:%'
  and t.run(:'a3'::uuid, format($q$select fechar_turno('%s', 10)::text$q$, (select id from turnos_caixa where caixa_id=:'a3' and fechado_em is null))) like 'OK:%'
  and (select (j @> format('[{"caixa":"Caixa 3","esperado":10,"contado":10,"diferenca":0,"devolucoes_dinheiro":10,"vendas_dinheiro":10}]')::jsonb)
         from (select substring(t.run(:'con'::uuid, format($q$select conferencia_turnos('%s')::text$q$, :'ev6')) from 4)::jsonb as j) x));

select n, case when ok then 'PASS' else 'FAIL' end as resultado, nome from t.res where not ok order by n;
select count(*) filter (where ok) as passou, count(*) filter (where not ok) as falhou from t.res;
