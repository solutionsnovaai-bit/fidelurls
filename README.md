# Fidel URLs

Cola o link ou o IP de um lado, dá um nome, e sai um link curto e mascarado do outro. Roda no seu próprio domínio, sem depender de nenhuma API de terceiros. Os links **não expiram** — ficam no ar enquanto o projeto estiver publicado.

Duas abas, só isso:

- **Encurtar** — cola o destino (um link ou um IP, com ou sem porta, ex.: `123.45.67.89:8080`), escolhe o nome que o link vai ter (`seudominio.com/painel`) ou deixa gerar sozinho, e pronto. Já copia o link.
- **Editar** — lista dos links. Toca num, muda o destino, o nome ou a máscara, salva. Dá pra excluir também.

## Máscara

Com a máscara ligada, quem abre o link vê o seu domínio na barra do navegador e **nunca o IP de destino**:

- **IP ou endereço http** (o caso mais comum pra servidor próprio): o seu domínio busca o conteúdo no destino e entrega por dentro. O IP não aparece em lugar nenhum — nem na barra, nem no "ver código", nem na prévia do WhatsApp.
- **Site https comum**: abre o site por dentro do seu link. Alguns sites grandes (Google, bancos) não deixam; nesse caso o link abre o site direto, e o painel avisa.

Sem a máscara, o link só redireciona pro destino, igual a um encurtador comum.

## Colocar no ar (GitHub + Vercel + Neon)

1. **Vercel**: *Add New › Project* e importe este repositório. Em *Framework Preset* deixe **Other**. Pode clicar em *Deploy* (a primeira versão pede o banco, é normal).
2. **Banco**: no projeto, aba **Storage › Create Database › Neon**. Escolha a região de **São Paulo** se aparecer e conecte ao projeto. A variável `DATABASE_URL` é criada sozinha e as tabelas também.
3. **Senha**: em *Settings › Environment Variables*, crie `ADMIN_PASSWORD` com a senha para entrar no painel.
4. **Redeploy**: aba *Deployments*, nos três pontinhos do último deploy, *Redeploy*.
5. **Domínio**: *Settings › Domains*, adicione seu domínio curto e siga o DNS. Os links passam a sair com ele. Se tiver mais de um domínio e quiser fixar um, crie `PUBLIC_BASE_URL` (ex.: `https://seudominio.com`).

Abra o domínio, digite a senha e use.

### Variáveis

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel (obrigatória) |
| `DATABASE_URL` | Banco Postgres (o Neon preenche) |
| `PUBLIC_BASE_URL` | Opcional. Fixa o domínio dos links |
| `API_KEY` | Opcional. Chave para criar links por fora (Make, script) |

## Criar links por fora (opcional)

Com `API_KEY` definida:

```
POST https://seudominio.com/_fidel/api/links
Authorization: Bearer SUA_CHAVE
Content-Type: application/json

{ "url": "123.45.67.89:8080", "name": "painel", "mask": true }
```

Resposta traz `short_url`. Também: `PATCH /_fidel/api/links/NOME`, `DELETE /_fidel/api/links/NOME`, `GET /_fidel/api/links`.

## Rodar no computador (opcional)

Node.js 20+ e um Postgres.

```
npm install
DATABASE_URL=postgres://... ADMIN_PASSWORD=sua-senha npm run dev
```

Abra `http://localhost:3000`.

## Estrutura

- `api/index.js` — única função: abre os links (mascarando ou redirecionando) e responde ao painel.
- `lib/proxy.js` — a máscara de verdade para IP e http (busca e reescreve a página).
- `lib/` — banco, login, links e páginas públicas.
- `public/` — painel (HTML/CSS/JS sem build), em `public/_fidel/`.
- `vercel.json` — rotas, região (São Paulo) e cabeçalhos.
