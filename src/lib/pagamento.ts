export type Forma = "dinheiro" | "pix" | "credito" | "debito";

export interface PagamentoFinal {
  forma: Forma;
  valorCentavos: number; // valor aplicado na venda
  recebidoCentavos?: number; // só dinheiro: quanto o cliente entregou
  txid?: string; // só Pix
  comprovante?: string; // só Pix
}

/** O que o caixa digita (centavos). Em `entregue` vai o dinheiro que o cliente colocou na mão. */
export interface Entrada { pix: number; credito: number; debito: number; entregue: number }

export interface Calculo {
  /** Parte da venda que fica para o dinheiro = total − (Pix + crédito + débito). */
  dinheiro: number;
  troco: number;
  /** Quanto ainda falta o cliente entregar em dinheiro. */
  falta: number;
  erro: string | null;
  pronto: boolean;
}

/** O troco considera o que já foi pago nas outras formas: troco = entregue − (total − outras formas). */
export function calcular(total: number, e: Entrada): Calculo {
  const outras = e.pix + e.credito + e.debito;
  if (outras > total) {
    return { dinheiro: 0, troco: 0, falta: 0, erro: "Os valores passam do total da venda.", pronto: false };
  }
  const dinheiro = total - outras;
  if (dinheiro === 0) {
    if (e.entregue > 0) {
      return { dinheiro, troco: 0, falta: 0, erro: "O total já está coberto pelas outras formas. Zere o dinheiro entregue.", pronto: false };
    }
    return { dinheiro, troco: 0, falta: 0, erro: null, pronto: true };
  }
  if (e.entregue < dinheiro) return { dinheiro, troco: 0, falta: dinheiro - e.entregue, erro: null, pronto: false };
  return { dinheiro, troco: e.entregue - dinheiro, falta: 0, erro: null, pronto: true };
}

/** Lista de pagamentos que vai para o servidor. O Pix só entra se já tiver TXID e comprovante. */
export function montarPagamentos(
  total: number, e: Entrada, pix?: { txid: string; comprovante: string },
): PagamentoFinal[] {
  const c = calcular(total, e);
  if (!c.pronto || c.erro) throw new Error("Pagamento incompleto.");
  const lista: PagamentoFinal[] = [];
  if (c.dinheiro > 0) lista.push({ forma: "dinheiro", valorCentavos: c.dinheiro, recebidoCentavos: e.entregue });
  if (e.credito > 0) lista.push({ forma: "credito", valorCentavos: e.credito });
  if (e.debito > 0) lista.push({ forma: "debito", valorCentavos: e.debito });
  if (e.pix > 0) {
    if (!pix) throw new Error("Falta o comprovante do Pix.");
    lista.push({ forma: "pix", valorCentavos: e.pix, txid: pix.txid, comprovante: pix.comprovante });
  }
  return lista;
}

export const NOTAS = [500, 1000, 2000, 5000, 10000]; // atalhos de notas, em centavos

/** "" -> 0; "12,50" | "12.5" | "12" -> centavos; qualquer outra coisa -> null (inválido). */
export function lerReais(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return 0;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ""] = t.replace(",", ".").split(".");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

export const centavosParaTexto = (c: number) => (c / 100).toFixed(2).replace(".", ",");
