// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ configurado: true, supabase: { rpc: m.rpc, auth: { signOut: async () => ({}) } } }));

import Inicio from "./Inicio";
import { useAuth } from "../store/auth";
import { useSacola } from "../store/sacola";

const montar = () => render(<MemoryRouter><Inicio /></MemoryRouter>);

describe("troca de perfil na tela inicial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSacola.getState().limpar();
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Maria Souza", organizacaoId: "org1", papel: "caixa", papeis: ["caixa", "conselho"] } });
  });
  afterEach(cleanup);

  it("quem tem dois perfis troca; o menu muda e o banco é avisado", async () => {
    m.rpc.mockResolvedValue({ error: null });
    montar();
    expect(screen.getByText("Abrir caixa")).toBeTruthy();
    expect(screen.queryByText("Eventos e chaves Pix")).toBeNull();
    fireEvent.change(screen.getByLabelText("Trocar perfil"), { target: { value: "conselho" } });
    await screen.findByText("Eventos e chaves Pix");
    expect(screen.queryByText("Abrir caixa")).toBeNull();
    expect(m.rpc).toHaveBeenCalledWith("trocar_papel", { p_organizacao: "org1", p_papel: "conselho" });
  });

  it("quem tem um perfil só não vê a troca", () => {
    useAuth.setState({ usuario: { id: "u", nome: "João", organizacaoId: "org1", papel: "caixa", papeis: ["caixa"] } });
    montar();
    expect(screen.queryByLabelText("Trocar perfil")).toBeNull();
  });

  it("se o banco recusa, mostra o erro e continua no perfil de antes", async () => {
    m.rpc.mockResolvedValue({ error: { message: "PAPEL_NAO_PERMITIDO" } });
    montar();
    fireEvent.change(screen.getByLabelText("Trocar perfil"), { target: { value: "conselho" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/não está liberado/));
    expect(useAuth.getState().usuario?.papel).toBe("caixa");
  });

  it("com venda em andamento pede confirmação e descarta a sacola ao trocar", async () => {
    m.rpc.mockResolvedValue({ error: null });
    useSacola.getState().adicionar({ id: "p", nome: "Pastel", valorCentavos: 800, max: null });
    const conf = vi.spyOn(window, "confirm").mockReturnValue(false);
    montar();
    fireEvent.change(screen.getByLabelText("Trocar perfil"), { target: { value: "conselho" } });
    expect(conf).toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();                                     // recusou: nada muda
    expect(Object.keys(useSacola.getState().linhas)).toHaveLength(1);
    conf.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Trocar perfil"), { target: { value: "conselho" } });
    await waitFor(() => expect(Object.keys(useSacola.getState().linhas)).toHaveLength(0));
    conf.mockRestore();
  });
});
