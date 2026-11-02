import { supabase } from "./supabase";
import type { Papel } from "../store/auth";

export const ROTULO_PAPEL: Record<Papel, string> = {
  caixa: "Caixa", secretaria: "Secretaria", conselho: "Conselho Econômico", admin: "Administrador", porteiro: "Portaria",
};
export const PAPEIS: Papel[] = ["caixa", "secretaria", "conselho", "admin", "porteiro"];

/** CPF mascarado para listas: ***.***.247-25 */
export const mascararCpf = (cpf: string) => (cpf.length === 11 ? `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}` : "***");

/** "2026-11-05" -> "05/11/2026" (sem passar por Date, para não deslocar o dia). */
export const dataBR = (iso: string) => iso.split("-").reverse().join("/");

async function mensagemDaFuncao(error: unknown, padrao: string): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ mensagem?: string }> } }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const j = await ctx.json();
      if (j?.mensagem) return j.mensagem;
    } catch { /* usa a mensagem padrão */ }
  }
  return padrao;
}

/** Cria o usuário pela Edge Function criar-usuario (só admin). */
export async function criarUsuario(p: { organizacaoId: string; nome: string; cpf: string; senha: string; papel: Papel }) {
  const { data, error } = await supabase.functions.invoke("criar-usuario", {
    body: { organizacao_id: p.organizacaoId, nome: p.nome, cpf: p.cpf, senha: p.senha, papel: p.papel },
  });
  if (error) throw new Error(await mensagemDaFuncao(error, "Não foi possível criar o usuário. Verifique a conexão e tente de novo."));
  return data as { id: string; nome: string; papel: Papel };
}

const MENSAGENS: Record<string, string> = {
  SEM_PERMISSAO: "Apenas o administrador pode fazer isso.",
  NAO_PODE_ALTERAR_A_SI_MESMO: "Você não pode rebaixar nem desativar o seu próprio usuário.",
  USUARIO_INEXISTENTE: "Usuário não encontrado.",
  DADOS_INVALIDOS: "Dados inválidos.",
};

export async function alterarMembro(p: { usuarioId: string; organizacaoId: string; papel: Papel; ativo: boolean }): Promise<void> {
  const { error } = await supabase.rpc("alterar_membro", {
    p_usuario: p.usuarioId, p_organizacao: p.organizacaoId, p_papel: p.papel, p_ativo: p.ativo,
  });
  if (error) {
    const codigo = Object.keys(MENSAGENS).find((c) => (error.message ?? "").includes(c));
    throw new Error(codigo ? MENSAGENS[codigo] : "Não foi possível alterar o usuário.");
  }
}
