// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { escolherEventoPadrao, lembrarEvento, rotuloEvento, type EventoSel } from "./eventoPadrao";

const E = (id: string, ini: string, fim: string, status = "aberto"): EventoSel => ({ id, nome: "Festa", data_inicio: ini, data_fim: fim, status });

describe("evento padrão nas telas de gestão", () => {
  beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T15:00:00Z")); });

  it("sem escolha anterior, prefere o evento de hoje e não o que ainda vai começar", () => {
    const lista = [E("futuro", "2026-12-01", "2026-12-03"), E("hoje", "2026-11-05", "2026-11-08"), E("passado", "2026-10-01", "2026-10-03", "encerrado")];
    expect(escolherEventoPadrao(lista)).toBe("hoje");
  });
  it("sem evento hoje, o mais recente que já começou; só futuros: o primeiro", () => {
    expect(escolherEventoPadrao([E("futuro", "2026-12-01", "2026-12-03"), E("antigo", "2026-09-01", "2026-09-02", "encerrado"), E("recente", "2026-10-01", "2026-10-02", "encerrado")])).toBe("recente");
    expect(escolherEventoPadrao([E("a", "2026-12-01", "2026-12-03"), E("b", "2027-01-01", "2027-01-03")])).toBe("a");
    expect(escolherEventoPadrao([])).toBe("");
  });
  it("lembra a última escolha (se ainda existir) e rotula com as datas", () => {
    const lista = [E("x", "2026-11-05", "2026-11-08"), E("y", "2026-10-01", "2026-10-03", "encerrado")];
    lembrarEvento("y");
    expect(escolherEventoPadrao(lista)).toBe("y");
    lembrarEvento("sumiu");
    expect(escolherEventoPadrao(lista)).toBe("x");
    expect(rotuloEvento(lista[0])).toBe("Festa · 05/11 a 08/11");
  });
});
