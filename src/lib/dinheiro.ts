export const paraCentavos = (reais: number | string): number => Math.round(Number(reais) * 100);

export const brl = (centavos: number): string =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
