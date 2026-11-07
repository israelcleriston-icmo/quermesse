import { supabase } from "./supabase";

export interface ItemVenda { id: string; nome: string; quantidade: number; quantidade_anulada: number; valor_unitario: number; evento_produto_id: string | null }
export interface PagamentoVenda { forma: string; valor: number }
export interface VendaLista {
  id: string; numero: number; vendedor: string; vendedorId: string; valor_total: number; status: "finalizada" | "parcialmente_anulada" | "anulada";
  finalizada_em: string; itens: ItemVenda[]; pagamentos: PagamentoVenda[]; devolvido: PagamentoVenda[];
}

export const ROTULO_FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" };

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Apenas o Conselho ou o administrador anulam vendas.",
  PROPRIA_VENDA: "Você não pode anular uma venda feita por você mesmo. Peça a outra pessoa do Conselho.",
  VENDA_ANULADA: "Esta venda já foi totalmente anulada.",
  VENDA_INEXISTENTE: "Venda não encontrada.",
  MOTIVO_OBRIGATORIO: "Escreva o motivo da anulação (pelo menos 5 letras).",
  QUANTIDADE_INVALIDA: "Quantidade inválida para algum item.",
  ESTORNO_INVALIDO: "A devolução não confere: a soma deve ser igual ao valor anulado e cada forma não pode passar do que foi pago.",
};

const num = (v: unknown) => Number(v ?? 0);

export async function carregarVendas(eventoId: string): Promise<VendaLista[]> {
  const { data, error } = await supabase.from("vendas")
    .select("id, numero, vendedor_id, valor_total, status, finalizada_em, perfis(nome), vendas_itens(id, nome, quantidade, quantidade_anulada, valor_unitario, evento_produto_id), vendas_pagamentos(forma, valor), anulacoes(anulacoes_estornos(forma, valor))")
    .eq("evento_id", eventoId).order("numero", { ascending: false }).limit(300);
  if (error) throw new Error("Não foi possível carregar as vendas.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((v) => ({
    id: v.id, numero: v.numero, vendedorId: v.vendedor_id, vendedor: v.perfis?.nome ?? "—", valor_total: num(v.valor_total), status: v.status,
    finalizada_em: v.finalizada_em,
    itens: (v.vendas_itens ?? []).map((i: Record<string, unknown>) => ({ ...i, valor_unitario: num(i.valor_unitario) })) as ItemVenda[],
    pagamentos: (v.vendas_pagamentos ?? []).map((p: Record<string, unknown>) => ({ forma: p.forma as string, valor: num(p.valor) })),
    devolvido: (v.anulacoes ?? []).flatMap((a: { anulacoes_estornos?: { forma: string; valor: unknown }[] }) => (a.anulacoes_estornos ?? []).map((e) => ({ forma: e.forma, valor: num(e.valor) }))),
  }));
}

/** Quanto ainda pode ser devolvido em cada forma (pago − já devolvido), em centavos. */
export function disponivelPorForma(v: Pick<VendaLista, "pagamentos" | "devolvido">): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of v.pagamentos) r[p.forma] = (r[p.forma] ?? 0) + Math.round(p.valor * 100);
  for (const d of v.devolvido) r[d.forma] = (r[d.forma] ?? 0) - Math.round(d.valor * 100);
  return r;
}

/** Sugestão de devolução: primeiro no dinheiro, depois nas demais formas, até cobrir o valor. */
export function sugerirEstornos(disponivel: Record<string, number>, valorCentavos: number): Record<string, number> {
  const ordem = ["dinheiro", ...Object.keys(disponivel).filter((f) => f !== "dinheiro")];
  const r: Record<string, number> = {};
  let falta = valorCentavos;
  for (const f of ordem) {
    const usar = Math.min(Math.max(disponivel[f] ?? 0, 0), falta);
    if (usar > 0) { r[f] = usar; falta -= usar; }
  }
  return r;
}

export async function anularVenda(p: {
  vendaId: string; itens: { item: string; q: number }[] | null; estornosCentavos: Record<string, number>; motivo: string; devolverEstoque: boolean;
}): Promise<void> {
  const estornos = Object.entries(p.estornosCentavos).filter(([, c]) => c > 0).map(([forma, c]) => ({ forma, valor: c / 100 }));
  const { error } = await supabase.rpc("anular_venda", {
    p_venda: p.vendaId, p_itens: p.itens, p_estornos: estornos, p_motivo: p.motivo.trim(), p_devolver_estoque: p.devolverEstoque,
  });
  if (error) {
    const cod = Object.keys(MENSAGENS).find((c) => (error.message ?? "").includes(c));
    throw new Error(cod ? MENSAGENS[cod] : "Não foi possível anular. Verifique a conexão e tente de novo.");
  }
}
