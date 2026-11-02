   with org as (
     insert into organizacoes (nome)
     values ('PARÓQUIA MÃE SANTÍSSIMA' )
     returning id
   ), perfil as (
     insert into perfis (id, nome, cpf)
     values ('dceee2df-ff6b-4d83-95ee-93875e42e7ec', 'ISRAEL CLERISTON MARTINS DE OLIVEIRA', '00357858379')
     returning id
   )
   insert into membros (usuario_id, organizacao_id, papel)
   select perfil.id, org.id, 'admin' from perfil, org
   returning organizacao_id;