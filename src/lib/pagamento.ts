export type Forma = "dinheiro" | "pix" | "credito" | "debito";

export interface PagamentoFinal {
  forma: Forma;
  valorCentavos: number; // valor aplicado na venda
  recebidoCentavos?: number; // só dinheiro: quanto o cliente entregou
  txid?: string; // só Pix
  comprovante?: string; // só Pix
}

export const MAX_PARTES = 6;
export const NOTAS = [500, 1000, 2000, 5000, 10000]; // atalhos de notas, em centavos
export const ROTULO_FORMA: Record<Forma, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" };

export const somaPagamentos = (ps: PagamentoFinal[]) => ps.reduce((s, p) => s + p.valorCentavos, 0);
/** Quanto ainda falta pagar: o que já foi confirmado nas outras formas abate daqui. */
export const faltaCentavos = (total: number, ps: PagamentoFinal[]) => total - somaPagamentos(ps);
export const trocoTotalCentavos = (ps: PagamentoFinal[]) =>
  ps.reduce((s, p) => s + (p.forma === "dinheiro" ? (p.recebidoCentavos ?? p.valorCentavos) - p.valorCentavos : 0), 0);

export interface Validacao { ok: boolean; erro: string | null }

/** Crédito, débito e Pix: valor positivo e que não passe do que falta. */
export function validarParte(falta: number, valor: number | null): Validacao {
  if (valor === null) return { ok: false, erro: "Valor inválido. Use números, como 12,50." };
  if (valor <= 0) return { ok: false, erro: null };
  if (valor > falta) return { ok: false, erro: "Maior que o que falta pagar." };
  return { ok: true, erro: null };
}

/** Dinheiro: parte aplicada na venda + quanto o cliente entregou. Troco = entregue − parte. */
export function validarDinheiro(falta: number, valor: number | null, entregue: number | null): Validacao & { troco: number } {
  const v = validarParte(falta, valor);
  if (!v.ok) return { ...v, troco: 0 };
  if (entregue === null) return { ok: false, erro: "Valor entregue inválido.", troco: 0 };
  if (entregue < (valor as number)) return { ok: false, erro: entregue === 0 ? null : "O valor entregue é menor que a parte.", troco: 0 };
  return { ok: true, erro: null, troco: entregue - (valor as number) };
}

/** "" -> 0; "12,50" | "12.5" | "12" -> centavos; qualquer outra coisa -> null (inválido). */
export function lerReais(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return 0;
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ""] = t.replace(",", ".").split(".");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

export const centavosParaTexto = (c: number) => (c / 100).toFixed(2).replace(".", ",");
