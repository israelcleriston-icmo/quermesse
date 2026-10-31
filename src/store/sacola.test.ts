import { beforeEach, describe, expect, it } from "vitest";
import { totalCentavos, totalItens, useSacola } from "./sacola";

const pastel = { id: "p1", nome: "Pastel", valorCentavos: 700, max: 3 };
const rifa = { id: "r1", nome: "Rifa", valorCentavos: 500, max: null };

describe("sacola", () => {
  beforeEach(() => useSacola.getState().limpar());

  it("soma itens e total; gera vendaId só no primeiro item", () => {
    const s = useSacola.getState();
    expect(s.vendaId).toBeNull();
    s.adicionar(pastel);
    const id = useSacola.getState().vendaId;
    expect(id).toBeTruthy();
    s.adicionar(pastel);
    s.adicionar(rifa);
    const { linhas, vendaId } = useSacola.getState();
    expect(vendaId).toBe(id);
    expect(totalItens(linhas)).toBe(3);
    expect(totalCentavos(linhas)).toBe(1900);
  });
  it("não passa do estoque conhecido, mas ilimitado segue", () => {
    const s = useSacola.getState();
    for (let i = 0; i < 5; i++) s.adicionar(pastel);
    for (let i = 0; i < 5; i++) s.adicionar(rifa);
    const { linhas } = useSacola.getState();
    expect(linhas.p1.qtd).toBe(3);
    expect(linhas.r1.qtd).toBe(5);
  });
  it("diminuir remove a linha em 1 e zera o vendaId com a sacola vazia", () => {
    const s = useSacola.getState();
    s.adicionar(rifa);
    s.adicionar(rifa);
    s.diminuir("r1");
    expect(useSacola.getState().linhas.r1.qtd).toBe(1);
    s.diminuir("r1");
    expect(useSacola.getState().linhas.r1).toBeUndefined();
    expect(useSacola.getState().vendaId).toBeNull();
  });
});
