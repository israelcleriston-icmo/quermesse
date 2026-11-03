# Publicação no GitHub Pages

## Como funciona
| Ambiente | Branch que publica | Repositório do site | Endereço |
|---|---|---|---|
| Produção | `main` | `quermesse` | https://www.quermesse.app.br |
| Treinamento | `training` | `quermesse-treinamento` | https://treinamento.quermesse.app.br |

O GitHub Pages só aceita **um domínio por repositório**. Por isso o treinamento tem seu próprio repositório
(`quermesse-treinamento`), que só recebe o site já pronto (branch `gh-pages`). O código continua só no `quermesse`.

## Por que a página ficava em branco em `israelcleriston-icmo.github.io/quermesse/`
O endereço de projeto do GitHub tem uma subpasta (`/quermesse/`). Com `base: "/"` o navegador procurava os arquivos na raiz e não achava.
Agora o `vite.config.ts` lê a variável `VITE_BASE` na hora do build:

- Domínio próprio (www… / treinamento…): `VITE_BASE=/` (padrão).
- Endereço `github.io/quermesse/`: `VITE_BASE=/quermesse/` (só para testar antes do DNS ficar pronto).

Teste local: `VITE_BASE=/quermesse/ npm run build:training` (no Git Bash) e abra a pasta `dist` com `npx vite preview`.

## DNS (no painel onde o domínio quermesse.app.br foi comprado)
| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `www` | `israelcleriston-icmo.github.io` |
| CNAME | `treinamento` | `israelcleriston-icmo.github.io` |

O valor é **só o usuário + .github.io**, sem `/quermesse` e sem `https://`. É esse erro (ou o registro ainda não existir) que causa o
`InvalidDNSError`. Depois de criar o registro, espere alguns minutos (até 24 h) e use "Check again" em Settings → Pages.
Marque **Enforce HTTPS** quando liberar.

## Segredo do treinamento (uma vez)
1. GitHub → Settings (do seu usuário) → Developer settings → Personal access tokens → Fine-grained tokens → Generate.
2. Repositório permitido: somente `quermesse-treinamento`. Permissão: **Contents: Read and write**.
3. No repositório `quermesse`: Settings → Secrets and variables → Actions → New repository secret
   → nome `TREINAMENTO_TOKEN`, valor = o token.
4. No repositório `quermesse-treinamento`: Settings → Pages → Source: **Deploy from a branch** → `gh-pages` / `/ (root)` → Custom domain: `treinamento.quermesse.app.br`.

## Produção (uma vez)
No repositório `quermesse`: Settings → Pages → Source: **GitHub Actions** → Custom domain: `www.quermesse.app.br`.

## Arquivos `.env.*`
O GitHub não tem o seu computador: os arquivos `.env.training` e `.env.production` precisam estar **commitados** (eles só têm a URL e a
chave pública do Supabase, que já ficam visíveis no navegador). Nunca coloque a chave secreta (`service_role`/`sb_secret_`) neles.
