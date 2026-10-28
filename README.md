# Quermesse — MVP 1 (banco de dados)

## Como usar
1. `supabase init` + copiar `supabase/migrations/*.sql` → `supabase db reset` (local) ou `supabase db push`.
2. Painel Supabase → Auth → **desligar "Enable sign ups"**. Usuários nascem só por Edge Function
   (service role) que cria `auth.users` + `perfis` + `membros`. O papel vem sempre de `membros`.
3. Login: CPF como usuário (e-mail sintético `<cpf>@cpf.quermesse.app.br`) + senha/PIN pessoal.
4. Testes (Postgres puro, com stubs do Supabase): `supabase/tests/stubs.sql` → migration → `test_mvp1.sql`.
   Resultado esperado: 38 PASS, 0 FAIL.

## Contrato das RPCs (o React só chama estas para escrever)
| RPC | Quem | O que faz |
|---|---|---|
| `registrar_pix(evento, valor)` → txid | caixa/secretaria | Grava o QR e devolve o TXID (prefixo = código do evento, 25 chars) |
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
