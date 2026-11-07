// Fura-fila: o cliente monta o pedido no celular e o app gera um QR com o código do evento e
// "nº do item x quantidade". O QR NÃO leva preço: o caixa abre o pedido na sacola com os preços
// de agora e o servidor recalcula tudo na hora de finalizar a venda.
// Formato:  QM1|EVT1|12x2,15x1|A1B2     (versão | evento | itens | CRC16 dos 3 primeiros campos)
import { crc16 } from "../pix/brcode";

export interface ItemPedido { seq: number; q: number }
export interface Pedido { codigoEvento: string; itens: ItemPedido[] }
export type ResultadoPedido = { ok: true; pedido: Pedido } | { ok: false; erro: string };

export const MAX_LINHAS = 30;
export const MAX_QTD = 99;

export function codificarPedido(codigoEvento: string, itens: ItemPedido[]): string {
  const corpo = `QM1|${codigoEvento}|${itens.map((i) => `${i.seq}x${i.q}`).join(",")}`;
  return `${corpo}|${crc16(corpo)}`;
}

export function lerPedido(entrada: string): ResultadoPedido {
  const texto = entrada.trim();
  const partes = texto.split("|");
  if (partes.length !== 4 || partes[0] !== "QM1") return { ok: false, erro: "Este QR não é um pedido do Quermesse." };
  const [, codigo, lista, crc] = partes;
  if (crc16(partes.slice(0, 3).join("|")) !== crc.toUpperCase()) return { ok: false, erro: "Pedido com erro de leitura. Peça ao cliente para gerar de novo." };
  if (!/^[A-Z0-9]{1,10}$/.test(codigo)) return { ok: false, erro: "Pedido com evento inválido." };
  const itens: ItemPedido[] = [];
  const vistos = new Set<number>();
  for (const trecho of lista.split(",")) {
    const m = /^(\d{1,9})x(\d{1,2})$/.exec(trecho);
    if (!m) return { ok: false, erro: "Pedido com item inválido." };
    const seq = Number(m[1]);
    const q = Number(m[2]);
    if (q < 1 || q > MAX_QTD || vistos.has(seq)) return { ok: false, erro: "Pedido com item inválido." };
    vistos.add(seq);
    itens.push({ seq, q });
  }
  if (itens.length === 0 || itens.length > MAX_LINHAS) return { ok: false, erro: "Pedido vazio ou grande demais." };
  return { ok: true, pedido: { codigoEvento: codigo, itens } };
}

export interface ItemDoCardapio { id: string; seq: number; nome: string; valorCentavos: number; estoque: number | null }
export interface LinhaParaSacola { id: string; nome: string; valorCentavos: number; estoque: number | null; qtd: number }

/** Casa o pedido com o cardápio de agora: devolve o que entra na sacola e avisos do que não deu. */
export function aplicarPedido(cardapio: ItemDoCardapio[], pedido: Pedido): { linhas: LinhaParaSacola[]; avisos: string[] } {
  const porSeq = new Map(cardapio.map((i) => [i.seq, i]));
  const linhas: LinhaParaSacola[] = [];
  const avisos: string[] = [];
  for (const { seq, q } of pedido.itens) {
    const item = porSeq.get(seq);
    if (!item) { avisos.push("Um item do pedido não está mais no cardápio."); continue; }
    if (item.estoque !== null && item.estoque <= 0) { avisos.push(`${item.nome}: esgotado, não foi incluído.`); continue; }
    let qtd = q;
    if (item.estoque !== null && qtd > item.estoque) { qtd = item.estoque; avisos.push(`${item.nome}: só há ${item.estoque}; incluí ${item.estoque} em vez de ${q}.`); }
    linhas.push({ id: item.id, nome: item.nome, valorCentavos: item.valorCentavos, estoque: item.estoque, qtd });
  }
  return { linhas, avisos };
}
