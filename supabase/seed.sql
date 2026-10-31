-- =====================================================================
-- DADOS DE EXEMPLO — SOMENTE para o banco LOCAL (supabase db reset).
-- O `db push` não executa este arquivo; nunca rode no training/prod.
-- Usuários de teste (senha de todos: senha1234):
--   admin      CPF 529.982.247-25
--   secretaria CPF 390.533.447-05
--   caixa      CPF 111.444.777-35
-- Login no app: CPF + senha (e-mail sintético <cpf>@cpf.quermesse.app.br).
-- =====================================================================

-- 1. Usuários de login (Auth)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
       u.cpf || '@cpf.quermesse.app.br', extensions.crypt('senha1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values
    ('a0000000-0000-4000-8000-0000000000a1'::uuid, '52998224725'),
    ('a0000000-0000-4000-8000-0000000000b1'::uuid, '39053344705'),
    ('a0000000-0000-4000-8000-0000000000c1'::uuid, '11144477735')) as u(id, cpf);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.cpf || '@cpf.quermesse.app.br', 'email_verified', true),
       'email', now(), now(), now()
  from (values
    ('a0000000-0000-4000-8000-0000000000a1'::uuid, '52998224725'),
    ('a0000000-0000-4000-8000-0000000000b1'::uuid, '39053344705'),
    ('a0000000-0000-4000-8000-0000000000c1'::uuid, '11144477735')) as u(id, cpf);

-- 2. Organização (o produto "Outros" nasce por trigger)
insert into organizacoes (id, nome) values ('10000000-0000-4000-8000-000000000001', 'Paróquia de Exemplo');

insert into perfis (id, nome, cpf) values
  ('a0000000-0000-4000-8000-0000000000a1', 'Admin de Teste',      '52998224725'),
  ('a0000000-0000-4000-8000-0000000000b1', 'Secretaria de Teste', '39053344705'),
  ('a0000000-0000-4000-8000-0000000000c1', 'Caixa de Teste',      '11144477735');

insert into membros (usuario_id, organizacao_id, papel) values
  ('a0000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001', 'secretaria'),
  ('a0000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000001', 'caixa');

-- 3. Chave Pix fictícia, evento aberto hoje e cardápio
insert into chaves_pix (id, organizacao_id, chave, descricao) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '123e4567-e12b-12d1-a456-426655440000', 'Chave de teste (fictícia)');

insert into eventos (id, organizacao_id, codigo, nome, data_inicio, data_fim, chave_pix_id, padrao) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'EVT1',
   'Festa do Padroeiro (teste)', current_date - 1, current_date + 30,
   '40000000-0000-4000-8000-000000000001', true);

insert into categorias (organizacao_id, nome, ordem) values
  ('10000000-0000-4000-8000-000000000001', 'Comidas', 1),
  ('10000000-0000-4000-8000-000000000001', 'Bebidas', 2),
  ('10000000-0000-4000-8000-000000000001', 'Doces', 3),
  ('10000000-0000-4000-8000-000000000001', 'Rifas', 4);

insert into produtos (organizacao_id, categoria_id, nome)
select '10000000-0000-4000-8000-000000000001', c.id, v.nome
  from (values
    ('Pastel de carne', 'Comidas'), ('Pastel de queijo', 'Comidas'), ('Coxinha', 'Comidas'),
    ('Refrigerante lata', 'Bebidas'), ('Suco natural', 'Bebidas'), ('Água mineral', 'Bebidas'),
    ('Fatia de bolo', 'Doces'), ('Rifa', 'Rifas')) as v(nome, cat)
  join categorias c on c.nome = v.cat and c.organizacao_id = '10000000-0000-4000-8000-000000000001';

-- valor, estoque inicial (NULL = ilimitado). Suco com pouco estoque e Água esgotada, para ver os avisos.
insert into evento_produto (evento_id, produto_id, valor, estoque_inicial)
select '50000000-0000-4000-8000-000000000001', p.id, v.valor, v.estoque
  from (values
    ('Pastel de carne', 7.00, 100::int), ('Pastel de queijo', 7.00, 100), ('Coxinha', 5.00, 60),
    ('Refrigerante lata', 5.00, 200), ('Suco natural', 4.00, 5), ('Água mineral', 3.00, 0),
    ('Fatia de bolo', 6.00, 20), ('Rifa', 5.00, null)) as v(nome, valor, estoque)
  join produtos p on p.nome = v.nome and p.organizacao_id = '10000000-0000-4000-8000-000000000001';
