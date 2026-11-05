// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = { select: () => q, order: () => q, then: (ok: (v: unknown) => void) => ok({ data: [{ id: "ev1", nome: "Festa do Padroeiro" }], error: null }) };
  return { configurado: true, supabase: { from: () => q, rpc: m.rpc } };
});

import Relatorios from "./Relatorios";
import { useAuth } from "../store/auth";

const REL = {
  evento: { id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro", status: "aberto" }, gerado_em: "2026-11-05T15:00:00Z",
  resumo: { vendas: 3, anuladas: 1, parciais: 1, cortesias: 0, bruto: 100, devolvido: 20, liquido: 80 },
  por_forma: [{ forma: "dinheiro", vendido: 70, devolvido: 20, liquido: 50 }, { forma: "pix", vendido: 30, devolvido: 0, liquido: 30 }],
  por_produto: [{ nome: "Pastel", quantidade: 8, faturamento: 80 }], por_caixa: [{ caixa: "Maria", vendas: 3, liquido: 80 }],
  por_dia: [{ dia: "2026-11-05", vendas: 3, liquido: 80 }], anulacoes: [{ numero: 7, valor: 20, motivo: "cliente desistiu", por: "Zé", em: "2026-11-05T16:00:00Z" }],
  sangrias: { total: 100, pendentes: 50 }, turnos: { total: 2, abertos: 1, sem_conferir: 0 },
};
const montar = () => render(<MemoryRouter><Relatorios /></MemoryRouter>);

describe("relatórios (Conselho)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockResolvedValue({ data: REL, error: null });
    useAuth.setState({ carregando: false, usuario: { id: "c", nome: "Conselheiro", organizacaoId: "org1", papel: "conselho" } });
  });
  afterEach(cleanup);

  it("mostra os números líquidos, os blocos e o aviso de pendências", async () => {
    montar();
    await screen.findByText("Total líquido");
    expect(m.rpc).toHaveBeenCalledWith("relatorio_evento", { p_evento: "ev1" });
    expect(screen.getAllByText(/R\$\s*80,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("8× Pastel")).toBeTruthy();
    expect(screen.getByText(/Venda nº 7 · Zé/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/1 turno\(s\) ainda aberto/);
    expect(screen.getByRole("status").textContent).toMatch(/Sangrias não confirmadas: R\$\s*50,00/);
  });

  it("baixa o CSV e abre a impressão (PDF)", async () => {
    const criar = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() });
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => undefined);
    montar();
    await screen.findByText("Total líquido");
    fireEvent.click(screen.getByText(/Baixar para Excel/));
    expect(criar).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Salvar em PDF/));
    expect(imprimir).toHaveBeenCalled();
  });

  it("erro de permissão vira mensagem clara; caixa não entra", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "SEM_PERMISSAO" } });
    montar();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Apenas o Conselho/);
    cleanup();
    useAuth.setState({ usuario: { id: "x", nome: "Caixa", organizacaoId: "org1", papel: "caixa" } });
    montar();
    expect(screen.queryByText("Relatórios")).toBeNull();
  });
});
