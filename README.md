# Quermesse — MVP 1 (banco de dados)

## Como usar
1. `supabase init` + copiar `supabase/migrations/*.sql` → `supabase db reset` (local) ou `supabase db push`.
2. Painel Supabase → Auth → **desligar "Enable sign ups"**. Usuários nascem só por Edge Function
   (service role) que cria `auth.users` + `perfis` + `membros`. O papel vem sempre de `membros`.
3. Login: CPF como usuário (e-mail sintético `<cpf>@cpf.quermesse.app.br`) + senha/PIN pessoal.
4. Testes (Postgres puro, com stubs do Supabase): `supabase/tests/stubs.sql` → migration → `test_mvp1.sql`.
   Ordem: stubs → migrations (todas) → test_mvp1.sql. Resultado esperado: 45 PASS, 0 FAIL.

## Contrato das RPCs (o React só chama estas para escrever)
| RPC | Quem | O que faz |
|---|---|---|
| `registrar_pix(evento, valor)` → txid | caixa/secretaria | Reserva o nº da venda no evento, grava o QR e devolve o TXID legível (`EVT1V000123` = evento + venda 123) |
| `descartar_pix(txid)` | dono do QR | "Cliente não pagou": registra quem/quando |
| `finalizar_venda(venda_id, evento, forma, itens, txid?, comprovante_path?)` | caixa/secretaria | Calcula total no servidor, baixa estoque, grava venda+itens. Idempotente pelo `venda_id` |
| `adicionar_remessa(evento_produto, qtd)` | secretaria/conselho/admin | "+50 pastéis" com log |
| `cardapio_publico(evento?)` | anon | Cardápio do fura-fila (sem estoque exato) |

`itens`: `[{"ep":"<evento_produto.id>","q":2}, {"avulso":true,"desc":"Bolo","valor":12.5,"q":1}]`

Erros (campo `message` do Postgres): `NAO_AUTENTICADO, SEM_PERMISSAO, EVENTO_INEXISTENTE,
EVENTO_FORA_DO_PERIODO, VALOR_INVALIDO, ITENS_INVALIDOS, ITEM_INDISPONIVEL, ESTOQUE_ESGOTADO (detail = produto),
TOTAL_INVALIDO, PIX_INVALIDO, COMPROVANTE_OBRIGATORIO, COMPROVANTE_INVALIDO, VENDA_ID_EM_USO, PIX_NAO_DESCARTAVEL`.

## Fura-fila
QR do cliente = `{"e":"EVT1","i":[[seq,qtd],...]}` onde `seq` = `evento_produto.seq` (inteiro curto).
O PDV converte `seq` → item do cardápio em cache e segue o fluxo normal. Preço vem sempre do servidor.

## Comprovante
Caminho obrigatório no bucket privado: `<evento_id>/<usuario_id>/<arquivo>.jpg`.

## Fica para o MVP 2
`turnos` + fechamento cego, `sangrias` (via RPC com limite de tentativas), anulação/devolução,
expirar QRs ao encerrar o evento, relatório do caixa só após fechar o turno.

## Usuários (Edge Function `criar-usuario`) `criar-usuario`)
- Só o **admin** da organização cria usuários. O papel é gravado em `membros` pela função (nunca vem do token).
- Login = CPF + senha. E-mail sintético: `<cpf>@cpf.quermesse.app.br`.
- Primeiro admin de cada ambiente: `supabase/scripts/bootstrap_admin.sql` (Dashboard + SQL Editor).
- Demais usuários: `node scripts/criar-usuario.mjs` (até existir a tela de admin no app).
- Testes da função: `cd supabase/functions/criar-usuario && deno test --no-check handler_test.ts`.

## TXID e mensagem do Pix
- TXID = `<código do evento>` + `V` + `<nº da venda no evento, 6 dígitos>` (ex.: `EVT1V000123`). Numeração por evento, com saltos quando um QR é descartado.
- O mesmo TXID vai no campo TXID (62-05) e começa a mensagem (26-02): `EVT1V000123 Festa do Padroeiro` (limite de 37 caracteres com chave aleatória).
- O número é reservado ao gerar o QR e vira o número da venda ao finalizar. Venda em dinheiro/cartão usa o mesmo contador.
- Nome do recebedor e cidade são fixos no código (`src/pix/brcode.ts`); o app do pagador usa o nome do DICT.
- Módulo: `src/pix/brcode.ts` (testes: `brcode.test.ts`). Spike: `node scripts/gerar-pix-teste.mjs`.

## App (Vite + React + TypeScript + Tailwind, PWA)
Instalar e rodar (na pasta do projeto):
```
npm install
npm run dev            # ambiente dev (usa .env.development)
npm run build          # produção (usa .env.production)
npm run build:training # treinamento (usa .env.training)
npm test               # testes do app (vitest)
```
- Crie `.env.development`, `.env.training` e `.env.production` a partir de `.env.example`
  (URL do projeto + chave **pública**). Esses arquivos NÃO vão para o GitHub.
- Ambientes: dev (faixa cinza), training (faixa laranja, ícone e nome próprios no celular), prod (sem faixa).
- Login: CPF + senha (e-mail sintético `<cpf>@cpf.quermesse.app.br`). Papéis vêm da tabela `membros`.
- Tema azul em `src/index.css` (`--color-marca-*`). Ícones provisórios em `public/icons/` (trocar pelo logo).

## Dados de exemplo (só dev local)
`supabase/seed.sql` roda em todo `npx supabase db reset` e cria 3 usuários de teste (senha `senha1234`),
um evento aberto e um cardápio. Nunca é aplicado no training/prod (o `db push` não executa seed).
- admin 529.982.247-25 · secretaria 390.533.447-05 · caixa 111.444.777-35
