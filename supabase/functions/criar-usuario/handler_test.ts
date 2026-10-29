import assert from "node:assert/strict";
import { cpfValido } from "./cpf.ts";
import { type Deps, tratar } from "./handler.ts";

const ORG = "10000000-0000-0000-0000-000000000001";
const ADMIN = "00000000-0000-0000-0000-0000000000d1";
const CPF_OK = "52998224725"; // CPF de exemplo válido

function deps(over: Partial<Deps> = {}) {
  const chamadas: string[] = [];
  const d: Deps = {
    origensPermitidas: ["https://www.quermesse.app.br"],
    usuarioDoToken: (jwt) => Promise.resolve(jwt === "token-admin" ? { id: ADMIN } : null),
    ehAdmin: (u, o) => Promise.resolve(u === ADMIN && o === ORG),
    cpfJaCadastrado: () => Promise.resolve(false),
    criarLogin: (email) => {
      chamadas.push("criarLogin:" + email);
      return Promise.resolve({ id: "99999999-0000-0000-0000-000000000001" });
    },
    gravarPerfilEMembro: (p) => {
      chamadas.push("gravar:" + p.papel);
      return Promise.resolve(null);
    },
    removerLogin: () => {
      chamadas.push("removerLogin");
      return Promise.resolve();
    },
    registrarLog: (p) => {
      chamadas.push("log:" + JSON.stringify(p.detalhes));
      return Promise.resolve();
    },
    ...over,
  };
  return { d, chamadas };
}

function req(corpo: unknown, token = "token-admin", metodo = "POST") {
  return new Request("http://x/criar-usuario", {
    method: metodo,
    headers: { Authorization: token ? `Bearer ${token}` : "", Origin: "https://www.quermesse.app.br" },
    body: metodo === "POST" ? JSON.stringify(corpo) : undefined,
  });
}
const valido = { organizacao_id: ORG, nome: "Maria Silva", cpf: "529.982.247-25", senha: "senha-forte-1", papel: "caixa" };

Deno.test("CPF: válidos e inválidos", () => {
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("11144477735"), true);
  assert.equal(cpfValido("11111111111"), false);
  assert.equal(cpfValido("52998224726"), false);
  assert.equal(cpfValido("123"), false);
});

Deno.test("cria usuário (201), e-mail sintético do CPF, papel e log sem senha", async () => {
  const { d, chamadas } = deps();
  const r = await tratar(req(valido), d);
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.papel, "caixa");
  assert.ok(chamadas.includes("criarLogin:52998224725@cpf.quermesse.app.br"));
  assert.ok(chamadas.includes("gravar:caixa"));
  assert.ok(!chamadas.join().includes("senha-forte-1"));
  assert.ok(!JSON.stringify(j).includes("senha"));
});

Deno.test("sem token -> 401", async () => {
  const { d } = deps();
  assert.equal((await tratar(req(valido, ""), d)).status, 401);
});

Deno.test("token inválido (ex.: chave anon) -> 401", async () => {
  const { d } = deps();
  assert.equal((await tratar(req(valido, "qualquer-coisa"), d)).status, 401);
});

Deno.test("não-admin -> 403 e nada é criado", async () => {
  const { d, chamadas } = deps({ ehAdmin: () => Promise.resolve(false) });
  const r = await tratar(req(valido), d);
  assert.equal(r.status, 403);
  assert.equal(chamadas.length, 0);
});

Deno.test("admin de outra organização -> 403", async () => {
  const { d } = deps();
  const r = await tratar(req({ ...valido, organizacao_id: "20000000-0000-0000-0000-000000000002" }), d);
  assert.equal(r.status, 403);
});

Deno.test("validações: CPF, senha curta, senha = CPF, papel, nome, org, JSON", async () => {
  const { d } = deps();
  assert.equal((await tratar(req({ ...valido, cpf: "11111111111" }), d)).status, 400);
  assert.equal((await tratar(req({ ...valido, senha: "1234567" }), d)).status, 400);
  assert.equal((await tratar(req({ ...valido, senha: "52998224725" }), d)).status, 400);
  assert.equal((await tratar(req({ ...valido, papel: "presidente" }), d)).status, 400);
  assert.equal((await tratar(req({ ...valido, nome: " " }), d)).status, 400);
  assert.equal((await tratar(req({ ...valido, organizacao_id: "abc" }), d)).status, 400);
  const quebrado = new Request("http://x", { method: "POST", headers: { Authorization: "Bearer token-admin" }, body: "{nao-json" });
  assert.equal((await tratar(quebrado, d)).status, 400);
});

Deno.test("CPF já cadastrado -> 409 sem criar login", async () => {
  const { d, chamadas } = deps({ cpfJaCadastrado: () => Promise.resolve(true) });
  assert.equal((await tratar(req(valido), d)).status, 409);
  assert.equal(chamadas.length, 0);
});

Deno.test("e-mail já existe no Auth -> 409", async () => {
  const { d } = deps({ criarLogin: () => Promise.resolve({ erro: "x", jaExiste: true }) });
  assert.equal((await tratar(req(valido), d)).status, 409);
});

Deno.test("falha ao gravar perfil/membro -> desfaz o login (500)", async () => {
  const { d, chamadas } = deps({ gravarPerfilEMembro: () => Promise.resolve("violação de chave") });
  const r = await tratar(req(valido), d);
  assert.equal(r.status, 500);
  assert.ok(chamadas.includes("removerLogin"));
  assert.ok(!chamadas.some((c) => c.startsWith("log:")));
});

Deno.test("método GET -> 405; OPTIONS -> 204 com CORS da origem permitida", async () => {
  const { d } = deps();
  assert.equal((await tratar(req(null, "token-admin", "GET"), d)).status, 405);
  const o = await tratar(new Request("http://x", { method: "OPTIONS", headers: { Origin: "https://www.quermesse.app.br" } }), d);
  assert.equal(o.status, 204);
  assert.equal(o.headers.get("Access-Control-Allow-Origin"), "https://www.quermesse.app.br");
  const estranho = await tratar(new Request("http://x", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), d);
  assert.equal(estranho.headers.get("Access-Control-Allow-Origin"), null);
});
