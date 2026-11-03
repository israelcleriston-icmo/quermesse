// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ cardapio: vi.fn() }));
vi.mock("../lib/vendas", () => ({
  carregarEventosAtivos: async () => [
    { id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro", chavePix: "k1" },
    { id: "ev2", codigo: "EVT2", nome: "Noite do Pastel", chavePix: "k2" },
  ],
  carregarCardapio: m.cardapio,
  finalizarVenda: vi.fn(),
}));

import Pdv from "./Pdv";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

const item = { id: "p1", nome: "Pastel", categoria: "Comidas", ordemCategoria: 1, valorCentavos: 700, estoque: 10, imagemUrl: null };

describe("PDV com dois eventos abertos", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useSacola.getState().limpar();
    m.cardapio.mockImplementation(async (id: string) => (id === "ev1" ? [item] : []));
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Caixa", organizacaoId: "o", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("mostra seletor, troca de evento, carrega o cardápio do outro e avisa quando está vazio", async () => {
    render(<MemoryRouter><Pdv /></MemoryRouter>);
    await screen.findByText("Pastel");
    const sel = screen.getByLabelText("Evento") as HTMLSelectElement;
    expect(sel.value).toBe("ev1");
    fireEvent.change(sel, { target: { value: "ev2" } });
    await screen.findByText(/ainda não tem produtos no cardápio/);
    expect(screen.queryByText("Pastel")).toBeNull();
    expect(m.cardapio).toHaveBeenLastCalledWith("ev2");
    expect(sessionStorage.getItem("quermesse-dev-evento")).toBe("ev2");   // lembra a escolha
  });

  it("trocar de evento com sacola pede confirmação e descarta a sacola", async () => {
    render(<MemoryRouter><Pdv /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Pastel"));
    await screen.findByText(/Ver sacola/);
    const conf = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Evento"), { target: { value: "ev2" } });
    expect(conf).toHaveBeenCalled();
    expect((screen.getByLabelText("Evento") as HTMLSelectElement).value).toBe("ev1");   // recusou: continua
    expect(screen.getByText(/Ver sacola/)).toBeTruthy();
    conf.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Evento"), { target: { value: "ev2" } });
    await waitFor(() => expect(screen.queryByText(/Ver sacola/)).toBeNull());
    expect(useSacola.getState().vendaId).toBeNull();
    conf.mockRestore();
  });
});
