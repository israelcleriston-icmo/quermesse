// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/vendas", () => ({
  carregarEventosAtivos: async () => [{ id: "ev1", codigo: "EVT1", nome: "Festa", chavePix: "k" }],
  carregarCardapio: async () => [
    { id: "p1", seq: 11, nome: "Pastel", categoria: "Comidas", ordemCategoria: 1, valorCentavos: 800, estoque: 3, imagemUrl: null },
    { id: "p2", seq: 12, nome: "Coxinha", categoria: "Comidas", ordemCategoria: 1, valorCentavos: 500, estoque: 0, imagemUrl: null },
    { id: "p3", seq: 13, nome: "Suco", categoria: "Bebidas", ordemCategoria: 2, valorCentavos: 400, estoque: null, imagemUrl: null },
  ],
  finalizarVenda: vi.fn(),
}));

import Pdv from "./Pdv";
import { codificarPedido } from "../lib/pedido";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

async function abrirLeitor() {
  render(<MemoryRouter><Pdv /></MemoryRouter>);
  await screen.findByText("Pastel");
  fireEvent.click(screen.getByText("📷 Pedido do cliente"));
  fireEvent.click(await screen.findByText("Colar código"));
}
const colar = (t: string) => {
  fireEvent.change(screen.getByLabelText("Código lido"), { target: { value: t } });
  fireEvent.click(screen.getByText("Usar este código"));
};

describe("PDV: abrir o pedido do fura-fila", () => {
  beforeEach(() => {
    useSacola.getState().limpar();
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Caixa", organizacaoId: "o", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("monta a sacola com os preços de agora, corta no estoque e avisa do esgotado", async () => {
    await abrirLeitor();
    colar(codificarPedido("EVT1", [{ seq: 11, q: 5 }, { seq: 12, q: 1 }, { seq: 13, q: 2 }]));
    await screen.findByText("Sacola");                                      // a sacola abre sozinha
    const l = useSacola.getState().linhas;
    expect(Object.values(l).map((x) => [x.nome, x.qtd, x.valorCentavos])).toEqual([["Pastel", 3, 800], ["Suco", 2, 400]]);
    fireEvent.click(screen.getByText("Voltar ao cardápio"));
    await screen.findByText(/Pedido do cliente aberto com ajustes/);
    expect(screen.getByText(/Pastel: só há 3/)).toBeTruthy();
    expect(screen.getByText(/Coxinha: esgotado/)).toBeTruthy();
  });

  it("recusa pedido de outro evento, QR que não é do Quermesse e código adulterado", async () => {
    await abrirLeitor();
    colar(codificarPedido("EVT9", [{ seq: 11, q: 1 }]));
    expect((await screen.findByRole("alert")).textContent).toMatch(/evento EVT9.*EVT1/);
    colar("https://qualquer.coisa");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/não é um pedido do Quermesse/));
    colar(codificarPedido("EVT1", [{ seq: 11, q: 1 }]).replace("11x1", "11x2"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/erro de leitura/));
    expect(Object.keys(useSacola.getState().linhas)).toHaveLength(0);
  });

  it("com venda em andamento pede confirmação antes de substituir a sacola", async () => {
    render(<MemoryRouter><Pdv /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Suco"));
    fireEvent.click(screen.getByText("📷 Pedido do cliente"));
    fireEvent.click(await screen.findByText("Colar código"));
    const conf = vi.spyOn(window, "confirm").mockReturnValue(false);
    colar(codificarPedido("EVT1", [{ seq: 11, q: 1 }]));
    expect(conf).toHaveBeenCalled();
    expect(Object.values(useSacola.getState().linhas).map((x) => x.nome)).toEqual(["Suco"]);   // manteve
    conf.mockReturnValue(true);
    fireEvent.click(screen.getByText("Usar este código"));
    await waitFor(() => expect(Object.values(useSacola.getState().linhas).map((x) => x.nome)).toEqual(["Pastel"]));
    conf.mockRestore();
  });
});
