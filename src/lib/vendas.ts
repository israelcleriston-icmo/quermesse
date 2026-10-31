import { supabase } from "./supabase";
import { paraCentavos } from "./dinheiro";

export interface EventoAtivo { id: string; codigo: string; nome: string }
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
    .from("eventos").select("id, codigo, nome")
    .eq("status", "aberto").lte("data_inicio", hoje).gte("data_fim", hoje)
    .order("padrao", { ascending: false }).order("data_inicio").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, codigo: data.codigo, nome: data.nome } : null;
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
    imagemUrl: r.produtos.imagem_path
      ? supabase.storage.from("produtos").getPublicUrl(r.produtos.imagem_path).data.publicUrl
      : null,
  })).sort((a, b) => a.ordemCategoria - b.ordemCategoria || a.nome.localeCompare(b.nome));
}

export interface ResultadoVenda { numero: number; valor_total: number; ja_existia: boolean }

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para vender neste evento.",
  EVENTO_FORA_DO_PERIODO: "O evento não está aberto hoje.",
  ITEM_INDISPONIVEL: "Um item não está mais disponível. Volte e atualize o cardápio.",
  ITENS_INVALIDOS: "Há um item inválido na sacola.",
  TOTAL_INVALIDO: "O total da venda é inválido.",
};

export async function finalizarVenda(p: {
  vendaId: string; eventoId: string; forma: "dinheiro" | "cartao"; itens: { ep: string; q: number }[];
}): Promise<ResultadoVenda> {
  const { data, error } = await supabase.rpc("finalizar_venda", {
    p_venda_id: p.vendaId, p_evento_id: p.eventoId, p_forma: p.forma, p_itens: p.itens,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("ESTOQUE_ESGOTADO")) throw new Error(`Esgotado: ${error.details ?? "um item"}. Tire da sacola.`);
    const codigo = Object.keys(MENSAGENS).find((c) => msg.includes(c));
    if (codigo) throw new Error(MENSAGENS[codigo]);
    if (/fetch|network/i.test(msg)) throw new Error("Sem conexão. Tente de novo: a venda não será duplicada.");
    throw new Error("Não foi possível finalizar. Tente de novo.");
  }
  return data as ResultadoVenda;
}
