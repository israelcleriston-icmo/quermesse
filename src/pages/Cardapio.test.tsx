// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), qr: vi.fn(async () => "data:image/png;base64,AAAA") }));
vi.mock("../lib/supabase", () => ({ configurado: true, supabase: { rpc: m.rpc, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "http://x/img.png" } }) }) } } }));
vi.mock("qrcode", () => ({ default: { toDataURL: m.qr } }));

import CardapioPublico from "./Cardapio";
import { lerPedido } from "../lib/pedido";

const DADOS = {
  evento: { id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro" },
  itens: [
    { seq: 11, id: "a", nome: "Pastel", categoria: "Comidas", valor: 8, imagem_path: null, esgotado: false },
    { seq: 12, id: "b", nome: "Coxinha", categoria: "Comidas", valor: 5.5, imagem_path: null, esgotado: true },
    { seq: 13, id: "c", nome: "Suco", categoria: "Bebidas", valor: 4, imagem_path: null, esgotado: false },
  ],
};
const montar = (url = "/cardapio") => render(<MemoryRouter initialEntries={[url]}><CardapioPublico /></MemoryRouter>);

describe("fura-fila: cardápio público do cliente", () => {
  beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: DADOS, error: null }); });
  afterEach(cleanup);

  it("mostra o cardápio sem login, esgotado sem botão; monta o pedido e gera o QR só com seq, quantidade e evento", async () => {
    montar();
    await screen.findByText("Pastel");
    expect(screen.getByText("ESGOTADO")).toBeTruthy();
    expect(screen.queryByLabelText("Adicionar Coxinha")).toBeNull();
    fireEvent.click(screen.getByLabelText("Adicionar Pastel"));
    fireEvent.click(screen.getByLabelText("Mais Pastel"));
    fireEvent.click(screen.getByLabelText("Adicionar Suco"));
    await screen.findByText(/Ver meu pedido · 3 itens · R\$\s*20,00/);
    fireEvent.click(screen.getByText(/Ver meu pedido/));
    fireEvent.click(screen.getByText("Gerar QR do pedido"));
    await screen.findByAltText("QR Code do pedido");
    const texto = (m.qr.mock.calls[0] as unknown as [string])[0];
    expect(lerPedido(texto)).toEqual({ ok: true, pedido: { codigoEvento: "EVT1", itens: [{ seq: 11, q: 2 }, { seq: 13, q: 1 }] } });
    expect(texto).not.toMatch(/R\$|\d[.]\d/);                            // sem preço no QR
    expect(screen.getByText(/pague lá|O pagamento é feito no caixa/)).toBeTruthy();
    fireEvent.click(screen.getByText("← Alterar pedido"));
    await screen.findByText("Pastel");                                    // o pedido continua lá para editar
    expect(screen.getByText(/Ver meu pedido · 3 itens/)).toBeTruthy();
  });

  it("pede o evento certo quando o link do cartaz traz ?e=", async () => {
    montar("/cardapio?e=ev9");
    await screen.findByText("Pastel");
    expect(m.rpc).toHaveBeenCalledWith("cardapio_publico", { p_evento_id: "ev9" });
  });

  it("sem evento aberto e erro de rede", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: null });
    montar();
    await screen.findByText("Nenhum evento aberto no momento.");
    cleanup();
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
    montar();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Verifique a conexão/));
  });
});
