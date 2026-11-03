import assert from "node:assert/strict";
import { type Deps, tratar } from "./handler.ts";

const ORG = "10000000-0000-0000-0000-000000000001";
const ADMIN = "00000000-0000-0000-0000-0000000000d1";
const ALVO = "00000000-0000-0000-0000-0000000000c1";

function deps(over: Partial<Deps> = {}) {
  const chamadas: string[] = [];
  const d: Deps = {
    origensPermitidas: ["https://www.quermesse.app.br"],
    usuarioDoToken: (jwt) => Promise.resolve(jwt === "token-admin" ? { id: ADMIN } : null),
    ehAdmin: (u, o) => Promise.resolve(u === ADMIN && o === ORG),
    ehMembro: (u, o) => Promise.resolve(u === ALVO && o === ORG),
    definirSenhaTemporaria: (u) => { chamadas.push("definir:" + u); return Promise.resolve(null); },
    registrarLog: (p) => { chamadas.push("log:" + JSON.stringify(p.detalhes)); return Promise.resolve(); },
    ...over,
  };
  return { d, chamadas };
}
function req(corpo: unknown, token = "token-admin", metodo = "POST") {
  return new Request("http://x/redefinir-senha", {
    method: metodo,
    headers: { Authorization: token ? `Bearer ${token}` : "", Origin: "https://www.quermesse.app.br" },
    body: metodo === "POST" ? JSON.stringify(corpo) : undefined,
  });
}
const valido = { organizacao_id: ORG, usuario_id: ALVO, senha: "temporaria-1" };

Deno.test("admin redefine: 200, define a senha e registra log sem a senha", async () => {
  const { d, chamadas } = deps();
  const r = await tratar(req(valido), d);
  assert.equal(r.status, 200);
  assert.ok(chamadas.includes("definir:" + ALVO));
  assert.ok(!chamadas.join().includes("temporaria-1"));
  assert.ok(!JSON.stringify(await r.json()).includes("temporaria"));
});
Deno.test("sem token e token inválido -> 401", async () => {
  const { d } = deps();
  assert.equal((await tratar(req(valido, ""), d)).status, 401);
  assert.equal((await tratar(req(valido, "qualquer"), d)).status, 401);
});
Deno.test("não-admin -> 403 e nada muda", async () => {
  const { d, chamadas } = deps({ ehAdmin: () => Promise.resolve(false) });
  assert.equal((await tratar(req(valido), d)).status, 403);
  assert.equal(chamadas.length, 0);
});
Deno.test("o admin não redefine a própria senha por aqui -> USE_TROCAR_SENHA", async () => {
  const { d, chamadas } = deps();
  const r = await tratar(req({ ...valido, usuario_id: ADMIN }), d);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, "USE_TROCAR_SENHA");
  assert.equal(chamadas.length, 0);
});
Deno.test("senha curta -> SENHA_FRACA", async () => {
  const { d } = deps();
  const r = await tratar(req({ ...valido, senha: "curta" }), d);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, "SENHA_FRACA");
});
Deno.test("usuário de outra organização/inexistente -> 404", async () => {
  const { d, chamadas } = deps({ ehMembro: () => Promise.resolve(false) });
  const r = await tratar(req(valido), d);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).erro, "USUARIO_INEXISTENTE");
  assert.equal(chamadas.length, 0);
});
Deno.test("dados inválidos: ids fora do formato e JSON quebrado -> 400", async () => {
  const { d } = deps();
  assert.equal((await tratar(req({ ...valido, usuario_id: "x" }), d)).status, 400);
  const quebrado = new Request("http://x", { method: "POST", headers: { Authorization: "Bearer token-admin" }, body: "{nao-json" });
  assert.equal((await tratar(quebrado, d)).status, 400);
});
Deno.test("falha ao gravar a senha -> 500 e sem log", async () => {
  const { d, chamadas } = deps({ definirSenhaTemporaria: () => Promise.resolve("erro interno") });
  assert.equal((await tratar(req(valido), d)).status, 500);
  assert.equal(chamadas.length, 0);
});
Deno.test("GET -> 405; OPTIONS -> 204 com CORS da origem permitida", async () => {
  const { d } = deps();
  assert.equal((await tratar(req(null, "token-admin", "GET"), d)).status, 405);
  const o = await tratar(req(null, "", "OPTIONS"), d);
  assert.equal(o.status, 204);
  assert.equal(o.headers.get("Access-Control-Allow-Origin"), "https://www.quermesse.app.br");
});
