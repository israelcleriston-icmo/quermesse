import { supabase } from "./supabase";

export interface Relatorio {
  evento: { id: string; codigo: string; nome: string; status: string };
  gerado_em: string;
  resumo: { vendas: number; anuladas: number; parciais: number; cortesias: number; bruto: number; devolvido: number; liquido: number };
  por_forma: { forma: string; vendido: number; devolvido: number; liquido: number }[];
  por_produto: { nome: string; quantidade: number; faturamento: number }[];
  por_caixa: { caixa: string; vendas: number; liquido: number }[];
  por_dia: { dia: string; vendas: number; liquido: number }[];
  anulacoes: { numero: number; valor: number; motivo: string; por: string; em: string }[];
  sangrias: { total: number; pendentes: number };
  turnos: { total: number; abertos: number; sem_conferir: number };
}

export const ROTULO_FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" };

export async function carregarRelatorio(eventoId: string): Promise<Relatorio> {
  const { data, error } = await supabase.rpc("relatorio_evento", { p_evento: eventoId });
  if (error || !data) throw new Error((error?.message ?? "").includes("SEM_PERMISSAO")
    ? "Apenas o Conselho ou o administrador veem o relatório." : "Não foi possível carregar o relatório. Verifique a conexão.");
  return data as Relatorio;
}

const dec = (n: number) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Texto de uma célula CSV: aspas quando preciso; neutraliza fórmulas (= + - @) para o Excel não executar. */
export function celula(valor: string | number): string {
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t) && typeof valor === "string") t = "'" + t;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV para o Excel brasileiro: separador ";" , decimal com vírgula e BOM (acentos corretos). */
export function gerarCsv(r: Relatorio): string {
  const L: (string | number)[][] = [];
  L.push(["Relatório do evento", r.evento.nome]);
  L.push(["Gerado em", dataHora(r.gerado_em)]);
  L.push([]);
  L.push(["RESUMO (valores líquidos, já descontadas as anulações)"]);
  L.push(["Vendas válidas", r.resumo.vendas], ["Vendas anuladas", r.resumo.anuladas], ["Vendas parcialmente anuladas", r.resumo.parciais], ["Cortesias", r.resumo.cortesias]);
  L.push(["Total vendido (bruto)", dec(r.resumo.bruto)], ["Total devolvido", dec(r.resumo.devolvido)], ["Total líquido", dec(r.resumo.liquido)]);
  L.push([]);
  L.push(["POR FORMA DE PAGAMENTO"], ["Forma", "Vendido", "Devolvido", "Líquido"]);
  r.por_forma.forEach((f) => L.push([ROTULO_FORMA[f.forma] ?? f.forma, dec(f.vendido), dec(f.devolvido), dec(f.liquido)]));
  L.push([]);
  L.push(["POR PRODUTO"], ["Produto", "Quantidade", "Faturamento"]);
  r.por_produto.forEach((p) => L.push([p.nome, p.quantidade, dec(p.faturamento)]));
  L.push([]);
  L.push(["POR CAIXA"], ["Caixa", "Vendas", "Líquido"]);
  r.por_caixa.forEach((c) => L.push([c.caixa, c.vendas, dec(c.liquido)]));
  L.push([]);
  L.push(["POR DIA"], ["Dia", "Vendas", "Líquido"]);
  r.por_dia.forEach((d) => L.push([dataBR(d.dia), d.vendas, dec(d.liquido)]));
  L.push([]);
  L.push(["CAIXA FÍSICO"], ["Sangrias registradas", dec(r.sangrias.total)], ["Sangrias não confirmadas", dec(r.sangrias.pendentes)]);
  L.push(["Turnos", r.turnos.total], ["Turnos abertos", r.turnos.abertos], ["Turnos fechados sem conferência", r.turnos.sem_conferir]);
  L.push([]);
  L.push(["ANULAÇÕES"], ["Venda", "Valor", "Motivo", "Por", "Em"]);
  r.anulacoes.forEach((a) => L.push([a.numero, dec(a.valor), a.motivo, a.por, dataHora(a.em)]));
  return "﻿" + L.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

export function baixarCsv(r: Relatorio): void {
  const url = URL.createObjectURL(new Blob([gerarCsv(r)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-${r.evento.codigo}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
