// Lógica da função criar-usuario, separada do Supabase para poder ser testada.
import { cpfValido, emailDoCpf, limparCpf } from "./cpf.ts";

export const PAPEIS = ["caixa", "secretaria", "conselho", "admin", "porteiro"] as const;
export type Papel = (typeof PAPEIS)[number];
export const SENHA_MIN = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Deps {
  /** Valida o token do usuário que está chamando; null se inválido. */
  usuarioDoToken(jwt: string): Promise<{ id: string } | null>;
  ehAdmin(usuarioId: string, organizacaoId: string): Promise<boolean>;
  cpfJaCadastrado(cpf: string): Promise<boolean>;
  criarLogin(
    email: string,
    senha: string,
    nome: string,
  ): Promise<{ id: string } | { erro: string; jaExiste?: boolean }>;
  /** Devolve mensagem de erro, ou null se gravou. */
  gravarPerfilEMembro(p: {
    id: string;
    nome: string;
    cpf: string;
    organizacaoId: string;
    papel: Papel;
  }): Promise<string | null>;
  /** Apagar o login também apaga perfil e membro (ON DELETE CASCADE). */
  removerLogin(id: string): Promise<void>;
  registrarLog(p: {
    organizacaoId: string;
    usuarioId: string;
    detalhes: Record<string, unknown>;
  }): Promise<void>;
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
  const resp = (status: number, corpo: Record<string, unknown>) =>
    new Response(JSON.stringify(corpo), { status, headers: h });
  const erro = (status: number, codigo: string, mensagem: string) =>
    resp(status, { erro: codigo, mensagem });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return erro(405, "METODO_INVALIDO", "Use POST.");

  // 1. Quem está chamando?
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return erro(401, "NAO_AUTENTICADO", "Faça login.");
  const chamador = await deps.usuarioDoToken(jwt);
  if (!chamador) return erro(401, "NAO_AUTENTICADO", "Sessão inválida ou expirada.");

  // 2. Corpo da requisição
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "DADOS_INVALIDOS", "Corpo da requisição não é um JSON válido.");
  }
  const organizacaoId = String(corpo.organizacao_id ?? "");
  if (!UUID.test(organizacaoId)) {
    return erro(400, "DADOS_INVALIDOS", "organizacao_id inválido.");
  }

  // 3. Só admin da organização cria usuários
  if (!(await deps.ehAdmin(chamador.id, organizacaoId))) {
    return erro(403, "SEM_PERMISSAO", "Apenas o admin da organização pode criar usuários.");
  }

  // 4. Valida os dados do novo usuário
  const nome = String(corpo.nome ?? "").trim();
  const cpf = limparCpf(String(corpo.cpf ?? ""));
  const senha = String(corpo.senha ?? "");
  const papel = String(corpo.papel ?? "") as Papel;

  if (nome.length < 2 || nome.length > 100) {
    return erro(400, "DADOS_INVALIDOS", "Nome deve ter entre 2 e 100 caracteres.");
  }
  if (!cpfValido(cpf)) return erro(400, "CPF_INVALIDO", "CPF inválido.");
  if (!PAPEIS.includes(papel)) return erro(400, "DADOS_INVALIDOS", "Papel inválido.");
  if (senha.length < SENHA_MIN || senha.length > 72) {
    return erro(400, "SENHA_FRACA", `A senha deve ter de ${SENHA_MIN} a 72 caracteres.`);
  }
  if (senha.replace(/\D/g, "") === cpf) {
    return erro(400, "SENHA_FRACA", "A senha não pode ser o próprio CPF.");
  }

  // 5. CPF único
  if (await deps.cpfJaCadastrado(cpf)) {
    return erro(409, "CPF_JA_CADASTRADO", "Já existe um usuário com este CPF.");
  }

  // 6. Cria o login, depois perfil e vínculo; se algo falhar, desfaz o login
  const login = await deps.criarLogin(emailDoCpf(cpf), senha, nome);
  if ("erro" in login) {
    if (login.jaExiste) return erro(409, "CPF_JA_CADASTRADO", "Já existe um usuário com este CPF.");
    console.error("criarLogin falhou:", login.erro);
    return erro(500, "ERRO_INTERNO", "Não foi possível criar o login.");
  }
  const falha = await deps.gravarPerfilEMembro({
    id: login.id,
    nome,
    cpf,
    organizacaoId,
    papel,
  });
  if (falha) {
    console.error("gravarPerfilEMembro falhou:", falha);
    await deps.removerLogin(login.id);
    return erro(500, "ERRO_INTERNO", "Não foi possível gravar o usuário. Nada foi criado.");
  }

  // 7. Auditoria (nunca registra a senha)
  await deps.registrarLog({
    organizacaoId,
    usuarioId: chamador.id,
    detalhes: { novo_usuario_id: login.id, papel },
  });

  return resp(201, { id: login.id, nome, papel });
}
