import { describe, expect, it } from "vitest";
import { crc16 } from "../pix/brcode";
import { aplicarPedido, codificarPedido, lerPedido } from "./pedido";

describe("pedido do fura-fila", () => {
  it("codifica e lê de volta; o QR não leva preço", () => {
    const t = codificarPedido("EVT1", [{ seq: 12, q: 2 }, { seq: 15, q: 1 }]);
    expect(t).toMatch(/^QM1\|EVT1\|12x2,15x1\|[0-9A-F]{4}$/);
    expect(lerPedido(t)).toEqual({ ok: true, pedido: { codigoEvento: "EVT1", itens: [{ seq: 12, q: 2 }, { seq: 15, q: 1 }] } });
  });
  it("recusa adulteração, texto alheio, item repetido, quantidade zero e pedido vazio", () => {
    const t = codificarPedido("EVT1", [{ seq: 12, q: 2 }]);
    expect(lerPedido(t.replace("12x2", "12x9"))).toMatchObject({ ok: false, erro: expect.stringMatching(/erro de leitura/) });
    expect(lerPedido("https://qualquer.coisa")).toMatchObject({ ok: false });
    for (const [lista] of [["1x1,1x2"], ["1x0"], ["1x100"], [""]]) {
      const corpo = `QM1|EVT1|${lista}`;
      expect(lerPedido(`${corpo}|${crc16(corpo)}`)).toMatchObject({ ok: false, erro: expect.stringMatching(/inválido|vazio/) });   // CRC certo, conteúdo inválido
    }
  });
  it("aplicar: usa o preço de agora, avisa de esgotado, corta no estoque e ignora item que saiu", () => {
    const cardapio = [
      { id: "a", seq: 1, nome: "Pastel", valorCentavos: 800, estoque: 3 },
      { id: "b", seq: 2, nome: "Coxinha", valorCentavos: 500, estoque: 0 },
      { id: "c", seq: 3, nome: "Rifa", valorCentavos: 500, estoque: null },
    ];
    const r = aplicarPedido(cardapio, { codigoEvento: "EVT1", itens: [{ seq: 1, q: 5 }, { seq: 2, q: 1 }, { seq: 3, q: 4 }, { seq: 9, q: 1 }] });
    expect(r.linhas.map((l) => [l.nome, l.qtd, l.valorCentavos])).toEqual([["Pastel", 3, 800], ["Rifa", 4, 500]]);
    expect(r.avisos).toHaveLength(3);
    expect(r.avisos.join(" ")).toMatch(/só há 3/);
    expect(r.avisos.join(" ")).toMatch(/Coxinha: esgotado/);
  });
});
