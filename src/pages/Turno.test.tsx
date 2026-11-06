// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), turno: null as unknown, sangrias: [] as unknown[] }));
vi.mock("../lib/supabase", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consulta = (tabela: string): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { select: () => q, eq: () => q, is: () => q, order: () => q,
      maybeSingle: async () => ({ data: m.turno, error: null }),
      then: (ok: (v: unknown) => void) => ok({ data: tabela === "sangrias" ? m.sangrias : [], error: null }) };
    return q;
  };
  return { configurado: true, supabase: { from: consulta, rpc: m.rpc } };
});
vi.mock("../lib/vendas", () => ({ carregarEventosAtivos: async () => [{ id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro", chavePix: "k" }] }));

import Turno from "./Turno";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Turno /></MemoryRouter>);

describe("turno do caixa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.turno = null; m.sangrias = [];
    useAuth.setState({ carregando: false, usuario: { id: "u1", nome: "Maria", organizacaoId: "org1", papel: "caixa" } });
  });
  afterEach(cleanup);

  it("abre o turno com o fundo de troco", async () => {
    m.rpc.mockResolvedValue({ error: null });
    montar();
    await screen.findByText("Festa do Padroeiro");
    fireEvent.change(screen.getByLabelText("Fundo de troco"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByText("Abrir turno", { selector: "button" }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("abrir_turno", { p_evento: "ev1", p_fundo: 50 }));
  });

  it("recusa fundo inválido sem chamar o banco", async () => {
    montar();
    await screen.findByText("Festa do Padroeiro");
    fireEvent.change(screen.getByLabelText("Fundo de troco"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Abrir turno", { selector: "button" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/inválido/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("com turno aberto: registra sangria e fecha SEM mostrar nada esperado; mostra só o agradecimento", async () => {
    m.turno = { id: "t1", evento_id: "ev1", aberto_em: new Date().toISOString(), fundo_inicial: 50 };
    m.sangrias = [{ id: "s1", valor: 30, motivo: "cofre", registrada_em: new Date().toISOString(), confirmada_em: null }];
    m.rpc.mockResolvedValue({ error: null });
    montar();
    await screen.findByText(/Fundo de troco: R\$\s*50,00/);
    expect(screen.getByText("Aguardando confirmação")).toBeTruthy();
    fireEvent.click(screen.getByText("+ Registrar sangria"));
    fireEvent.change(screen.getByLabelText("Valor da sangria"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Observação da sangria"), { target: { value: "Entregue ao Zé" } });
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("registrar_sangria", { p_turno: "t1", p_valor: 100, p_motivo: "Entregue ao Zé" }));
    fireEvent.click(screen.getByText("Fechar turno", { selector: "button" }));
    expect(screen.queryByText(/esperado:|deveria ter \d/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Total contado"), { target: { value: "" } });
    fireEvent.click(screen.getAllByText("Fechar turno", { selector: "button" })[1]);
    expect((await screen.findByRole("alert")).textContent).toMatch(/quanto você contou/);
    fireEvent.change(screen.getByLabelText("Total contado"), { target: { value: "39,00" } });
    m.turno = null;
    fireEvent.click(screen.getAllByText("Fechar turno", { selector: "button" })[1]);
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("fechar_turno", { p_turno: "t1", p_contado: 39, p_obs: null }));
    await screen.findByText(/Turno fechado/);
    expect(document.body.textContent).not.toMatch(/diferença|esperad/i);
  });

  it("traduz o erro do banco", async () => {
    m.rpc.mockResolvedValue({ error: { message: "TURNO_JA_ABERTO" } });
    montar();
    await screen.findByText("Festa do Padroeiro");
    fireEvent.click(screen.getByText("Abrir turno", { selector: "button" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/já tem um turno aberto/);
  });

  it("outros perfis não entram na tela", () => {
    useAuth.setState({ usuario: { id: "u2", nome: "Zé", organizacaoId: "org1", papel: "conselho" } });
    montar();
    expect(screen.queryByText("Meu turno de caixa")).toBeNull();
  });
  it("sangria com código do Conselho: chama registrar_sangria_codigo; código errado mostra tentativas", async () => {
    m.turno = { id: "t1", evento_id: "ev1", aberto_em: new Date().toISOString(), fundo_inicial: 50 };
    m.rpc.mockResolvedValueOnce({ data: { ok: false, erro: "CODIGO_INVALIDO", restantes: 3 }, error: null });
    montar();
    await screen.findByText(/Fundo de troco/);
    fireEvent.click(screen.getByText("+ Registrar sangria"));
    fireEvent.change(screen.getByLabelText("Valor da sangria"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Código do Conselho"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("registrar_sangria_codigo", { p_turno: "t1", p_valor: 50, p_codigo: "123456", p_motivo: null }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Restam 3 tentativas/);
    expect(m.rpc).not.toHaveBeenCalledWith("registrar_sangria", expect.anything());
  });

  it("código com menos de 6 dígitos é recusado sem chamar o servidor", async () => {
    m.turno = { id: "t1", evento_id: "ev1", aberto_em: new Date().toISOString(), fundo_inicial: 50 };
    montar();
    await screen.findByText(/Fundo de troco/);
    fireEvent.click(screen.getByText("+ Registrar sangria"));
    fireEvent.change(screen.getByLabelText("Valor da sangria"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Código do Conselho"), { target: { value: "123" } });
    fireEvent.click(screen.getByText("Registrar"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/6 dígitos/);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
