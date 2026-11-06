// Escolha do evento nas telas de gestão (Conferência, Vendas, Relatórios, Pix): lembra a última escolha e,
// sem escolha, começa pelo evento que está acontecendo hoje (e não pelo que ainda vai começar).
import { AMBIENTE } from "./ambiente";

export interface EventoSel { id: string; nome: string; data_inicio?: string; data_fim?: string; status?: string }

const CHAVE = `quermesse-${AMBIENTE}-evento-gestao`;
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** "Festa do Padroeiro · 05/11 a 08/11" — a data distingue eventos de mesmo nome. */
export function rotuloEvento(e: EventoSel): string {
  return e.data_inicio && e.data_fim ? `${e.nome} · ${dm(e.data_inicio)} a ${dm(e.data_fim)}` : e.nome;
}

export function lembrarEvento(id: string): void {
  try { sessionStorage.setItem(CHAVE, id); } catch { /* sem armazenamento: segue sem lembrar */ }
}

export function escolherEventoPadrao(lista: EventoSel[]): string {
  if (lista.length === 0) return "";
  let salvo: string | null = null;
  try { salvo = sessionStorage.getItem(CHAVE); } catch { /* ignora */ }
  if (salvo && lista.some((e) => e.id === salvo)) return salvo;
  const hoje = hojeISO();
  const agora = lista.find((e) => e.status === "aberto" && e.data_inicio && e.data_fim && e.data_inicio <= hoje && hoje <= e.data_fim);
  if (agora) return agora.id;
  const jaComecou = lista.filter((e) => e.data_inicio && e.data_inicio <= hoje).sort((a, b) => (b.data_inicio ?? "").localeCompare(a.data_inicio ?? ""));
  return (jaComecou[0] ?? lista[0]).id;
}
