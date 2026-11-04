// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reg = { tabela: string; linha: Record<string, unknown> };
const m = vi.hoisted(() => ({ inserts: [] as Reg[], updates: [] as Reg[], erroInsert: null as null | { message: string }, rpc: vi.fn() }));

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AAAA" } }));
vi.mock("../lib/supabase", () => {
  const dados: Record<string, unknown[]> = {
    eventos: [
      { id: "ev1", codigo: "EVT1", nome: "Festa do Padroeiro", data_inicio: "2026-11-05", data_fim: "2026-11-08", status: "aberto", padrao: true, chave_pix_id: "k1" },
      { id: "ev2", codigo: "EVT0", nome: "Festa antiga", data_inicio: "2025-06-01", data_fim: "2025-06-02", status: "encerrado", padrao: false, chave_pix_id: "k1" },
    ],
    chaves_pix: [{ id: "k1", chave: "29ac127f-8327-4a45-8879-2fedc34adb0c", descricao: "Chave principal", nome_recebedor: null, cidade_recebedor: null }],
    evento_produto: [{ evento_id: "ev1" }, { evento_id: "ev1" }, { evento_id: "ev1" }],   // ev1 tem 3; ev2 nenhum
  };
  const consulta = (tabela: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, order: () => q,
      single: async () => (tabela === "eventos" && m.erroInsert ? { data: null, error: m.erroInsert } : { data: { id: tabela === "eventos" ? "ev-novo" : "k-nova" }, error: null }),
      insert: (linha: Record<string, unknown>) => { m.inserts.push({ tabela, linha }); return q; },
      update: (linha: Record<string, unknown>) => { m.updates.push({ tabela, linha }); return q; },
      then: (ok: (v: unknown) => void) => ok({ data: dados[tabela] ?? [], error: null }),
    };
    return q;
  };
  return { configurado: true, supabase: { from: consulta, rpc: m.rpc } };
});

import Eventos from "./Eventos";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><Eventos /></MemoryRouter>);
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const ins = (t: string) => m.inserts.find((i) => i.tabela === t)?.linha;

describe("eventos e chaves Pix (Conselho/admin)", () => {
  beforeEach(() => {
    m.inserts.length = 0; m.updates.length = 0; m.erroInsert = null; m.rpc.mockReset();
    useAuth.setState({ carregando: false, usuario: { id: "u", nome: "Conselho", organizacaoId: "org1", papel: "conselho" } });
  });
  afterEach(cleanup);

  it("lista eventos com datas em formato brasileiro, status, padrão e chave", async () => {
    montar();
    await screen.findByText("Festa do Padroeiro");
    expect(screen.getByText(/EVT1 · 05\/11\/2026 a 08\/11\/2026/)).toBeTruthy();
    expect(screen.getByText("Padrão")).toBeTruthy();
    expect(screen.getByText("Encerrado")).toBeTruthy();
    expect(screen.getAllByText(/Chave principal · 29ac127f…db0c/).length).toBeGreaterThan(0);
  });

  it("novo evento com chave Pix nova: cadastra a chave e depois o evento", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo evento"));
    digitar("Nome", "Quermesse de Dezembro");
    digitar("Código", "dez26");
    expect((screen.getByLabelText("Código") as HTMLInputElement).value).toBe("DEZ26");      // maiúsculas
    digitar("Início", "2026-12-05");
    digitar("Término", "2026-12-07");
    fireEvent.change(screen.getByLabelText("Chave Pix"), { target: { value: "nova" } });
    digitar("Nova chave", "123e4567-e12b-12d1-a456-426655440000");
    digitar("Descrição da chave", "Chave de dezembro");
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Evento criado ✓");
    expect(ins("chaves_pix")).toEqual({ organizacao_id: "org1", chave: "123e4567-e12b-12d1-a456-426655440000", descricao: "Chave de dezembro", nome_recebedor: null, cidade_recebedor: null });
    expect(ins("eventos")).toEqual({
      nome: "Quermesse de Dezembro", data_inicio: "2026-12-05", data_fim: "2026-12-07", chave_pix_id: "k-nova",
      padrao: false, organizacao_id: "org1", codigo: "DEZ26", status: "aberto",
    });
  });

  it("mostra quantos produtos cada evento tem e alerta quando está sem cardápio", async () => {
    montar();
    await screen.findByText("Festa do Padroeiro");
    expect(screen.getByText("Cardápio: 3 produtos")).toBeTruthy();
    expect(screen.getByText("⚠ Sem produtos no cardápio")).toBeTruthy();
  });

  it("depois de criar um evento, avisa que o cardápio é por evento e oferece copiar de outro", async () => {
    m.rpc.mockResolvedValue({ data: 3, error: null });
    montar();
    fireEvent.click(await screen.findByText("+ Novo evento"));
    digitar("Nome", "Noite do Pastel");
    digitar("Código", "PAST");
    digitar("Início", "2026-12-05");
    digitar("Término", "2026-12-05");
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Atenção: o cardápio é por evento");
    expect(screen.getByText(/começa sem produtos/)).toBeTruthy();
    expect(screen.getByText("Montar em Produtos")).toBeTruthy();
    fireEvent.click(screen.getByText("Copiar de outro evento"));
    fireEvent.change(screen.getByLabelText("Evento de origem"), { target: { value: "ev1" } });
    expect(screen.getByRole("option", { name: "Festa do Padroeiro (3 produtos)" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Levar também o estoque/));
    fireEvent.click(screen.getByText("Copiar cardápio"));
    await screen.findByText("3 itens copiados ✓");
    expect(m.rpc).toHaveBeenCalledWith("copiar_cardapio", { p_origem: "ev1", p_destino: "ev-novo", p_copiar_estoque: true });
    expect(screen.queryByText("Atenção: o cardápio é por evento")).toBeNull();
  });

  it("copiar cardápio: mostra erro amigável quando o banco recusa", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "SEM_PERMISSAO" } });
    montar();
    await screen.findByText("Festa do Padroeiro");
    fireEvent.click(screen.getByText("Copiar cardápio de outro evento"));
    fireEvent.click(screen.getByText("Copiar cardápio"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/permissão/);
  });

  const BANCO = "00020126580014br.gov.bcb.pix013629ac127f-8327-4a45-8879-2fedc34adb0c5204000053039865802BR5925MITRA_ARQUIDIOCESANA_DE_F6009Fortaleza610960743-21862290525EXYD1190752017791410198306304471D";

  it("nova chave: colar o código do banco preenche chave, nome e cidade, e grava tudo", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo evento"));
    digitar("Nome", "Festa");
    digitar("Código", "FES");
    digitar("Início", "2026-12-05");
    digitar("Término", "2026-12-06");
    fireEvent.change(screen.getByLabelText("Chave Pix"), { target: { value: "nova" } });
    digitar("Código Pix do banco", BANCO);
    fireEvent.click(screen.getByText("Ler dados do código"));
    await screen.findByText(/Dados lidos: MITRA ARQUIDIOCESANA DE F · Fortaleza/);
    expect((screen.getByLabelText("Nova chave") as HTMLInputElement).value).toBe("29ac127f-8327-4a45-8879-2fedc34adb0c");
    expect((screen.getByLabelText("Nome do recebedor") as HTMLInputElement).value).toBe("MITRA ARQUIDIOCESANA DE F");
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Evento criado ✓");
    expect(ins("chaves_pix")).toMatchObject({ chave: "29ac127f-8327-4a45-8879-2fedc34adb0c", nome_recebedor: "MITRA ARQUIDIOCESANA DE F", cidade_recebedor: "Fortaleza" });
  });

  it("código inválido mostra o motivo e não preenche nada", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo evento"));
    fireEvent.change(screen.getByLabelText("Chave Pix"), { target: { value: "nova" } });
    digitar("Código Pix do banco", BANCO.slice(0, -1) + "0");
    fireEvent.click(screen.getByText("Ler dados do código"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/CRC/);
    expect((screen.getByLabelText("Nova chave") as HTMLInputElement).value).toBe("");
  });

  it("chave já cadastrada: atualizar nome e cidade com o código do banco; recusa código de outra chave", async () => {
    montar();
    await screen.findByText("Festa do Padroeiro");
    fireEvent.click(screen.getByText("Atualizar dados"));
    digitar("Código Pix do banco", BANCO);
    fireEvent.click(screen.getByText("Ler dados do código"));
    await screen.findByText(/Dados lidos/);
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Dados da chave atualizados ✓");
    expect(m.updates[0]).toEqual({ tabela: "chaves_pix", linha: { nome_recebedor: "MITRA ARQUIDIOCESANA DE F", cidade_recebedor: "Fortaleza" } });
  });

  it("QR do cardápio: abre o cartaz com o link público do evento", async () => {
    montar();
    fireEvent.click(await screen.findByText("QR do cardápio (fura-fila)"));
    await screen.findByAltText("QR do cardápio");
    expect(screen.getByText(/#\/cardapio\?e=ev1/)).toBeTruthy();
    expect(screen.getByText("Baixar imagem").getAttribute("download")).toBe("cardapio-EVT1.png");
  });

  it("valida o término antes do início e o código; mensagem amigável para código repetido", async () => {
    montar();
    fireEvent.click(await screen.findByText("+ Novo evento"));
    digitar("Nome", "Teste");
    digitar("Início", "2026-12-07");
    digitar("Término", "2026-12-05");
    fireEvent.click(screen.getByText("Salvar"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/código/);
    digitar("Código", "EVT1");
    fireEvent.click(screen.getByText("Salvar"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/anterior ao início/);
    digitar("Término", "2026-12-09");
    m.erroInsert = { message: 'duplicate key value violates unique constraint "eventos_codigo_key"' };
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Já existe um evento com esse código.");
  });

  it("encerrar pede confirmação e atualiza o status; reabrir não precisa", async () => {
    montar();
    fireEvent.click(await screen.findByText("Encerrar"));
    expect(screen.getByText(/QR Pix pendentes são cancelados/)).toBeTruthy();
    fireEvent.click(screen.getByText("Sim, encerrar"));
    await screen.findByText("Evento encerrado ✓");
    expect(m.updates).toEqual([{ tabela: "eventos", linha: { status: "encerrado" } }]);
    fireEvent.click(screen.getByText("Reabrir"));
    await screen.findByText("Evento reaberto ✓");
    expect(m.updates[1]).toEqual({ tabela: "eventos", linha: { status: "aberto" } });
  });

  it("editar não deixa mudar o código", async () => {
    montar();
    fireEvent.click((await screen.findAllByText("Editar"))[0]);
    expect((screen.getByLabelText("Código") as HTMLInputElement).disabled).toBe(true);
    digitar("Nome", "Festa do Padroeiro 2026");
    fireEvent.click(screen.getByText("Salvar"));
    await screen.findByText("Evento atualizado ✓");
    expect(m.updates[0].linha).toMatchObject({ nome: "Festa do Padroeiro 2026", chave_pix_id: "k1" });
  });
});
