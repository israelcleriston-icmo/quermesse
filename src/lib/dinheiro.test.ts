import { describe, expect, it } from "vitest";
import { brl, paraCentavos } from "./dinheiro";

describe("dinheiro", () => {
  it("converte reais em centavos sem erro de ponto flutuante", () => {
    expect(paraCentavos(19.9)).toBe(1990);
    expect(paraCentavos("7.00")).toBe(700);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });
  it("formata em reais", () => {
    expect(brl(1900).replace(/\u00a0/g, " ")).toBe("R$ 19,00");
    expect(brl(5).replace(/\u00a0/g, " ")).toBe("R$ 0,05");
  });
});
