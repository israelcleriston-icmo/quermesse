// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));

vi.mock("../lib/supabase", () => {
  const membros = [
    { usuario_id: "u-adm", papel: "admin", ativo: true, perfis: { nome: "Admin de Teste", cpf: "52998224725" } },
    { usuario_id: "u-cx", papel: "caixa", ativo: true, perfis: { nome: "Caixa de Teste", cpf: "11144477735" } },
    { usuario_id: "u-off", papel: "secretaria", ativo: false, perfis: { nome: "Antiga Secretaria", cpf: "39053344705" } },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = { select: () => q, eq: () => q, then: (ok: (v: unknown) => void) => ok({ data: membros, error: null }) };
  return { configurado: true, supabase: { from: () => q, rpc: m.rpc, functions: { invoke: m.invoke } } };
});

import Usuarios from "./Usuarios";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Usuarios /></MemoryRouter>);
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe("gestão de usuários (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({ carregando: false, usuario: { id: "u-adm", nome: "Admin de Teste", organizacaoId: "org1", papel: "admin" } });
  });
  afterEach(cleanup);

  it("lista com CPF mascarado, perfil e situação; não oferece alterar a si mesmo", async () => {
    montar();
    await screen.findByText("Caixa de Teste");
    expect(screen.getByText(/\*\*\*\.\*\*\*\.777-35 · Caixa/)).toBeTruthy();
    expect(screen.getByText(/desativado/)).toBeTruthy();
    expect(screen.queryByText("11144477735")).toBeNull();                  // CPF completo nunca aparece
    expect(screen.getAllByText("Alterar")).toHaveLength(2);                 // caixa e secretaria; o admin (você) não
  });

  it("cria usuário pela função e mostra confirmação", async () => {
    m.invoke.mockResolvedValue({ data: { id: "novo", nome: "Maria", papel: "caixa" }, error: null });
    montar();
    fireEvent.click(await screen.findByText("+ Novo usuário"));
    digitar("Nome", "Maria Silva");
    digitar("CPF", "52998224725");
    digitar("Senha inicial (mínimo 8 caracteres)", "senhaforte1");
    fireEvent.click(screen.getByText("Criar usuário"));
    await screen.findByText("Usuário criado ✓");
    expect(m.invoke).toHaveBeenCalledWith("criar-usuario", {
      body: { organizacao_id: "org1", nome: "Maria Silva", cpf: "52998224725", senha: "senhaforte1", papel: "caixa" },
    });
  });

  it("valida CPF e senha antes de chamar a função; mostra o erro devolvido por ela", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo usuário"));
    digitar("Nome", "Maria");
    digitar("CPF", "11111111111");
    fireEvent.click(screen.getByText("Criar usuário"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/CPF inválido/);
    digitar("CPF", "52998224725");
    digitar("Senha inicial (mínimo 8 caracteres)", "curta");
    fireEvent.click(screen.getByText("Criar usuário"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/pelo menos 8/));
    expect(m.invoke).not.toHaveBeenCalled();

    m.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ mensagem: "Já existe um usuário com este CPF." }) } } });
    digitar("Senha inicial (mínimo 8 caracteres)", "senhaforte1");
    fireEvent.click(screen.getByText("Criar usuário"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Já existe um usuário com este CPF/));
  });

  it("troca o perfil e desativa pelo banco", async () => {
    m.rpc.mockResolvedValue({ error: null });
    montar();
    await screen.findByText("Caixa de Teste");
    fireEvent.click(screen.getAllByText("Alterar")[0]);
    fireEvent.change(screen.getByLabelText("Perfil"), { target: { value: "conselho" } });
    fireEvent.click(screen.getByLabelText(/Usuário ativo/));
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Usuário atualizado ✓");
    expect(m.rpc).toHaveBeenCalledWith("alterar_membro", { p_usuario: "u-cx", p_organizacao: "org1", p_papel: "conselho", p_ativo: false });
  });

  it("quem não é admin é redirecionado", () => {
    useAuth.setState({ usuario: { id: "u", nome: "Sec", organizacaoId: "org1", papel: "secretaria" } });
    const { container } = montar();
    expect(container.textContent).not.toMatch(/Novo usuário/);
  });
});
