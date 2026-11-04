// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = { select: () => q, order: () => q, then: (ok: (v: unknown) => void) => ok({ data: [{ id: "ev1", nome: "Festa do Padroeiro" }], error: null }) };
  return { configurado: true, supabase: { from: () => q, rpc: m.rpc } };
});

import Conferencia from "./Conferencia";
import { useAuth } from "../store/auth";

const turno = (extra = {}) => ({
  turno_id: "t1", caixa: "Maria Caixa", proprio: false, aberto_em: "2026-11-05T12:00:00Z", fechado_em: "2026-11-05T18:00:00Z",
  fundo_inicial: 50, vendas_dinheiro: 20, sangrias_total: 30, sangrias_pendentes: 30,
  sangrias: [{ id: "s1", valor: 30, motivo: "cofre", registrada_em: "2026-11-05T15:00:00Z", confirmada: false }],
  outras_formas: { debito: 10 }, contado: 39, obs_fechamento: null, esperado: 40, diferenca: -1, conferido_em: null, obs_conferencia: null, ...extra,
});
const montar = () => render(<MemoryRouter><Conferencia /></MemoryRouter>);

describe("conferência dos caixas (Conselho)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({ carregando: false, usuario: { id: "c", nome: "Conselheiro", organizacaoId: "org1", papel: "conselho" } });
    m.rpc.mockImplementation(async (nome: string) => nome === "conferencia_turnos" ? { data: [turno()], error: null } : { error: null });
  });
  afterEach(cleanup);

  it("mostra esperado, contado e diferença; confirma sangria e confere o turno", async () => {
    montar();
    await screen.findByText("Maria Caixa");
    expect(screen.getByText("1 turno aguardando conferência")).toBeTruthy();
    expect(screen.getByText(/R\$\s*1,00 \(faltou\)/)).toBeTruthy();
    expect(screen.getByText(/Débito R\$\s*10,00/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Confirmar sangria de R\$\s*30,00/));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("confirmar_sangria", { p_sangria: "s1" }));
    fireEvent.change(screen.getByLabelText("Observação da conferência"), { target: { value: "ok" } });
    fireEvent.click(screen.getByText("Conferir turno"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("conferir_turno", { p_turno: "t1", p_obs: "ok" }));
  });

  it("no próprio turno não há esperado, nem botões de confirmar ou conferir", async () => {
    m.rpc.mockResolvedValue({ data: [turno({ proprio: true, esperado: null, diferenca: null })], error: null });
    montar();
    await screen.findByText(/outra pessoa do Conselho precisa conferir/);
    expect(screen.queryByText("Conferir turno")).toBeNull();
    expect(screen.queryByText("Confirmar recebimento")).toBeNull();
  });

  it("caixa não entra na tela", () => {
    useAuth.setState({ usuario: { id: "x", nome: "Caixa", organizacaoId: "org1", papel: "caixa" } });
    montar();
    expect(screen.queryByText("Conferência dos caixas")).toBeNull();
  });
});
