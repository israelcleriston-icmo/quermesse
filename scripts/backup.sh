#!/usr/bin/env bash
# Backup do banco: gera o dump, confere que não está vazio, criptografa e grava em <pasta>.
# Uso: bash scripts/backup.sh "<URL de conexão>" <pasta de saída> <nome base>
# A senha de criptografia vem da variável de ambiente BACKUP_SENHA (nunca na linha de comando).
set -euo pipefail
URL="${1:?faltou a URL de conexão}"
SAIDA="${2:?faltou a pasta de saída}"
NOME="${3:-backup}"
: "${BACKUP_SENHA:?faltou a variável BACKUP_SENHA}"
mkdir -p "$SAIDA"
BRUTO="$(mktemp)"
trap 'rm -f "$BRUTO"' EXIT

# 1. "Ping": uma consulta simples (também evita a pausa por inatividade do plano gratuito)
psql "$URL" -v ON_ERROR_STOP=1 -Atc "select 1" >/dev/null

# 2. Dump em formato custom: estrutura + dados de public, auth (logins) e storage (lista de arquivos)
pg_dump "$URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage -f "$BRUTO"

# 3. Conferência: o dump precisa ser legível e conter as tabelas principais
LISTA="$(pg_restore --list "$BRUTO")"
for t in vendas vendas_itens vendas_pagamentos membros perfis eventos; do
  echo "$LISTA" | grep -q "TABLE public $t " || { echo "ERRO: tabela $t ausente no dump" >&2; exit 1; }
done
echo "$LISTA" | grep -q "TABLE DATA auth users" || { echo "ERRO: dados de auth.users ausentes no dump" >&2; exit 1; }

# 4. Criptografia (AES-256): o arquivo tem CPFs e senhas (hash) e nunca deve ficar legível
DESTINO="$SAIDA/$NOME.dump.gpg"
printf '%s' "$BACKUP_SENHA" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 -o "$DESTINO" "$BRUTO"
( cd "$SAIDA" && sha256sum "$NOME.dump.gpg" > "$NOME.sha256" )
echo "OK: $DESTINO ($(du -h "$DESTINO" | cut -f1)), $(echo "$LISTA" | wc -l) objetos no dump"
