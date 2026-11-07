import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { emailDoCpf } from "../lib/cpf";
import { expirou, limparAtividade, registrarAtividade } from "../lib/inatividade";
import { supabase } from "../lib/supabase";
import { useSacola } from "./sacola";

export type Papel = "caixa" | "secretaria" | "conselho" | "admin" | "porteiro";
export interface Usuario {
  id: string;
  nome: string;
  organizacaoId: string;
  /** Perfil ativo agora (o que vale para as permissões). */
  papel: Papel;
  /** Perfis que a pessoa pode assumir (o admin define). */
  papeis?: Papel[];
  /** Senha temporária definida pelo admin: precisa trocar antes de usar o sistema. */
  deveTrocarSenha?: boolean;
}

interface Estado {
  carregando: boolean;
  usuario: Usuario | null;
  /** Mensagem mostrada na tela de login (ex.: sessão encerrada por inatividade). */
  aviso: string;
  iniciar: () => void;
  /** Devolve a mensagem de erro, ou null se entrou. */
  entrar: (cpf: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
  expirarPorInatividade: () => Promise<void>;
  /** Chamado depois de trocar a senha com sucesso. */
  senhaTrocada: () => void;
  /** Troca o perfil ativo entre os liberados. Devolve a mensagem de erro, ou null se trocou. */
  trocarPapel: (papel: Papel) => Promise<string | null>;
}

async function carregarUsuario(session: Session | null): Promise<Usuario | null> {
  if (!session) return null;
  const id = session.user.id;
  const [p, m] = await Promise.all([
    supabase.from("perfis").select("nome").eq("id", id).maybeSingle(),
    supabase.from("membros").select("organizacao_id, papel, papeis_permitidos").eq("usuario_id", id).eq("ativo", true).limit(1).maybeSingle(),
  ]);
  if (!p.data || !m.data) return null;
  return { id, nome: p.data.nome, organizacaoId: m.data.organizacao_id, papel: m.data.papel as Papel,
    papeis: ((m.data.papeis_permitidos as Papel[] | null)?.length ? (m.data.papeis_permitidos as Papel[]) : [m.data.papel as Papel]),
    deveTrocarSenha: session.user.user_metadata?.deve_trocar_senha === true };
}

const AVISO_INATIVIDADE = "Sua sessão foi encerrada por inatividade. Entre de novo.";
let iniciado = false;

export const useAuth = create<Estado>((set, get) => ({
  carregando: true,
  usuario: null,
  aviso: "",

  iniciar: () => {
    if (iniciado) return;
    iniciado = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && expirou()) {              // ficou parado além do limite: encerra
        await supabase.auth.signOut();
        limparAtividade();
        set({ usuario: null, carregando: false, aviso: AVISO_INATIVIDADE });
        return;
      }
      if (data.session) registrarAtividade(Date.now(), true);
      set({ usuario: await carregarUsuario(data.session), carregando: false });
    });
    supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") {
        useSacola.getState().limpar();
        set({ usuario: null });
      }
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
    useSacola.getState().limpar();          // nunca herda a sacola de quem usou antes
    registrarAtividade(Date.now(), true);
    set({ usuario, aviso: "" });
    return null;
  },

  sair: async () => {
    useSacola.getState().limpar();
    await supabase.auth.signOut();
    limparAtividade();
    set({ usuario: null });
  },

  expirarPorInatividade: async () => {
    useSacola.getState().limpar();
    await supabase.auth.signOut();
    limparAtividade();
    set({ usuario: null, aviso: AVISO_INATIVIDADE });
  },

  senhaTrocada: () => set((e) => (e.usuario ? { usuario: { ...e.usuario, deveTrocarSenha: false } } : e)),

  trocarPapel: async (papel) => {
    const u = get().usuario;
    if (!u || !(u.papeis ?? [u.papel]).includes(papel)) return "Este perfil não está liberado para você.";
    if (papel === u.papel) return null;
    const { error } = await supabase.rpc("trocar_papel", { p_organizacao: u.organizacaoId, p_papel: papel });
    if (error) return (error.message ?? "").includes("PAPEL_NAO_PERMITIDO")
      ? "Este perfil não está liberado para você." : "Não foi possível trocar o perfil. Verifique a conexão e tente de novo.";
    useSacola.getState().limpar();          // a sacola de um perfil nunca passa para o outro
    set((e) => (e.usuario ? { usuario: { ...e.usuario, papel } } : e));
    return null;
  },
}));
