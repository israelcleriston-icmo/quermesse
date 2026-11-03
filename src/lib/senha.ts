import { supabase } from "./supabase";

export const SENHA_MIN = 8;

/** Devolve a mensagem de erro, ou null se a nova senha é aceitável. */
export function validarNovaSenha(p: { atual: string; nova: string; confirmacao: string; cpf?: string }): string | null {
  if (!p.atual) return "Digite a senha atual.";
  if (p.nova.length < SENHA_MIN) return `A nova senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
  if (p.nova.length > 72) return "A nova senha deve ter no máximo 72 caracteres.";
  if (p.cpf && p.nova.replace(/\D/g, "") === p.cpf) return "A senha não pode ser o próprio CPF.";
  if (p.nova === p.atual) return "A nova senha precisa ser diferente da atual.";
  if (p.nova !== p.confirmacao) return "A confirmação não é igual à nova senha.";
  return null;
}

/** Confere a senha atual e grava a nova, limpando a marca "deve trocar a senha". */
export async function trocarMinhaSenha(p: { email: string; atual: string; nova: string }): Promise<void> {
  const conf = await supabase.auth.signInWithPassword({ email: p.email, password: p.atual });
  if (conf.error) {
    if (conf.error.name === "AuthRetryableFetchError") throw new Error("Sem conexão. Tente de novo.");
    throw new Error("A senha atual está incorreta.");
  }
  const { error } = await supabase.auth.updateUser({ password: p.nova, data: { deve_trocar_senha: false } });
  if (error) {
    if (/same|diferent/i.test(error.message)) throw new Error("A nova senha precisa ser diferente da atual.");
    throw new Error("Não foi possível trocar a senha. Tente de novo.");
  }
}
