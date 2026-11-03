// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copiarTexto } from "./copiar";

afterEach(() => { vi.restoreAllMocks(); });

describe("copiarTexto", () => {
  it("usa navigator.clipboard quando disponível (contexto seguro)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    expect(await copiarTexto("abc")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });
  it("sem clipboard (http): usa execCommand e devolve o resultado", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copiarTexto("xyz")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    exec.mockReturnValue(false);
    expect(await copiarTexto("xyz")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();      // não deixa lixo na página
  });
});
