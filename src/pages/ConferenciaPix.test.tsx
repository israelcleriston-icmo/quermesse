// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabase", () => {
  const linhas = [
    { id: "p1", valor: 12, txid: "T1", comprovante_path: "ev/u/a.jpg", conferido_em: null, vendas: { numero: 5, status: "finalizada", finalizada_em: "2026-11-03T15:00:00Z", vendedor_id: "cx", evento_id: "ev1", perfis: { nome: "Maria Caixa" } } },
    { id: "p2", valor: 8, txid: "T2", comprovante_path: "ev/u/b.jpg", conferido_em: "2026-11-04T10:00:00Z", vendas: { numero: 6, status: "finalizada", finalizada_em: "2026-11-03T16:00:00Z", vendedor_id: "con", evento_id: "ev1", perfis: { nome: "Conselheiro" } } },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consulta = (tabela: string): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { select: () => q, order: () => q, eq: () => q,
      then: (ok: (v: unknown) => void) => ok({ data: tabela === "eventos" ? [{ id: "ev1", nome: "Festa do Padroeiro" }] : linhas, error: null }) };
    return q;
  };
  return { configurado: true, supabase: { from: consulta, rpc: m.rpc,
    storage: { from: () => ({ createSignedUrls: async (c: string[]) => ({ data: c.map((p) => ({ path: p, signedUrl: "http://x/" + p })), error: null }) }) } } };
});

import ConferenciaPix from "./ConferenciaPix";
import { useAuth } from "../store/auth";

const montar = () => render(<MemoryRouter><ConferenciaPix /></MemoryRouter>);

describe("conferir Pix (Conselho)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.rpc.mockResolvedValue({ error: null });
    useAuth.setState({ carregando: false, usuario: { id: "con", nome: "Conselheiro", organizacaoId: "org1", papel: "conselho" } });
  });
  afterEach(cleanup);

  it("mostra a foto do comprovante, amplia e marca como conferido", async () => {
    montar();
    await screen.findByAltText("Comprovante da venda 5");
    expect(screen.getByText(/2 Pix/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Ampliar comprovante da venda 5"));
    expect(screen.getByRole("dialog", { name: "Comprovante ampliado" })).toBeTruthy();
    fireEvent.click(screen.getByText("Fechar"));
    fireEvent.click(screen.getByText("Marcar como conferido"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("conferir_pagamento_pix", { p_pagamento: "p1", p_conferido: true }));
  });

  it("por padrão só os pendentes; a venda do próprio usuário não oferece conferir", async () => {
    montar();
    await screen.findByAltText("Comprovante da venda 5");
    expect(screen.queryByAltText("Comprovante da venda 6")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filtro"), { target: { value: "todos" } });
    await screen.findByAltText("Comprovante da venda 6");
    expect(screen.getByText(/Venda sua: outra pessoa confere/)).toBeTruthy();
  });

  it("extrato OFX: lê o arquivo e lista o que só existe de um lado", async () => {
    montar();
    await screen.findByAltText("Comprovante da venda 5");
    fireEvent.click(screen.getByText("Extrato do banco"));
    const ofx = "<OFX><DTSTART>20261101120000</DTSTART><DTEND>20261105120000</DTEND><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103120000<TRNAMT>12.00<FITID>1<MEMO>PIX RECEBIDO - OUTRA IF<NAME>Recebimento Pix FULANO</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103120000<TRNAMT>99.00<FITID>2<MEMO>PIX RECEBIDO - OUTRA IF<NAME>Recebimento Pix SICRANO</STMTTRN></OFX>";
    const arquivo = new File([ofx], "extrato.ofx");
    Object.defineProperty(arquivo, "arrayBuffer", { value: async () => new TextEncoder().encode(ofx).buffer });
    fireEvent.change(screen.getByLabelText("Arquivo OFX"), { target: { files: [arquivo] } });
    await screen.findByText(/Casados: 1 · Só no banco: 1 · Só no sistema: 1/);
    expect(screen.getByText(/SICRANO/)).toBeTruthy();
  });

  it("caixa não entra", () => {
    useAuth.setState({ usuario: { id: "x", nome: "Caixa", organizacaoId: "org1", papel: "caixa" } });
    montar();
    expect(screen.queryByText("Conferir Pix")).toBeNull();
  });
});
