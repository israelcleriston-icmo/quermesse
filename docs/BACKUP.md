# Backup automático do banco

Todo dia às 02:30 (Brasília) o GitHub gera uma cópia **criptografada** do banco e a guarda por **30 dias**.
O arquivo contém CPFs e logins; por isso ele só abre com a senha de backup (AES-256), mesmo que alguém baixe o arquivo.

O que entra: tabelas do app (`public`), logins (`auth`) e a lista de arquivos (`storage`).
O que **não** entra: as fotos em si (produtos e comprovantes Pix) ficam no armazenamento do Supabase e não estão neste backup.

## Configurar (uma vez)

1. **Senha do backup.** Invente uma senha longa (20 caracteres ou mais) e guarde num gerenciador de senhas.
   **Se ela for perdida, os backups não podem ser abertos.**
2. **URL de conexão do banco.** No painel do Supabase do projeto: botão **Connect** → aba **Session pooler** (porta 5432)
   → copie a URL (`postgresql://postgres.<projeto>:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres`)
   e troque `[YOUR-PASSWORD]` pela senha do banco. Se não souber a senha do banco:
   Configurações do projeto → Database → **Reset database password** (isso não afeta o app).
   Use o *Session pooler*: a conexão direta usa IPv6 e o GitHub não consegue alcançá-la.
3. **Segredos no GitHub.** Repositório → Settings → Secrets and variables → Actions → **New repository secret**:
   - `BACKUP_SENHA` = a senha do passo 1
   - `BACKUP_DB_URL_TREINAMENTO` = URL do projeto de treinamento
   - `BACKUP_DB_URL_PRODUCAO` = URL do projeto de produção (quando existir)
4. **Testar.** Aba **Actions** → **Backup do banco** → **Run workflow**. Ao terminar (verde), abra a execução e
   baixe o artefato `backup-treinamento` (lá dentro: `.dump.gpg` e `.sha256`).

Um ambiente sem segredos é simplesmente pulado (aparece um aviso, não um erro).
Se o backup falhar, o GitHub envia e-mail avisando.

## Restaurar (num banco NOVO e vazio)

Nunca restaure por cima do banco em uso. Crie um projeto novo no Supabase (ou use um banco local), pegue a URL dele e, no Git Bash:

```
BACKUP_SENHA='a senha do backup' bash scripts/restaurar-backup.sh caminho/quermesse-...dump.gpg "URL-do-banco-novo"
```

Precisa do cliente PostgreSQL (`pg_restore`, `psql`) e do `gpg` instalados. Depois da restauração, aponte o app
(`.env.production` ou `.env.training`) para o projeto novo e republique.

## Conferir de vez em quando

Uma vez por mês, baixe um backup e restaure num banco de teste. Backup que nunca foi restaurado não é garantia.
