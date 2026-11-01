// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  finalizarVenda: vi.fn(),
  registrarPix: vi.fn(),
  descartarPix: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("../lib/vendas", () => ({
  carregarEventoAtivo: async () => ({ id: "ev1", codigo: "EVT1", nome: "Festa", chavePix: "123e4567-e12b-12d1-a456-426655440000" }),
  carregarCardapio: async () => [
    { id: "p1", nome: "Pastel", categoria: "Comidas", ordemCategoria: 1, valorCentavos: 700, estoque: 50, imagemUrl: null },
    { id: "r1", nome: "Rifa", categoria: "Rifas", ordemCategoria: 2, valorCentavos: 500, estoque: null, imagemUrl: null },
  ],
  finalizarVenda: m.finalizarVenda,
  registrarPix: m.registrarPix,
  descartarPix: m.descartarPix,
}));
vi.mock("../lib/supabase", () => ({
  configurado: true,
  supabase: { storage: { from: () => ({ upload: m.upload }) } },
}));
vi.mock("../lib/imagem", () => ({ comprimirImagem: async () => new Blob(["x"], { type: "image/jpeg" }) }));

import Pdv from "./Pdv";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

const texto = (re: RegExp) => screen.getByText(re).textContent ?? "";

async function montarSacola12() {
  render(<MemoryRouter><Pdv /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Pastel"));
  fireEvent.click(screen.getByText("Rifa"));
  fireEvent.click(await screen.findByText(/Ver sacola · 2 itens/));
  fireEvent.click(await screen.findByText("Ir para o pagamento"));
  await screen.findByText(/1\. Valores/);
}

describe("PDV: fluxo completo de pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = () => "blob:previa";
    useSacola.getState().limpar();
    useAuth.setState({ carregando: false, usuario: { id: "u1", nome: "Caixa", organizacaoId: "o", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("dinheiro com troco: total 12,00, entregou 15,00 -> TROCO 3,00 e venda enviada certa", async () => {
    m.finalizarVenda.mockResolvedValue({ numero: 7, valor_total: 12, troco_total: 3, ja_existia: false });
    await montarSacola12();
    fireEvent.change(screen.getByLabelText("Dinheiro entregue"), { target: { value: "15" } });
    expect(texto(/TROCO/)).toMatch(/R\$\s*3,00/);
    fireEvent.click(screen.getByText("Continuar"));
    fireEvent.click(await screen.findByText("Finalizar venda"));
    await screen.findByText(/Venda nº 7 registrada/);
    expect(m.finalizarVenda).toHaveBeenCalledTimes(1);
    const arg = m.finalizarVenda.mock.calls[0][0];
    expect(arg.pagamentos).toEqual([{ forma: "dinheiro", valorCentavos: 1200, recebidoCentavos: 1500 }]);
    expect(arg.itens).toEqual([{ ep: "p1", q: 1 }, { ep: "r1", q: 1 }]);
    expect(texto(/TROCO/)).toMatch(/R\$\s*3,00/);                 // tela final mostra o troco
    expect(useSacola.getState().vendaId).toBeNull();               // sacola zerada
  });

  it("pagamento misto: Pix 5 + débito 3 + dinheiro 4 (entregou 10): troco 6", async () => {
    m.finalizarVenda.mockResolvedValue({ numero: 8, valor_total: 12, troco_total: 6, ja_existia: false });
    m.registrarPix.mockResolvedValue("EVT1V000008A");
    m.upload.mockResolvedValue({ error: null });
    await montarSacola12();
    fireEvent.change(screen.getByLabelText("Pix"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Débito"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Dinheiro entregue"), { target: { value: "10" } });
    expect(texto(/TROCO/)).toMatch(/R\$\s*6,00/);
    fireEvent.click(screen.getByText("Continuar para o Pix"));
    await screen.findByAltText("QR Code do Pix");
    expect(m.registrarPix).toHaveBeenCalledWith("ev1", 500, expect.any(String));
    expect(screen.getByText("EVT1V000008A")).toBeTruthy();
    // foto do comprovante
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] } });
    await screen.findByText(/3\. Confirmar/);
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(m.upload.mock.calls[0][0]).toMatch(/^ev1\/u1\/.+\.jpg$/);
    fireEvent.click(screen.getByText("Finalizar venda"));
    await screen.findByText(/Venda nº 8 registrada/);
    const { pagamentos } = m.finalizarVenda.mock.calls[0][0];
    expect(pagamentos).toEqual([
      { forma: "dinheiro", valorCentavos: 400, recebidoCentavos: 1000 },
      { forma: "debito", valorCentavos: 300 },
      { forma: "pix", valorCentavos: 500, txid: "EVT1V000008A", comprovante: expect.stringMatching(/^ev1\/u1\/.+\.jpg$/) },
    ]);
  });

  it("Pix: 'Cliente não pagou' pede confirmação e descarta o QR", async () => {
    m.registrarPix.mockResolvedValue("EVT1V000009A");
    m.descartarPix.mockResolvedValue(undefined);
    await montarSacola12();
    fireEvent.click(screen.getAllByText("Resto")[0]);                // Pix = tudo
    fireEvent.click(screen.getByText("Continuar para o Pix"));
    await screen.findByAltText("QR Code do Pix");
    fireEvent.click(screen.getByText("Cliente não pagou"));
    fireEvent.click(await screen.findByText("Sim, não pagou"));
    await screen.findByText(/1\. Valores/);
    expect(m.descartarPix).toHaveBeenCalledWith("EVT1V000009A");
  });

  it("botão Continuar só libera com o pagamento completo", async () => {
    await montarSacola12();
    const continuar = screen.getByText("Continuar") as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Dinheiro entregue"), { target: { value: "5" } });
    expect(continuar.disabled).toBe(true);
    expect(texto(/Falta/)).toMatch(/R\$\s*7,00/);
    fireEvent.click(screen.getByText("Exato"));
    expect(continuar.disabled).toBe(false);
  });

  it("na sacola, + e − de cada item funcionam", async () => {
    render(<MemoryRouter><Pdv /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Pastel"));
    fireEvent.click(await screen.findByText(/Ver sacola/));
    fireEvent.click(screen.getByLabelText("Mais Pastel"));
    await waitFor(() => expect(useSacola.getState().linhas.p1.qtd).toBe(2));
    fireEvent.click(screen.getByLabelText("Menos Pastel"));
    await waitFor(() => expect(useSacola.getState().linhas.p1.qtd).toBe(1));
  });
});
