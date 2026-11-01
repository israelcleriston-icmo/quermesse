// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/vendas", () => ({
  carregarEventoAtivo: async () => ({ id: "ev1", codigo: "EVT1", nome: "Festa", chavePix: "k" }),
  carregarCardapio: async () => [
    { id: "p1", nome: "Pastel de carne", categoria: "Comidas", ordemCategoria: 1, valorCentavos: 700, estoque: 3, imagemUrl: null },
    { id: "r1", nome: "Rifa", categoria: "Rifas", ordemCategoria: 2, valorCentavos: 500, estoque: null, imagemUrl: null },
  ],
  finalizarVenda: vi.fn(),
}));

import Pdv from "./Pdv";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

const montar = () =>
  render(<MemoryRouter><Pdv /></MemoryRouter>);

describe("PDV: adicionar e remover itens", () => {
  beforeEach(() => {
    useSacola.getState().limpar();
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Caixa", organizacaoId: "o", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("tocar no cartão adiciona; − remove; barra da sacola acompanha", async () => {
    montar();
    await screen.findByText("Pastel de carne");
    fireEvent.click(screen.getByText("Pastel de carne"));
    await screen.findByText(/Ver sacola · 1 item · R\$\s7,00/);
    fireEvent.click(screen.getByLabelText("Mais"));
    await screen.findByText(/Ver sacola · 2 itens/);
    fireEvent.click(screen.getByLabelText("Menos"));
    await screen.findByText(/Ver sacola · 1 item/);
    fireEvent.click(screen.getByLabelText("Menos"));
    await waitFor(() => expect(screen.queryByText(/Ver sacola/)).toBeNull());
  });

  it("não funciona em contexto sem crypto.randomUUID (http fora de localhost)?", async () => {
    const original = crypto.randomUUID;
    // @ts-expect-error simula navegador em http://192.168.x.x (contexto inseguro)
    crypto.randomUUID = undefined;
    try {
      montar();
      await screen.findByText("Rifa");
      fireEvent.click(screen.getByText("Rifa"));
      await screen.findByText(/Ver sacola · 1 item/);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
