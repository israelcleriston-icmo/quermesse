// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inserts: [] as { tabela: string; linha: Record<string, unknown> }[], upload: vi.fn() }));

vi.mock("../lib/supabase", () => {
  const dados: Record<string, unknown[]> = {
    categorias: [{ id: "c1", nome: "Comidas" }],
    produtos: [{ id: "p1", nome: "Coxinha", imagem_path: "generico/coxinha", ativo: true, categorias: { nome: "Comidas" } }],
  };
  const consulta = (tabela: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, order: () => q, single: async () => ({ data: { id: "novo" }, error: null }),
      insert: (linha: Record<string, unknown>) => { m.inserts.push({ tabela, linha }); return q; },
      update: () => q,
      then: (ok: (v: unknown) => void) => ok({ data: dados[tabela] ?? [], error: null }),
    };
    return q;
  };
  return { configurado: true, supabase: { from: consulta, storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `http://x/${p}` } }) }) } } };
});
vi.mock("../lib/imagem", () => ({ comprimirImagem: async () => new Blob(["x"], { type: "image/jpeg" }) }));

import Produtos from "./Produtos";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Produtos /></MemoryRouter>);

describe("cadastro de produtos", () => {
  beforeEach(() => {
    m.inserts.length = 0;
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Sec", organizacaoId: "org1", papel: "secretaria" } });
  });
  afterEach(cleanup);

  it("lista os produtos existentes", async () => {
    montar();
    await screen.findByText("Coxinha");
  });

  it("sugere a foto pelo nome; usuário pode trocar; salva com a imagem escolhida", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo produto"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Refrigerante lata" } });
    expect(screen.getByLabelText("Refrigerante").getAttribute("aria-pressed")).toBe("true");   // sugerida
    expect(screen.getByText(/sugerida pelo nome/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Suco"));                                           // trocou
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Refrigerante lata 2" } });
    expect(screen.getByLabelText("Suco").getAttribute("aria-pressed")).toBe("true");           // não sobrescreve
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(m.inserts.some((i) => i.tabela === "produtos")).toBe(true));
    expect(m.inserts.find((i) => i.tabela === "produtos")!.linha).toMatchObject({
      organizacao_id: "org1", categoria_id: "c1", nome: "Refrigerante lata 2", imagem_path: "generico/suco",
    });
  });

  it("upload de foto própria vira o caminho no Storage", async () => {
    m.upload.mockResolvedValue({ error: null });
    montar();
    fireEvent.click(await screen.findByText("+ Novo produto"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Bolo da Maria" } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(m.upload).toHaveBeenCalled());
    expect(m.upload.mock.calls[0][0]).toMatch(/^org1\/.+\.jpg$/);
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(m.inserts.some((i) => i.tabela === "produtos")).toBe(true));
    expect(String(m.inserts.find((i) => i.tabela === "produtos")!.linha.imagem_path)).toMatch(/^org1\/.+\.jpg$/);
  });
});
