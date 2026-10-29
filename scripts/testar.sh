#!/usr/bin/env bash
# Roda os testes do projeto.
# Uso (na pasta do projeto):  bash scripts/testar.sh [banco|pix|funcao|tudo]
#   banco  : banco de dados (Postgres temporário no Docker; Docker Desktop precisa estar aberto)
#   pix    : módulo do QR Pix (vitest, instalado numa pasta temporária)
#   funcao : Edge Function criar-usuario (Deno)
#   tudo   : os três (padrão)
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ" || exit 1
ALVO="${1:-tudo}"
FALHOU=0

testar_banco() {
  echo "=== Testes do banco de dados ==="
  if ! docker info >/dev/null 2>&1; then
    echo "Docker não está rodando. Abra o Docker Desktop, espere ficar ativo e tente de novo."
    return 1
  fi
  docker rm -f pgteste >/dev/null 2>&1
  docker run -d --name pgteste -e POSTGRES_PASSWORD=teste postgres:16 >/dev/null || return 1
  # A imagem do Postgres reinicia uma vez ao iniciar: espera a segunda mensagem de "pronto"
  for _ in $(seq 1 60); do
    [ "$(docker logs pgteste 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
    sleep 1
  done
  run() { docker exec -i pgteste psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

  local f
  for f in supabase/tests/stubs.sql supabase/migrations/*.sql supabase/tests/test_mvp1.sql; do
    if ! run -o /dev/null < "$f"; then
      echo "ERRO ao executar $f"
      docker rm -f pgteste >/dev/null 2>&1
      return 1
    fi
  done
  local ok falhas
  ok="$(run -At -c "select count(*) filter (where ok) from t.res" | tr -d '\r')"
  falhas="$(run -At -c "select count(*) filter (where not ok) from t.res" | tr -d '\r')"
  if [ "$falhas" != "0" ]; then
    echo "Testes que falharam:"
    run -At -c "select '  - ' || nome from t.res where not ok order by n" | tr -d '\r'
  fi
  echo "Banco: $ok passaram, $falhas falharam"
  docker rm -f pgteste >/dev/null 2>&1
  [ "$falhas" = "0" ]
}

testar_pix() {
  echo "=== Testes do módulo Pix (QR Code) ==="
  local tmp
  tmp="$(mktemp -d)" || return 1
  cp src/pix/brcode.ts src/pix/brcode.test.ts "$tmp"/
  ( cd "$tmp" && npm init -y >/dev/null 2>&1 && npm i -D vitest --silent && npx vitest run )
  local r=$?
  rm -rf "$tmp"
  return $r
}

testar_funcao() {
  echo "=== Testes da função criar-usuario ==="
  local d="supabase/functions/criar-usuario/handler_test.ts"
  if command -v deno >/dev/null 2>&1; then
    deno test --no-check "$d"
  else
    npx --yes deno test --no-check "$d"
  fi
}

case "$ALVO" in
  banco)  testar_banco  || FALHOU=1 ;;
  pix)    testar_pix    || FALHOU=1 ;;
  funcao) testar_funcao || FALHOU=1 ;;
  tudo)
    testar_banco  || FALHOU=1
    testar_pix    || FALHOU=1
    testar_funcao || FALHOU=1 ;;
  *) echo "Uso: bash scripts/testar.sh [banco|pix|funcao|tudo]"; exit 2 ;;
esac

echo
if [ "$FALHOU" = "0" ]; then echo "RESULTADO: tudo certo."; else echo "RESULTADO: houve falhas (veja acima)."; fi
exit "$FALHOU"
