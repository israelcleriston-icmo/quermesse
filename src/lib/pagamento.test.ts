import { describe, expect, it } from "vitest";
import {
  centavosParaTexto, faltaCentavos, lerReais, trocoTotalCentavos, validarDinheiro, validarParte, type PagamentoFinal,
} from "./pagamento";

const pix = (v: number): PagamentoFinal => ({ forma: "pix", valorCentavos: v, txid: "EVT1V000001A", comprovante: "e/u/x.jpg" });
const cred = (v: number): PagamentoFinal => ({ forma: "credito", valorCentavos: v });

describe("pagamento em sequência: o que já foi pago abate o que falta", () => {
  it("52,00: Pix 17 -> falta 35; crédito 15 -> falta 20", () => {
    expect(faltaCentavos(5200, [pix(1700)])).toBe(3500);
    expect(faltaCentavos(5200, [pix(1700), cred(1500)])).toBe(2000);
  });
  it("troco do dinheiro considera o que já foi pago: falta 20,00, entregou 50,00 -> troco 30,00", () => {
    const falta = faltaCentavos(5200, [pix(1700), cred(1500)]);
    expect(validarDinheiro(falta, falta, 5000)).toEqual({ ok: true, erro: null, troco: 3000 });
  });
  it("compra de 47,00, entregou 50,00 -> troco 3,00; exato -> 0", () => {
    expect(validarDinheiro(4700, 4700, 5000).troco).toBe(300);
    expect(validarDinheiro(4700, 4700, 4700)).toMatchObject({ ok: true, troco: 0 });
  });
  it("dinheiro parcial: parte de 20,00 com nota de 50,00 -> troco 30,00", () => {
    expect(validarDinheiro(5200, 2000, 5000)).toMatchObject({ ok: true, troco: 3000 });
  });
  it("entregou menos que a parte: não confirma", () => {
    expect(validarDinheiro(2000, 2000, 1500)).toMatchObject({ ok: false, erro: "O valor entregue é menor que a parte." });
    expect(validarDinheiro(2000, 2000, 0)).toMatchObject({ ok: false, erro: null });
  });
  it("parte maior que o que falta ou inválida: erro", () => {
    expect(validarParte(1000, 1500).erro).toMatch(/Maior que o que falta/);
    expect(validarParte(1000, null).erro).toMatch(/inválido/);
    expect(validarParte(1000, 0)).toEqual({ ok: false, erro: null });
    expect(validarParte(1000, 1000).ok).toBe(true);
  });
  it("soma dos trocos de todas as partes em dinheiro", () => {
    expect(trocoTotalCentavos([{ forma: "dinheiro", valorCentavos: 400, recebidoCentavos: 1000 }, cred(300)])).toBe(600);
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
