// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstalarApp from "./InstalarApp";
import { _simularEvento } from "../lib/instalar";

const semStandalone = () => Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false }), configurable: true });
const UA = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });

afterEach(() => { cleanup(); _simularEvento(null); UA("jsdom"); });

describe("instalar na tela inicial", () => {
  it("Android: mostra o botão quando o navegador avisa e dispara o aviso de instalação", async () => {
    semStandalone(); UA("Android Chrome");
    render(<InstalarApp />);
    expect(screen.queryByText(/Instalar o app/)).toBeNull();
    const prompt = vi.fn().mockResolvedValue(undefined);
    act(() => _simularEvento({ prompt, userChoice: Promise.resolve({ outcome: "accepted" }) } as never));
    fireEvent.click(await screen.findByText(/Instalar o app/));
    await act(async () => {});
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByText(/Instalar o app/)).toBeNull();      // o aviso só vale uma vez
  });

  it("iPhone: mostra o passo a passo", () => {
    semStandalone(); UA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    render(<InstalarApp />);
    fireEvent.click(screen.getByText(/Adicionar à tela inicial/));
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy();
  });

  it("já instalado (modo standalone): não mostra nada", () => {
    Object.defineProperty(window, "matchMedia", { value: () => ({ matches: true }), configurable: true });
    UA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    const { container } = render(<InstalarApp />);
    expect(container.textContent).toBe("");
  });
});
