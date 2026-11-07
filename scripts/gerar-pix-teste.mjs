// Gera um Pix Copia e Cola de TESTE para o spike no banco da paróquia.
// Uso:  node scripts/gerar-pix-teste.mjs
// Depois: cole o texto no app do seu banco (Pix > Copia e Cola), confira recebedor e valor,
// pague de OUTRA conta e veja se o TXID e a mensagem aparecem no extrato do recebedor.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { decodificar, gerarPayloadPix, montarMensagem, montarTxid } from "../src/pix/brcode.ts";

const rl = readline.createInterface({ input, output });
const perguntar = async (t, padrao = "") =>
  ((await rl.question(padrao ? `${t} [${padrao}]: ` : `${t}: `)).trim() || padrao);

const chave = await perguntar("Chave Pix aleatória da paróquia");
const valor = Number((await perguntar("Valor em reais", "0.01")).replace(",", "."));
const codigo = (await perguntar("Código do evento (letras maiúsculas e números)", "EVT1")).toUpperCase();
const numero = Number(await perguntar("Número da venda de teste", String(Math.floor(Math.random() * 900) + 100)));
const complemento = await perguntar("Nome curto do evento para a mensagem", "Festa do Padroeiro");
rl.close();

const txid = montarTxid(codigo, numero);
const mensagem = montarMensagem(txid, chave, complemento);
const payload = gerarPayloadPix({ chave, valor, txid, mensagem });
const lido = decodificar(payload);

console.log("\n=== Pix Copia e Cola (copie a linha abaixo, inteira) ===\n");
console.log(payload);
console.log("\n=== Conferência ===");
console.log("CRC válido:", lido.crcOk);
console.log("Valor     :", lido.campos["54"]);
console.log("TXID      :", lido.adicionais["05"]);
console.log("Mensagem  :", lido.conta["02"]);
console.log("\nANOTE o TXID acima: depois do pagamento, procure por ele (e pela mensagem) no extrato do banco da paróquia.");
