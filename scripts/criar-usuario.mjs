// Cria um usuário chamando a Edge Function criar-usuario (enquanto o app não tem tela de admin).
// Uso:  node scripts/criar-usuario.mjs
// Faça isto sem ninguém olhando a tela: as senhas aparecem enquanto você digita.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });
const perguntar = async (t, padrao = "") =>
  ((await rl.question(padrao ? `${t} [${padrao}]: ` : `${t}: `)).trim() || padrao);

const solo = (s) => s.replace(/\D/g, "");
const emailDoCpf = (cpf) => `${solo(cpf)}@cpf.quermesse.app.br`;

const url = (process.env.SUPABASE_URL || (await perguntar("URL do projeto (https://xxxx.supabase.co)"))).replace(/\/$/, "");
const chave = process.env.SUPABASE_KEY || (await perguntar("Chave pública do projeto (publishable ou anon)"));

console.log("\n--- Seu login de admin ---");
const cpfAdmin = await perguntar("CPF do admin");
const senhaAdmin = await perguntar("Senha do admin");

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: chave, "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailDoCpf(cpfAdmin), password: senhaAdmin }),
});
const sessao = await login.json();
if (!login.ok || !sessao.access_token) {
  console.error("Login do admin falhou:", sessao.error_description || sessao.msg || login.status);
  process.exit(1);
}

console.log("\n--- Novo usuário ---");
const corpo = {
  organizacao_id: await perguntar("organizacao_id (do bootstrap_admin.sql)"),
  nome: await perguntar("Nome"),
  cpf: await perguntar("CPF"),
  papel: await perguntar("Papel (caixa, secretaria, conselho, admin, porteiro)", "caixa"),
  senha: await perguntar("Senha inicial (mínimo 8 caracteres)"),
};
rl.close();

const r = await fetch(`${url}/functions/v1/criar-usuario`, {
  method: "POST",
  headers: { apikey: chave, Authorization: `Bearer ${sessao.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});
const resposta = await r.json().catch(() => ({}));
console.log(r.status, JSON.stringify(resposta, null, 2));
process.exit(r.ok ? 0 : 1);
