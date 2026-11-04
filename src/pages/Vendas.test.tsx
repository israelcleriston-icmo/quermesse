// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => {
  const vendas = [
    { id: "v1", numero: 7, vendedor_id: "cx", valor_total: 30, status: "finalizada", finalizada_em: "2026-11-05T15:00:00Z", perfis: { nome: "Maria Caixa" },
      vendas_itens: [{ id: "i1", nome: "Pastel", quantidade: 3, quantidade_anulada: 0, valor_unitario: 10, evento_produto_id: "ep1" }],
      vendas_pagamentos: [{ forma: "debito", valor: 10 }, { forma: "dinheiro", valor: 20 }], anulacoes: [] },
    { id: "v2", numero: 8, vendedor_id: "con", valor_total: 5, status: "finalizada", finalizada_em: "2026-11-05T15:10:00Z", perfis: { nome: "Conselheiro" },
      vendas_itens: [{ id: "i2", nome: "Suco", quantidade: 1, quantidade_anulada: 0, valor_unitario: 5, evento_produto_id: null }],
      vendas_pagamentos: [{ forma: "dinheiro", valor: 5 }], anulacoes: [] },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consulta = (tabela: string): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { select: () => q, order: () => q, eq: () => q, limit: () => q,
      then: (ok: (v: unknown) => void) => ok({ data: tabela === "eventos" ? [{ id: "ev1", nome: "Festa do Padroeiro" }] : vendas, error: null }) };
    return q;
  };
  return { configurado: true, supabase: { from: consulta, rpc: m.rpc } };
});

import Vendas from "./Vendas";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Vendas /></MemoryRouter>);

describe("vendas e anulações (Conselho)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({ carregando: false, usuario: { id: "con", nome: "Conselheiro", organizacaoId: "org1", papel: "conselho" } });
  });
  afterEach(cleanup);

  it("anula parte da venda: sugere devolver em dinheiro, exige motivo e manda os itens, devoluções e estoque", async () => {
    m.rpc.mockResolvedValue({ data: { status: "parcialmente_anulada" }, error: null });
    montar();
    await screen.findByText(/Venda nº 7/);
    fireEvent.click(screen.getAllByText("Anular…")[0]);
    fireEvent.click(screen.getByLabelText("Menos Pastel"));               // 3 -> 2
    fireEvent.click(screen.getByLabelText("Menos Pastel"));               // 2 -> 1
    expect((screen.getByLabelText("Devolvido em Dinheiro") as HTMLInputElement).value).toBe("10,00");
    fireEvent.click(screen.getByText("Confirmar anulação"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/motivo/);
    expect(m.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Motivo da anulação"), { target: { value: "cliente devolveu" } });
    fireEvent.click(screen.getByText("Confirmar anulação"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("anular_venda", {
      p_venda: "v1", p_itens: [{ item: "i1", q: 1 }], p_estornos: [{ forma: "dinheiro", valor: 10 }], p_motivo: "cliente devolveu", p_devolver_estoque: true,
    }));
    await screen.findByText("Venda anulada ✓");
  });

  it("recusa devolução que não bate com o valor, sem chamar o banco", async () => {
    montar();
    await screen.findByText(/Venda nº 7/);
    fireEvent.click(screen.getAllByText("Anular…")[0]);
    fireEvent.change(screen.getByLabelText("Devolvido em Dinheiro"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Motivo da anulação"), { target: { value: "cliente desistiu" } });
    fireEvent.click(screen.getByText("Confirmar anulação"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/precisa ser igual/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("venda feita por quem está logado não oferece anular", async () => {
    montar();
    await screen.findByText(/Venda nº 8/);
    expect(screen.getByText(/outra pessoa do Conselho precisa anular/)).toBeTruthy();
    expect(screen.getAllByText("Anular…")).toHaveLength(1);
  });

  it("traduz o erro do banco e a busca filtra pelo número", async () => {
    m.rpc.mockResolvedValue({ error: { message: "PROPRIA_VENDA" } });
    montar();
    await screen.findByText(/Venda nº 7/);
    fireEvent.change(screen.getByLabelText("Buscar venda"), { target: { value: "#8" } });
    expect(screen.queryByText(/Venda nº 7/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar venda"), { target: { value: "7" } });
    fireEvent.click(screen.getByText("Anular…"));
    fireEvent.change(screen.getByLabelText("Motivo da anulação"), { target: { value: "cliente desistiu" } });
    fireEvent.click(screen.getByText("Confirmar anulação"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/você mesmo/);
  });

  it("caixa não entra na tela", () => {
    useAuth.setState({ usuario: { id: "x", nome: "Caixa", organizacaoId: "org1", papel: "caixa" } });
    montar();
    expect(screen.queryByText("Vendas e anulações")).toBeNull();
  });
});
