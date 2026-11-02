import { supabase } from "./supabase";
import { paraCentavos } from "./dinheiro";
import { urlImagem } from "./imagens";
import type { PagamentoFinal } from "./pagamento";

export interface EventoAtivo { id: string; codigo: string; nome: string; chavePix: string }
export interface ItemCardapio {
  id: string; // evento_produto.id
  nome: string;
  categoria: string;
  ordemCategoria: number;
  valorCentavos: number;
  estoque: number | null; // null = ilimitado
  imagemUrl: string | null;
}

const hojeISO = () => {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};

export async function carregarEventoAtivo(): Promise<EventoAtivo | null> {
  const hoje = hojeISO();
  const { data, error } = await supabase
    .from("eventos").select("id, codigo, nome, chave_pix_id")
    .eq("status", "aberto").lte("data_inicio", hoje).gte("data_fim", hoje)
    .order("padrao", { ascending: false }).order("data_inicio").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const chave = await supabase.from("chaves_pix").select("chave").eq("id", data.chave_pix_id).maybeSingle();
  if (chave.error || !chave.data) throw new Error("Chave Pix do evento não encontrada.");
  return { id: data.id, codigo: data.codigo, nome: data.nome, chavePix: chave.data.chave };
}

interface Linha {
  id: string; valor: string | number; estoque_atual: number | null;
  produtos: { nome: string; imagem_path: string | null; categorias: { nome: string; ordem: number } | null };
}

export async function carregarCardapio(eventoId: string): Promise<ItemCardapio[]> {
  const { data, error } = await supabase
    .from("evento_produto")
    .select("id, valor, estoque_atual, produtos!inner(nome, imagem_path, ativo, categorias(nome, ordem))")
    .eq("evento_id", eventoId).eq("ativo", true).eq("produtos.ativo", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map((r) => ({
    id: r.id,
    nome: r.produtos.nome,
    categoria: r.produtos.categorias?.nome ?? "Outros",
    ordemCategoria: r.produtos.categorias?.ordem ?? 99,
    valorCentavos: paraCentavos(r.valor),
    estoque: r.estoque_atual,
    imagemUrl: urlImagem(r.produtos.imagem_path),
  })).sort((a, b) => a.ordemCategoria - b.ordemCategoria || a.nome.localeCompare(b.nome));
}

export interface ResultadoVenda { numero: number; valor_total: number; troco_total: number; ja_existia: boolean }

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para vender neste evento.",
  EVENTO_FORA_DO_PERIODO: "O evento não está aberto hoje.",
  ITEM_INDISPONIVEL: "Um item não está mais disponível. Volte e atualize o cardápio.",
  ITENS_INVALIDOS: "Há um item inválido na sacola.",
  PAGAMENTO_NAO_FECHA: "Os pagamentos não fecham com o total da venda.",
  PAGAMENTOS_INVALIDOS: "Há um pagamento inválido.",
  PIX_INVALIDO: "Este Pix não confere com a venda (valor ou QR diferente).",
  COMPROVANTE_OBRIGATORIO: "Falta a foto do comprovante do Pix.",
  COMPROVANTE_INVALIDO: "Comprovante inválido. Tire a foto de novo.",
  VENDA_JA_FINALIZADA: "Esta venda já foi finalizada.",
  PARCELAS_DEMAIS: "Quantidade máxima de Pix nesta venda atingida.",
  VALOR_INVALIDO: "Valor inválido.",
};

function erroAmigavel(error: { message?: string; details?: string | null }): Error {
  const msg = error.message ?? "";
  if (msg.includes("ESTOQUE_ESGOTADO")) return new Error(`Esgotado: ${error.details ?? "um item"}. Tire da sacola.`);
  const codigo = Object.keys(MENSAGENS).find((c) => msg.includes(c));
  if (codigo) return new Error(MENSAGENS[codigo]);
  if (/fetch|network/i.test(msg)) return new Error("Sem conexão. Tente de novo: a venda não será duplicada.");
  return new Error("Não foi possível concluir. Tente de novo.");
}

/** Gera uma parte Pix da venda e devolve o TXID (ex.: EVT1V000123A). */
export async function registrarPix(eventoId: string, valorCentavos: number, vendaId: string): Promise<string> {
  const { data, error } = await supabase.rpc("registrar_pix", {
    p_evento_id: eventoId, p_valor: valorCentavos / 100, p_venda_id: vendaId,
  });
  if (error) throw erroAmigavel(error);
  return data as string;
}

/** O cliente NÃO pagou este QR: registra quem confirmou e quando. */
export async function descartarPix(txid: string): Promise<void> {
  const { error } = await supabase.rpc("descartar_pix", { p_txid: txid });
  if (error) throw erroAmigavel(error);
}

export async function finalizarVenda(p: {
  vendaId: string; eventoId: string; itens: { ep: string; q: number }[]; pagamentos: PagamentoFinal[];
}): Promise<ResultadoVenda> {
  const pagamentos = p.pagamentos.map((x) => {
    const valor = x.valorCentavos / 100;
    if (x.forma === "dinheiro") return { forma: x.forma, valor, recebido: (x.recebidoCentavos ?? x.valorCentavos) / 100 };
    if (x.forma === "pix") return { forma: x.forma, valor, txid: x.txid, comprovante: x.comprovante };
    return { forma: x.forma, valor };
  });
  const { data, error } = await supabase.rpc("finalizar_venda", {
    p_venda_id: p.vendaId, p_evento_id: p.eventoId, p_itens: p.itens, p_pagamentos: pagamentos,
  });
  if (error) throw erroAmigavel(error);
  return data as ResultadoVenda;
}
