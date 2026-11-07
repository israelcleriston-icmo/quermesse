import { supabase } from "./supabase";

export interface PixPagamento {
  id: string; valor: number; txid: string; comprovante: string | null; conferidoEm: string | null;
  vendaNumero: number; vendaStatus: string; quando: string; dia: string; caixa: string; vendedorId: string;
}

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Apenas o Conselho ou o administrador conferem o Pix.",
  PROPRIA_VENDA: "Você não pode conferir o Pix de uma venda feita por você. Peça a outra pessoa do Conselho.",
};

const diaBRT = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function carregarPix(eventoId: string): Promise<PixPagamento[]> {
  const { data, error } = await supabase.from("vendas_pagamentos")
    .select("id, valor, txid, comprovante_path, conferido_em, vendas!inner(numero, status, finalizada_em, vendedor_id, evento_id, perfis(nome))")
    .eq("forma", "pix").eq("vendas.evento_id", eventoId);
  if (error) throw new Error("Não foi possível carregar os pagamentos Pix.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id, valor: Number(p.valor), txid: p.txid, comprovante: p.comprovante_path, conferidoEm: p.conferido_em,
    vendaNumero: p.vendas.numero, vendaStatus: p.vendas.status, quando: p.vendas.finalizada_em, dia: diaBRT(p.vendas.finalizada_em),
    caixa: p.vendas.perfis?.nome ?? "—", vendedorId: p.vendas.vendedor_id,
  })).sort((a, b) => a.quando.localeCompare(b.quando));
}

/** Endereços temporários (10 min) das fotos dos comprovantes. */
export async function urlsComprovantes(caminhos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(caminhos)];
  if (unicos.length === 0) return {};
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUrls(unicos, 600);
  if (error) throw new Error("Não foi possível abrir as fotos dos comprovantes.");
  const r: Record<string, string> = {};
  (data ?? []).forEach((d) => { if (d.path && d.signedUrl) r[d.path] = d.signedUrl; });
  return r;
}

export async function marcarConferido(pagamentoId: string, conferido: boolean): Promise<void> {
  const { error } = await supabase.rpc("conferir_pagamento_pix", { p_pagamento: pagamentoId, p_conferido: conferido });
  if (error) {
    const cod = Object.keys(MENSAGENS).find((c) => (error.message ?? "").includes(c));
    throw new Error(cod ? MENSAGENS[cod] : "Não foi possível salvar. Verifique a conexão e tente de novo.");
  }
}

// ---------- Extrato do banco (OFX) ---------------------------------------------
export interface CreditoBanco { id: string; dia: string; centavos: number; nome: string }
export interface ExtratoOfx { inicio: string | null; fim: string | null; creditos: CreditoBanco[] }

const tag = (bloco: string, nome: string) => bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
const dataOfx = (v: string) => (/^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);

/** Lê o OFX (SGML) e devolve só os Pix RECEBIDOS. Tudo acontece no navegador; nada é enviado a servidor. */
export function lerOfx(texto: string): ExtratoOfx {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const creditos: CreditoBanco[] = [];
  for (const b of blocos) {
    const valor = Number(tag(b, "TRNAMT").replace(",", "."));
    const dia = dataOfx(tag(b, "DTPOSTED"));
    if (!dia || !Number.isFinite(valor) || valor <= 0) continue;
    if (!/PIX\s+RECEBIDO/i.test(tag(b, "MEMO"))) continue;          // ignora depósitos, tarifas e pagamentos
    creditos.push({ id: tag(b, "FITID"), dia, centavos: Math.round(valor * 100), nome: tag(b, "NAME").replace(/^Recebimento Pix\s*/i, "") });
  }
  return { inicio: dataOfx(tag(texto, "DTSTART")), fim: dataOfx(tag(texto, "DTEND")), creditos };
}

export async function lerArquivoOfx(arquivo: File): Promise<ExtratoOfx> {
  const buf = await arquivo.arrayBuffer();
  return lerOfx(new TextDecoder("windows-1252").decode(buf));   // OFX de banco brasileiro costuma ser CP1252
}

const dias = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);

export interface Conciliacao {
  casados: { banco: CreditoBanco; pix: PixPagamento }[];
  soBanco: CreditoBanco[];      // entrou no banco e não há venda Pix correspondente
  soSistema: PixPagamento[];    // há venda Pix no sistema e não apareceu no banco
}

/** Casa por valor exato, com tolerância de 1 dia (o banco pode lançar no dia seguinte). Só compara dentro do período do extrato. */
export function conciliar(extrato: ExtratoOfx, pix: PixPagamento[]): Conciliacao {
  const dd = extrato.creditos.map((c) => c.dia).sort();
  const ini = extrato.inicio ?? dd[0];
  const fim = extrato.fim ?? dd[dd.length - 1];
  const noPeriodo = (dia: string) => !!ini && !!fim && dias(dia) >= dias(ini) - 1 && dias(dia) <= dias(fim) + 1;
  const livres = pix.filter((p) => noPeriodo(p.dia));
  const usados = new Set<string>();
  const casados: Conciliacao["casados"] = [];
  const soBanco: CreditoBanco[] = [];
  for (const b of [...extrato.creditos].sort((x, y) => x.dia.localeCompare(y.dia))) {
    let melhor: PixPagamento | null = null;
    let dist = 99;
    for (const p of livres) {
      if (usados.has(p.id) || Math.round(p.valor * 100) !== b.centavos) continue;
      const d = Math.abs(dias(p.dia) - dias(b.dia));
      if (d <= 1 && d < dist) { melhor = p; dist = d; }
    }
    if (melhor) { usados.add(melhor.id); casados.push({ banco: b, pix: melhor }); } else soBanco.push(b);
  }
  return { casados, soBanco, soSistema: livres.filter((p) => !usados.has(p.id)) };
}
