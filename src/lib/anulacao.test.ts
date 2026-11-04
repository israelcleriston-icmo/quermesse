import { describe, expect, it } from "vitest";
import { disponivelPorForma, sugerirEstornos } from "./anulacao";

describe("devolução na anulação", () => {
  const venda = { pagamentos: [{ forma: "debito", valor: 10 }, { forma: "dinheiro", valor: 20 }], devolvido: [{ forma: "debito", valor: 10 }] };
  it("calcula o que ainda pode ser devolvido em cada forma", () => {
    expect(disponivelPorForma(venda)).toEqual({ debito: 0, dinheiro: 2000 });
  });
  it("sugere dinheiro primeiro e completa com as outras formas", () => {
    expect(sugerirEstornos({ debito: 1000, dinheiro: 500, pix: 700 }, 1200)).toEqual({ dinheiro: 500, debito: 700 });
    expect(sugerirEstornos({ debito: 0, dinheiro: 2000 }, 1000)).toEqual({ dinheiro: 1000 });
    expect(sugerirEstornos({ dinheiro: 2000 }, 0)).toEqual({});
  });
});
