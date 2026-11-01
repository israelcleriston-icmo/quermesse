import { describe, expect, it } from "vitest";
import { calcular, centavosParaTexto, lerReais, montarPagamentos } from "./pagamento";

const e = (pix = 0, credito = 0, debito = 0, entregue = 0) => ({ pix, credito, debito, entregue });

describe("troco considera o que já foi pago nas outras formas", () => {
  it("52,00 = Pix 17 + crédito 15 + dinheiro: restam 20 em dinheiro; entregou 50 -> troco 30", () => {
    const c = calcular(5200, e(1700, 1500, 0, 5000));
    expect(c).toMatchObject({ dinheiro: 2000, troco: 3000, falta: 0, erro: null, pronto: true });
  });
  it("só dinheiro: compra de 47,00, entregou 50,00 -> troco 3,00", () => {
    expect(calcular(4700, e(0, 0, 0, 5000))).toMatchObject({ dinheiro: 4700, troco: 300, pronto: true });
    expect(calcular(4700, e(0, 0, 0, 4700))).toMatchObject({ troco: 0, pronto: true });
  });
  it("entregou pouco: mostra quanto falta e não libera", () => {
    expect(calcular(5200, e(1700, 1500, 0, 1500))).toMatchObject({ dinheiro: 2000, falta: 500, troco: 0, pronto: false });
  });
  it("nada digitado: falta o total", () => {
    expect(calcular(1000, e())).toMatchObject({ dinheiro: 1000, falta: 1000, pronto: false });
  });
  it("outras formas cobrem tudo: pronto sem dinheiro; com dinheiro entregue, erro", () => {
    expect(calcular(3200, e(1700, 0, 1500, 0))).toMatchObject({ dinheiro: 0, pronto: true, erro: null });
    expect(calcular(3200, e(1700, 0, 1500, 1000)).erro).toMatch(/já está coberto/);
  });
  it("valores acima do total: erro", () => {
    expect(calcular(1000, e(600, 600)).erro).toMatch(/passam do total/);
  });
});

describe("montarPagamentos", () => {
  it("dinheiro aplicado = total − outras formas; Pix carrega txid e comprovante", () => {
    const l = montarPagamentos(5200, e(1700, 1500, 0, 5000), { txid: "EVT1V000123A", comprovante: "ev/u/x.jpg" });
    expect(l).toEqual([
      { forma: "dinheiro", valorCentavos: 2000, recebidoCentavos: 5000 },
      { forma: "credito", valorCentavos: 1500 },
      { forma: "pix", valorCentavos: 1700, txid: "EVT1V000123A", comprovante: "ev/u/x.jpg" },
    ]);
    expect(l.reduce((s, p) => s + p.valorCentavos, 0)).toBe(5200);
  });
  it("débito entra como forma própria (só estatística)", () => {
    expect(montarPagamentos(1000, e(0, 0, 1000))).toEqual([{ forma: "debito", valorCentavos: 1000 }]);
  });
  it("recusa Pix sem comprovante e pagamento incompleto", () => {
    expect(() => montarPagamentos(1000, e(1000))).toThrow(/comprovante/);
    expect(() => montarPagamentos(1000, e())).toThrow(/incompleto/);
  });
});

describe("campos digitados", () => {
  it("lê valores; vazio vale zero; lixo é inválido", () => {
    expect(lerReais("12,50")).toBe(1250);
    expect(lerReais("12.5")).toBe(1250);
    expect(lerReais("")).toBe(0);
    expect(lerReais("0,05")).toBe(5);
    for (const ruim of ["abc", "12,345", "1.250,00", "-3", "1,"]) expect(lerReais(ruim)).toBeNull();
    expect(centavosParaTexto(1750)).toBe("17,50");
  });
});
