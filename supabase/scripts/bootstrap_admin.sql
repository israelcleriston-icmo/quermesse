-- =====================================================================
-- PRIMEIRO ADMIN de um ambiente (rodar UMA vez em cada projeto: training, prod)
--
-- Por que existe: a função criar-usuario só aceita chamadas de um admin,
-- então o primeiro admin precisa nascer por fora dela.
--
-- Passo 1 (no painel do Supabase): Authentication > Users > Add user >
--   Create new user
--     E-mail:  <SEU_CPF_SO_NUMEROS>@cpf.quermesse.app.br
--     Senha:   uma senha forte (mínimo 8 caracteres)
--     Marque "Auto Confirm User"
--   Depois de criado, COPIE o UUID do usuário (coluna "User UID").
--
-- Passo 2: troque os 3 valores entre <> abaixo e rode no SQL Editor.
-- O resultado mostra o organizacao_id: ANOTE (a função e o app usam).
-- =====================================================================
with org as (
  insert into organizacoes (nome)
  values ('<NOME DA PARÓQUIA>')
  returning id
), perfil as (
  insert into perfis (id, nome, cpf)
  values ('<UUID_DO_USUARIO>', '<SEU NOME>', '<SEU_CPF_SO_NUMEROS>')
  returning id
)
insert into membros (usuario_id, organizacao_id, papel)
select perfil.id, org.id, 'admin' from perfil, org
returning organizacao_id;
