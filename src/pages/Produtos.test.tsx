// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reg = { tabela: string; linha: Record<string, unknown> };
const m = vi.hoisted(() => ({ inserts: [] as Reg[], updates: [] as Reg[], rpcs: [] as { nome: string; args: unknown }[], upload: vi.fn() }));

vi.mock("../lib/supabase", () => {
  const dados: Record<string, unknown[]> = {
    categorias: [{ id: "c1", nome: "Comidas" }],
    eventos: [{ id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro" }],
    produtos: [{ id: "p1", nome: "Coxinha", imagem_path: "generico/coxinha", ativo: true, categoria_id: "c1", categorias: { nome: "Comidas" } }],
    evento_produto: [{ id: "ep1", produto_id: "p1", valor: "5.00", estoque_inicial: 60, estoque_atual: 60 }],
  };
  const consulta = (tabela: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, order: () => q,
      single: async () => ({ data: { id: "novo" }, error: null }),
      insert: (linha: Record<string, unknown>) => { m.inserts.push({ tabela, linha }); return q; },
      update: (linha: Record<string, unknown>) => { m.updates.push({ tabela, linha }); return q; },
      then: (ok: (v: unknown) => void) => ok({ data: dados[tabela] ?? [], error: null }),
    };
    return q;
  };
  return {
    configurado: true,
    supabase: {
      from: consulta,
      rpc: async (nome: string, args: unknown) => { m.rpcs.push({ nome, args }); return { error: null }; },
      storage: { from: () => ({ upload: m.upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `http://x/${p}` } }) }) },
    },
  };
});
vi.mock("../lib/imagem", () => ({ comprimirImagem: async () => new Blob(["x"], { type: "image/jpeg" }) }));

import Produtos from "./Produtos";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Produtos /></MemoryRouter>);
const novoProduto = async () => fireEvent.click(await screen.findByText("+ Novo produto"));
const ins = (t: string) => m.inserts.find((i) => i.tabela === t)?.linha;

describe("cadastro de produtos", () => {
  beforeEach(() => {
    m.inserts.length = 0; m.updates.length = 0; m.rpcs.length = 0; m.upload.mockReset();
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Sec", organizacaoId: "org1", papel: "secretaria" } });
  });
  afterEach(cleanup);

  it("lista os produtos com o preço e o estoque do evento", async () => {
    montar();
    await screen.findByText("Coxinha");
    await screen.findByText(/R\$\s*5,00 · estoque 60/);
  });

  it("novo produto: sugere a foto, pede preço e estoque, salva e inclui no cardápio do evento", async () => {
    montar();
    await novoProduto();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Refrigerante lata" } });
    expect(screen.getByLabelText("Refrigerante").getAttribute("aria-pressed")).toBe("true");     // sugerida
    fireEvent.click(screen.getByLabelText("Suco"));                                               // trocou
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Refrigerante lata 2" } });
    expect(screen.getByLabelText("Suco").getAttribute("aria-pressed")).toBe("true");               // não sobrescreve
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "7,50" } });
    fireEvent.change(screen.getByLabelText("Estoque inicial"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Produto salvo e incluído no cardápio ✓");
    expect(ins("produtos")).toMatchObject({ organizacao_id: "org1", categoria_id: "c1", nome: "Refrigerante lata 2", imagem_path: "generico/suco" });
    expect(ins("evento_produto")).toEqual({ evento_id: "ev1", produto_id: "novo", valor: 7.5, estoque_inicial: 100 });
  });

  it("estoque ilimitado grava estoque_inicial nulo; sem estoque nem ilimitado, pede o dado", async () => {
    montar();
    await novoProduto();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Rifa do carro" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/estoque inicial/);
    expect(m.inserts).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/Estoque ilimitado/));
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText(/incluído no cardápio/);
    expect(ins("evento_produto")).toMatchObject({ valor: 5, estoque_inicial: null });
  });

  it("pede o valor quando o produto entra no cardápio", async () => {
    montar();
    await novoProduto();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Bolo" } });
    fireEvent.click(screen.getByText("Salvar"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/valor/);
  });

  it("editar: abre preenchido, altera nome e preço do evento; remessa de estoque chama a função certa", async () => {
    montar();
    fireEvent.click(await screen.findByText("Editar"));
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Coxinha");
    expect((screen.getByLabelText("Valor") as HTMLInputElement).value).toBe("5,00");
    expect(screen.getByText(/Estoque atual: 60/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Coxinha de frango" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "5,50" } });
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Produto atualizado ✓");
    expect(m.updates.find((u) => u.tabela === "produtos")!.linha).toMatchObject({ nome: "Coxinha de frango", categoria_id: "c1" });
    expect(m.updates.find((u) => u.tabela === "evento_produto")!.linha).toMatchObject({ valor: 5.5 });

    fireEvent.click(await screen.findByText("Editar"));
    fireEvent.change(screen.getByLabelText("Remessa"), { target: { value: "50" } });
    fireEvent.click(screen.getByText("+ Remessa"));
    await screen.findByText("Remessa de 50 adicionada ✓");
    expect(m.rpcs).toEqual([{ nome: "adicionar_remessa", args: { p_evento_produto_id: "ep1", p_qtd: 50 } }]);
  });

  it("upload de foto própria vira o caminho no Storage", async () => {
    m.upload.mockResolvedValue({ error: null });
    montar();
    await novoProduto();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Bolo da Maria" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Estoque inicial"), { target: { value: "10" } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(m.upload).toHaveBeenCalled());
    expect(m.upload.mock.calls[0][0]).toMatch(/^org1\/.+\.jpg$/);
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(ins("produtos")).toBeTruthy());
    expect(String(ins("produtos")!.imagem_path)).toMatch(/^org1\/.+\.jpg$/);
  });
});
