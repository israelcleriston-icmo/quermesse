// Edge Function: criar-usuario
// Só o admin da organização cria usuários (caixa, secretaria, conselho, admin, porteiro).
// O papel NUNCA vem de metadata do token: é gravado em `membros` por esta função.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, tratar } from "./handler.ts";

function chaveDeServico(): string {
  const legada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legada) return legada;
  // Formato novo de chaves (sb_secret_...), caso a legada não esteja disponível
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
    if (error) console.error("ehAdmin: erro ao consultar membros:", error.message);
    return !!data;
  },

  async cpfJaCadastrado(cpf) {
    const { data, error } = await supabase.from("perfis").select("id").eq("cpf", cpf).maybeSingle();
    if (error) console.error("cpfJaCadastrado: erro ao consultar perfis:", error.message);
    return !!data;
  },

  async criarLogin(email, senha, nome) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error || !data.user) {
      return { erro: error?.message ?? "sem usuário", jaExiste: error?.code === "email_exists" };
    }
    return { id: data.user.id };
  },

  async gravarPerfilEMembro({ id, nome, cpf, organizacaoId, papel }) {
    const p = await supabase.from("perfis").insert({ id, nome, cpf });
    if (p.error) return p.error.message;
    const m = await supabase.from("membros").insert({
      usuario_id: id,
      organizacao_id: organizacaoId,
      papel,
    });
    return m.error ? m.error.message : null;
  },

  async removerLogin(id) {
    await supabase.auth.admin.deleteUser(id);
  },

  async registrarLog({ organizacaoId, usuarioId, detalhes }) {
    const { error } = await supabase.from("logs_auditoria").insert({
      organizacao_id: organizacaoId,
      usuario_id: usuarioId,
      acao: "USUARIO_CRIADO",
      detalhes,
    });
    if (error) console.error("log de auditoria falhou:", error.message);
  },
};

Deno.serve((req) => tratar(req, deps));
