// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ signIn: vi.fn(), update: vi.fn(), getUser: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  configurado: true,
  supabase: { auth: { signInWithPassword: m.signIn, updateUser: m.update, getUser: m.getUser, signOut: vi.fn() } },
}));

import TrocarSenha from "./TrocarSenha";
import Protegida from "../components/Protegida";
import { useAuth } from "../store/auth";

const montar = () => render(
  <MemoryRouter initialEntries={["/trocar-senha"]}>
    <Routes>
      <Route path="/trocar-senha" element={<Protegida permitirTroca><TrocarSenha /></Protegida>} />
      <Route path="/" element={<p>INICIO</p>} />
    </Routes>
  </MemoryRouter>,
);
const digitar = (r: string, v: string) => fireEvent.change(screen.getByLabelText(r), { target: { value: v } });

describe("troca de senha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getUser.mockResolvedValue({ data: { user: { email: "52998224725@cpf.quermesse.app.br" } } });
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Maria", organizacaoId: "o", papel: "caixa", deveTrocarSenha: true } });
  });
  afterEach(cleanup);

  it("senha temporária: avisa, valida e troca; depois segue para o início", async () => {
    m.signIn.mockResolvedValue({ error: null });
    m.update.mockResolvedValue({ error: null });
    montar();
    expect(screen.getByText(/senha é temporária/)).toBeTruthy();
    digitar("Senha atual", "temporaria-9");
    digitar("Nova senha", "curta");
    digitar("Confirmar nova senha", "curta");
    fireEvent.click(screen.getByText("Salvar nova senha"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/pelo menos 8/);
    expect(m.update).not.toHaveBeenCalled();
    digitar("Nova senha", "senha-nova-1");
    digitar("Confirmar nova senha", "senha-nova-1");
    fireEvent.click(screen.getByText("Salvar nova senha"));
    await screen.findByText("INICIO");
    expect(m.update).toHaveBeenCalledWith({ password: "senha-nova-1", data: { deve_trocar_senha: false } });
    expect(useAuth.getState().usuario?.deveTrocarSenha).toBe(false);
  });

  it("senha atual errada: mostra o erro e não troca", async () => {
    m.signIn.mockResolvedValue({ error: { name: "AuthApiError", message: "Invalid login" } });
    montar();
    digitar("Senha atual", "errada-123");
    digitar("Nova senha", "senha-nova-1");
    digitar("Confirmar nova senha", "senha-nova-1");
    fireEvent.click(screen.getByText("Salvar nova senha"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/senha atual está incorreta/));
    expect(m.update).not.toHaveBeenCalled();
  });

  it("quem deve trocar a senha é levado para cá ao abrir qualquer tela protegida", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Protegida><p>INICIO</p></Protegida>} />
          <Route path="/trocar-senha" element={<p>TELA DE TROCA</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("TELA DE TROCA")).toBeTruthy();
  });
});
