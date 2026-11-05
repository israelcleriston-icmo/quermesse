#!/usr/bin/env bash
# Descriptografa um backup e restaura num banco de DESTINO (um banco novo/vazio, nunca o de produção em uso).
# Uso: BACKUP_SENHA=... bash scripts/restaurar-backup.sh <arquivo .dump.gpg> "<URL do banco de destino>"
# Restaura os DADOS de auth, depois public inteiro (estrutura + dados) e os DADOS de storage
# (o destino já deve ter esses schemas, como todo projeto Supabase novo).
set -euo pipefail
ARQ="${1:?faltou o arquivo .dump.gpg}"
DEST="${2:?faltou a URL do banco de destino}"
: "${BACKUP_SENHA:?faltou a variável BACKUP_SENHA}"
BRUTO="$(mktemp)"
trap 'rm -f "$BRUTO"' EXIT
printf '%s' "$BACKUP_SENHA" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 -d -o "$BRUTO" "$ARQ"
# Ordem importa: os logins (auth) primeiro, porque public.perfis aponta para auth.users.
pg_restore --no-owner --no-privileges --data-only --schema=auth -d "$DEST" "$BRUTO" || echo "AVISO: dados de auth não restaurados por completo"
pg_restore --no-owner --no-privileges --exit-on-error --schema=public -d "$DEST" "$BRUTO"
pg_restore --no-owner --no-privileges --data-only --schema=storage -d "$DEST" "$BRUTO" || echo "AVISO: dados de storage não restaurados por completo"
echo "Restauração concluída."
