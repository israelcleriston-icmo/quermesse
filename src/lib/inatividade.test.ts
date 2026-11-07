// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITE_MS, expirou, iniciarVigia, limparAtividade, registrarAtividade } from "./inatividade";

describe("inatividade", () => {
  beforeEach(() => { localStorage.clear(); limparAtividade(); });
  afterEach(() => vi.useRealTimers());

  it("o limite é de 3 horas", () => expect(LIMITE_MS).toBe(3 * 3600 * 1000));
  it("sem registro não expira", () => expect(expirou()).toBe(false));
  it("expira só depois do limite", () => {
    registrarAtividade(1_000_000, true);
    expect(expirou(1_000_000 + LIMITE_MS - 1)).toBe(false);
    expect(expirou(1_000_000 + LIMITE_MS + 1)).toBe(true);
  });
  it("atividade renova (mas grava no máximo a cada 30 s)", () => {
    registrarAtividade(1_000_000, true);
    registrarAtividade(1_000_100);                       // dentro dos 30 s: ignora
    expect(localStorage.getItem("quermesse-ultima-atividade")).toBe("1000000");
    registrarAtividade(1_000_000 + 31_000);
    expect(localStorage.getItem("quermesse-ultima-atividade")).toBe(String(1_031_000));
  });
  it("o vigia chama aoExpirar quando o aparelho volta depois do limite", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T08:00:00"));
    const aoExpirar = vi.fn();
    const parar = iniciarVigia(aoExpirar);
    vi.setSystemTime(new Date("2026-11-03T08:00:00").getTime() + LIMITE_MS + 120_000);
    vi.advanceTimersByTime(61_000);
    expect(aoExpirar).toHaveBeenCalled();
    parar();
  });
});
