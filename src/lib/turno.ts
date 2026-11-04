import { supabase } from "./supabase";

export interface Sangria { id: string; valor: number; motivo: string | null; registrada_em: string; confirmada: boolean }
export interface TurnoAberto { id: string; eventoId: string; abertoEm: string; fundoCentavos: number; sangrias: Sangria[] }
export interface TurnoConferencia {
  turno_id: string; caixa: string; proprio: boolean; aberto_em: string; fechado_em: string | null;
  fundo_inicial: number; vendas_dinheiro: number; sangrias_total: number; sangrias_pendentes: number;
  sangrias: Sangria[]; outras_formas: Record<string, number>;
  contado: number | null; obs_fechamento: string | null; esperado: number | null; diferenca: number | null;
  conferido_em: string | null; obs_conferencia: string | null;
}

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para isso neste perfil.",
  TURNO_JA_ABERTO: "Você já tem um turno aberto. Feche-o antes de abrir outro.",
  TURNO_FECHADO: "Este turno já foi fechado.",
  FUNDO_INVALIDO: "Valor do fundo de troco inválido.",
  VALOR_INVALIDO: "Valor inválido.",
  EVENTO_ENCERRADO: "O evento está encerrado.",
  EVENTO_INEXISTENTE: "Evento não encontrado.",
  PROPRIO_TURNO: "Você não pode conferir nem confirmar o seu próprio turno. Peça a outra pessoa do Conselho.",
  JA_CONFIRMADA: "Esta sangria já foi confirmada.",
  JA_CONFERIDO: "Este turno já foi conferido.",
  TURNO_ABERTO: "O caixa ainda não fechou este turno.",
};
function falha(error: { message?: string }, padrao: string): never {
  const cod = Object.keys(MENSAGENS).find((c) => (error.message ?? "").includes(c));
  throw new Error(cod ? MENSAGENS[cod] : padrao);
}
const reais = (centavos: number) => Math.round(centavos) / 100;
const SEM_REDE = "Não foi possível concluir. Verifique a conexão e tente de novo.";

/** Turno aberto do próprio usuário (ou null). */
export async function carregarTurnoAberto(usuarioId: string): Promise<TurnoAberto | null> {
  const t = await supabase.from("turnos_caixa").select("id, evento_id, aberto_em, fundo_inicial")
    .eq("caixa_id", usuarioId).is("fechado_em", null).maybeSingle();
  if (t.error) throw new Error("Não foi possível carregar o turno.");
  if (!t.data) return null;
  const s = await supabase.from("sangrias").select("id, valor, motivo, registrada_em, confirmada_em")
    .eq("turno_id", t.data.id).order("registrada_em");
  if (s.error) throw new Error("Não foi possível carregar as sangrias.");
  return {
    id: t.data.id, eventoId: t.data.evento_id, abertoEm: t.data.aberto_em, fundoCentavos: Math.round(Number(t.data.fundo_inicial) * 100),
    sangrias: (s.data ?? []).map((x) => ({ id: x.id, valor: Number(x.valor), motivo: x.motivo, registrada_em: x.registrada_em, confirmada: !!x.confirmada_em })),
  };
}

export async function abrirTurno(eventoId: string, fundoCentavos: number): Promise<void> {
  const { error } = await supabase.rpc("abrir_turno", { p_evento: eventoId, p_fundo: reais(fundoCentavos) });
  if (error) falha(error, SEM_REDE);
}
export async function registrarSangria(turnoId: string, centavos: number, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("registrar_sangria", { p_turno: turnoId, p_valor: reais(centavos), p_motivo: motivo.trim() || null });
  if (error) falha(error, SEM_REDE);
}
export async function fecharTurno(turnoId: string, contadoCentavos: number, obs: string): Promise<void> {
  const { error } = await supabase.rpc("fechar_turno", { p_turno: turnoId, p_contado: reais(contadoCentavos), p_obs: obs.trim() || null });
  if (error) falha(error, SEM_REDE);
}
export async function conferenciaDoEvento(eventoId: string): Promise<TurnoConferencia[]> {
  const { data, error } = await supabase.rpc("conferencia_turnos", { p_evento: eventoId });
  if (error) falha(error, "Não foi possível carregar a conferência.");
  return (data ?? []) as TurnoConferencia[];
}
export async function confirmarSangria(id: string): Promise<void> {
  const { error } = await supabase.rpc("confirmar_sangria", { p_sangria: id });
  if (error) falha(error, SEM_REDE);
}
export async function conferirTurno(id: string, obs: string): Promise<void> {
  const { error } = await supabase.rpc("conferir_turno", { p_turno: id, p_obs: obs.trim() || null });
  if (error) falha(error, SEM_REDE);
}
