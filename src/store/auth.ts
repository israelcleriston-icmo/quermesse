import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { emailDoCpf } from "../lib/cpf";
import { supabase } from "../lib/supabase";

export type Papel = "caixa" | "secretaria" | "conselho" | "admin" | "porteiro";
export interface Usuario {
  id: string;
  nome: string;
  organizacaoId: string;
  papel: Papel;
}

interface Estado {
  carregando: boolean;
  usuario: Usuario | null;
  iniciar: () => void;
  /** Devolve a mensagem de erro, ou null se entrou. */
  entrar: (cpf: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
}

async function carregarUsuario(session: Session | null): Promise<Usuario | null> {
  if (!session) return null;
  const id = session.user.id;
  const [p, m] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", id).maybeSingle(),
    supabase.from("membros").select("organizacao_id, papel").eq("usuario_id", id).eq("ativo", true).limit(1).maybeSingle(),
  ]);
  if (!p.data || !m.data) return null;
  return { id, nome: p.data.nome, organizacaoId: m.data.organizacao_id, papel: m.data.papel as Papel };
}

let iniciado = false;

export const useAuth = create<Estado>((set) => ({
  carregando: true,
  usuario: null,

  iniciar: () => {
    if (iniciado) return;
    iniciado = true;
    supabase.auth.getSession().then(async ({ data }) => {
      set({ usuario: await carregarUsuario(data.session), carregando: false });
    });
    supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") set({ usuario: null });
    });
  },

  entrar: async (cpf, senha) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailDoCpf(cpf), password: senha });
    if (error?.name === "AuthRetryableFetchError") return "Sem conexão. Verifique o Wi-Fi e tente de novo.";
    if (error || !data.session) return "CPF ou senha incorretos.";
    const usuario = await carregarUsuario(data.session);
    if (!usuario) {
      await supabase.auth.signOut();
      return "Este usuário não tem acesso ativo. Fale com o administrador.";
    }
    set({ usuario });
    return null;
  },

  sair: async () => {
    await supabase.auth.signOut();
    set({ usuario: null });
  },
}));
