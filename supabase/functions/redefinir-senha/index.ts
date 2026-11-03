// Edge Function: redefinir-senha
// Só o admin da organização define uma senha temporária para outro usuário.
// A senha vale uma vez: no próximo login o app obriga a troca (user_metadata.deve_trocar_senha).
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, tratar } from "./handler.ts";

function chaveDeServico(): string {
  const legada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legada) return legada;
  const mapa = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (mapa) {
    try {
      const j = JSON.parse(mapa);
      const v = j.default ?? Object.values(j)[0];
      if (typeof v === "string") return v;
    } catch { /* cai no erro abaixo */ }
  }
  throw new Error("Chave de serviço não encontrada no ambiente da função.");
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, chaveDeServico(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const origens = (Deno.env.get("ORIGENS_PERMITIDAS") ??
  "https://www.quermesse.app.br,https://treinamento.quermesse.app.br,http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);

const deps: Deps = {
  origensPermitidas: origens,

  async usuarioDoToken(jwt) {
    const { data, error } = await supabase.auth.getUser(jwt);
    return error || !data.user ? null : { id: data.user.id };
  },

  async ehAdmin(usuarioId, organizacaoId) {
    const { data, error } = await supabase.from("membros").select("id")
      .eq("usuario_id", usuarioId).eq("organizacao_id", organizacaoId)
      .eq("ativo", true).eq("papel", "admin").maybeSingle();
    if (error) console.error("ehAdmin:", error.message);
    return !!data;
  },

  async ehMembro(usuarioId, organizacaoId) {
    const { data, error } = await supabase.from("membros").select("id")
      .eq("usuario_id", usuarioId).eq("organizacao_id", organizacaoId).maybeSingle();
    if (error) console.error("ehMembro:", error.message);
    return !!data;
  },

  async definirSenhaTemporaria(usuarioId, senha) {
    const { data: atual } = await supabase.auth.admin.getUserById(usuarioId);
    const { error } = await supabase.auth.admin.updateUserById(usuarioId, {
      password: senha,
      user_metadata: { ...(atual?.user?.user_metadata ?? {}), deve_trocar_senha: true },
    });
    return error ? error.message : null;
  },

  async registrarLog({ organizacaoId, usuarioId, detalhes }) {
    const { error } = await supabase.from("logs_auditoria").insert({
      organizacao_id: organizacaoId, usuario_id: usuarioId, acao: "SENHA_REDEFINIDA", detalhes,
    });
    if (error) console.error("log de auditoria falhou:", error.message);
  },
};

Deno.serve((req) => tratar(req, deps));
