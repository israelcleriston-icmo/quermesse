-- Nome e cidade do recebedor passam a ser guardados por chave Pix (lidos do código/QR do banco).
-- Opcionais: quando vazios, o app usa os valores padrão (PAROQUIA / BRASIL).
-- Obs.: a migration txid_legivel removeu colunas com nomes parecidos (eram obrigatórias); estas são opcionais.
alter table chaves_pix
  add column if not exists nome_recebedor   varchar(25),
  add column if not exists cidade_recebedor varchar(15);
