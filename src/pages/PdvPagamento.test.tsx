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
  carregarEventosAtivos: async () => [{ id: "ev1", codigo: "EVT1", nome: "Festa", chavePix: "123e4567-e12b-12d1-a456-426655440000", nomeRecebedor: "MITRA ARQUIDIOCESANA DE F", cidadeRecebedor: "Fortaleza" }],
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
  supabase: { auth: { signOut: async () => ({}) }, storage: { from: () => ({ upload: m.upload }) } },
}));
vi.mock("../lib/imagem", () => ({ comprimirImagem: async () => new Blob(["x"], { type: "image/jpeg" }) }));

import Pdv from "./Pdv";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

const texto = (re: RegExp) => screen.getByText(re).textContent ?? "";
const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

async function irParaPagamento() {
  render(<MemoryRouter><Pdv /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Pastel"));
  fireEvent.click(screen.getByText("Rifa"));
  fireEvent.click(await screen.findByText(/Ver sacola · 2 itens/));
  fireEvent.click(await screen.findByText("Ir para o pagamento"));
  await screen.findByText(/Falta\s+R\$\s*12,00/);                          // total 7,00 + 5,00
}

describe("PDV: pagamento em sequência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = () => "blob:previa";
    useSacola.getState().limpar();
    useAuth.setState({ carregando: false, usuario: { id: "u1", nome: "Caixa", organizacaoId: "o", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("dinheiro com troco: total 12,00, entregou 15,00 -> TROCO 3,00; venda enviada certa; sacola zerada", async () => {
    m.finalizarVenda.mockResolvedValue({ numero: 7, valor_total: 12, troco_total: 3, ja_existia: false });
    await irParaPagamento();
    fireEvent.click(botao("Dinheiro"));
    expect((screen.getByLabelText("Valor desta parte") as HTMLInputElement).value).toBe("12,00");   // já vem o que falta
    digitar("Cliente entregou", "15");
    expect(texto(/TROCO/)).toMatch(/R\$\s*3,00/);
    fireEvent.click(botao("Confirmar"));
    await screen.findByText("Pago ✓");
    fireEvent.click(botao("Finalizar venda"));
    await screen.findByText(/Venda nº 7 registrada/);
    expect(m.finalizarVenda.mock.calls[0][0].pagamentos).toEqual([{ forma: "dinheiro", valorCentavos: 1200, recebidoCentavos: 1500 }]);
    expect(m.finalizarVenda.mock.calls[0][0].itens).toEqual([{ ep: "p1", q: 1 }, { ep: "r1", q: 1 }]);
    expect(texto(/TROCO/)).toMatch(/R\$\s*3,00/);                 // tela final mostra o troco
    expect(useSacola.getState().vendaId).toBeNull();
    fireEvent.click(screen.getByText("Próximo cliente"));
    await waitFor(() => expect(screen.queryByLabelText("Menos")).toBeNull());   // nenhum cartão com quantidade sobrando
    expect(screen.queryByText(/Ver sacola/)).toBeNull();
  });

  it("misto em sequência: Pix 5 (QR + foto) -> falta 7 -> débito 3 -> falta 4 -> dinheiro 4 entregue 10 -> troco 6", async () => {
    m.finalizarVenda.mockResolvedValue({ numero: 8, valor_total: 12, troco_total: 6, ja_existia: false });
    m.registrarPix.mockResolvedValue("EVT1V000008A");
    m.upload.mockResolvedValue({ error: null });
    await irParaPagamento();

    fireEvent.click(botao("Pix"));
    digitar("Valor desta parte", "5");
    fireEvent.click(botao("Gerar QR Code"));
    await screen.findByAltText("QR Code do Pix");
    expect(m.registrarPix).toHaveBeenCalledWith("ev1", 500, expect.any(String));
    expect(screen.getByText("EVT1V000008A")).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] } });
    await screen.findByText(/Falta\s+R\$\s*7,00/);                // o Pix abateu 5,00 e voltou a perguntar a forma do resto
    expect(m.upload.mock.calls[0][0]).toMatch(/^ev1\/u1\/.+\.jpg$/);

    fireEvent.click(botao("Débito"));
    digitar("Valor desta parte", "3");
    fireEvent.click(botao("Confirmar"));
    await screen.findByText(/Falta\s+R\$\s*4,00/);

    fireEvent.click(botao("Dinheiro"));
    expect((screen.getByLabelText("Valor desta parte") as HTMLInputElement).value).toBe("4,00");
    digitar("Cliente entregou", "10");
    expect(texto(/TROCO/)).toMatch(/R\$\s*6,00/);                 // troco considera o que já foi pago
    fireEvent.click(botao("Confirmar"));
    await screen.findByText("Pago ✓");
    fireEvent.click(botao("Finalizar venda"));
    await screen.findByText(/Venda nº 8 registrada/);
    expect(m.finalizarVenda.mock.calls[0][0].pagamentos).toEqual([
      { forma: "pix", valorCentavos: 500, txid: "EVT1V000008A", comprovante: expect.stringMatching(/^ev1\/u1\/.+\.jpg$/) },
      { forma: "debito", valorCentavos: 300 },
      { forma: "dinheiro", valorCentavos: 400, recebidoCentavos: 1000 },
    ]);
  });

  it("dinheiro parcial com nota maior: parte 4,00 entregando 10,00 e o resto no crédito", async () => {
    await irParaPagamento();
    fireEvent.click(botao("Dinheiro"));
    digitar("Valor desta parte", "4");
    digitar("Cliente entregou", "10");
    expect(texto(/TROCO/)).toMatch(/R\$\s*6,00/);
    fireEvent.click(botao("Confirmar"));
    await screen.findByText(/Falta\s+R\$\s*8,00/);
    fireEvent.click(botao("Crédito"));
    expect((screen.getByLabelText("Valor desta parte") as HTMLInputElement).value).toBe("8,00");
    fireEvent.click(botao("Confirmar"));
    await screen.findByText("Pago ✓");
  });

  it("Pix: 'Cliente não pagou' pede confirmação, descarta o QR e volta a escolher a forma", async () => {
    m.registrarPix.mockResolvedValue("EVT1V000009A");
    m.descartarPix.mockResolvedValue(undefined);
    await irParaPagamento();
    fireEvent.click(botao("Pix"));
    fireEvent.click(botao("Gerar QR Code"));
    await screen.findByAltText("QR Code do Pix");
    fireEvent.click(botao("Cliente não pagou"));
    fireEvent.click(await screen.findByText("Sim, não pagou"));
    await screen.findByText(/Escolha a forma de pagamento/);
    expect(m.descartarPix).toHaveBeenCalledWith("EVT1V000009A");
    expect(texto(/Falta/)).toMatch(/R\$\s*12,00/);
  });

  it("Pix: copia o código (com plano B se não conseguir) e envia pelo WhatsApp do cliente", async () => {
    m.registrarPix.mockResolvedValue("EVT1V000010A");
    await irParaPagamento();
    fireEvent.click(botao("Pix"));
    fireEvent.click(botao("Gerar QR Code"));
    await screen.findByAltText("QR Code do Pix");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    fireEvent.click(botao("Copiar código Pix"));
    await screen.findByText("Copiado ✓");
    expect(writeText.mock.calls[0][0]).toMatch(/^000201/);          // é o BR Code
    expect(writeText.mock.calls[0][0]).toContain("5925MITRA ARQUIDIOCESANA DE F6009Fortaleza");   // nome e cidade da chave

    // plano B: sem como copiar, mostra o código para copiar à mão
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    (document as unknown as { execCommand: unknown }).execCommand = () => false;
    fireEvent.click(botao("Copiado ✓"));
    await screen.findByText(/Código Pix Copia e Cola/);

    fireEvent.click(botao("Enviar por WhatsApp"));
    digitar("Celular do cliente", "11912345678");
    const link = screen.getByText("Abrir WhatsApp") as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/wa\.me\/5511912345678\?text=/);
    expect(decodeURIComponent(link.href)).toContain("EVT1V000010A");
  });

  it("WhatsApp: número incompleto não libera o botão", async () => {
    m.registrarPix.mockResolvedValue("EVT1V000011A");
    await irParaPagamento();
    fireEvent.click(botao("Pix"));
    fireEvent.click(botao("Gerar QR Code"));
    await screen.findByAltText("QR Code do Pix");
    fireEvent.click(botao("Enviar por WhatsApp"));
    digitar("Celular do cliente", "1191234");
    expect((screen.getByText("Abrir WhatsApp") as HTMLElement).tagName).toBe("SPAN");
  });

  it("valor maior que o que falta não confirma", async () => {
    await irParaPagamento();
    fireEvent.click(botao("Crédito"));
    digitar("Valor desta parte", "20");
    expect(screen.getByText("Maior que o que falta pagar.")).toBeTruthy();
    expect((botao("Confirmar") as HTMLButtonElement).disabled).toBe(true);
  });

  it("dá para remover uma parte (menos Pix) e o 'Falta' volta", async () => {
    await irParaPagamento();
    fireEvent.click(botao("Crédito"));
    fireEvent.click(botao("Confirmar"));
    await screen.findByText("Pago ✓");
    fireEvent.click(botao("Remover Crédito"));
    await screen.findByText(/Falta\s+R\$\s*12,00/);
  });

  it("cancelar venda esvazia a sacola sem precisar zerar item por item", async () => {
    render(<MemoryRouter><Pdv /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Pastel"));
    fireEvent.click(screen.getByText("Rifa"));
    fireEvent.click(await screen.findByText(/Ver sacola/));
    fireEvent.click(botao("Cancelar venda"));
    fireEvent.click(await screen.findByText("Sim, cancelar"));
    await waitFor(() => expect(screen.queryByText(/Ver sacola/)).toBeNull());
    expect(useSacola.getState().vendaId).toBeNull();
    expect(Object.keys(useSacola.getState().linhas)).toHaveLength(0);
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

  it("trocar de perfil não herda a sacola de quem usou antes", async () => {
    useSacola.getState().adicionar({ id: "p1", nome: "Pastel", valorCentavos: 700, max: 50 });
    expect(useSacola.getState().vendaId).not.toBeNull();
    await useAuth.getState().sair();
    expect(useSacola.getState().vendaId).toBeNull();
    expect(Object.keys(useSacola.getState().linhas)).toHaveLength(0);
  });
});
