// Lógica da função redefinir-senha (só admin): define uma senha temporária e obriga a troca no próximo login.
export const SENHA_MIN = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Deps {
  usuarioDoToken(jwt: string): Promise<{ id: string } | null>;
  ehAdmin(usuarioId: string, organizacaoId: string): Promise<boolean>;
  /** O alvo precisa ser membro da mesma organização do admin. */
  ehMembro(usuarioId: string, organizacaoId: string): Promise<boolean>;
  /** Define a senha e marca deve_trocar_senha. Devolve mensagem de erro, ou null se deu certo. */
  definirSenhaTemporaria(usuarioId: string, senha: string): Promise<string | null>;
  registrarLog(p: { organizacaoId: string; usuarioId: string; detalhes: Record<string, unknown> }): Promise<void>;
  origensPermitidas: string[];
}

function cabecalhos(req: Request, deps: Deps): HeadersInit {
  const origem = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (deps.origensPermitidas.includes(origem)) h["Access-Control-Allow-Origin"] = origem;
  return h;
}

export async function tratar(req: Request, deps: Deps): Promise<Response> {
  const h = cabecalhos(req, deps);
  const resp = (status: number, corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { status, headers: h });
  const erro = (status: number, codigo: string, mensagem: string) => resp(status, { erro: codigo, mensagem });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return erro(405, "METODO_INVALIDO", "Use POST.");

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return erro(401, "NAO_AUTENTICADO", "Faça login.");
  const chamador = await deps.usuarioDoToken(jwt);
  if (!chamador) return erro(401, "NAO_AUTENTICADO", "Sessão inválida ou expirada.");

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "DADOS_INVALIDOS", "Corpo da requisição não é um JSON válido.");
  }
  const organizacaoId = String(corpo.organizacao_id ?? "");
  const usuarioId = String(corpo.usuario_id ?? "");
  const senha = String(corpo.senha ?? "");
  if (!UUID.test(organizacaoId) || !UUID.test(usuarioId)) return erro(400, "DADOS_INVALIDOS", "Dados inválidos.");

  if (!(await deps.ehAdmin(chamador.id, organizacaoId))) {
    return erro(403, "SEM_PERMISSAO", "Apenas o admin da organização pode redefinir senhas.");
  }
  if (usuarioId === chamador.id) {
    return erro(400, "USE_TROCAR_SENHA", "Para mudar a sua própria senha, use \"Trocar minha senha\" na tela inicial.");
  }
  if (senha.length < SENHA_MIN || senha.length > 72) {
    return erro(400, "SENHA_FRACA", `A senha deve ter de ${SENHA_MIN} a 72 caracteres.`);
  }
  if (!(await deps.ehMembro(usuarioId, organizacaoId))) {
    return erro(404, "USUARIO_INEXISTENTE", "Usuário não encontrado nesta organização.");
  }

  const falha = await deps.definirSenhaTemporaria(usuarioId, senha);
  if (falha) {
    console.error("definirSenhaTemporaria falhou:", falha);
    return erro(500, "ERRO_INTERNO", "Não foi possível redefinir a senha.");
  }
  // Auditoria: nunca registra a senha
  await deps.registrarLog({ organizacaoId, usuarioId: chamador.id, detalhes: { usuario_alvo_id: usuarioId } });
  return resp(200, { ok: true });
}
