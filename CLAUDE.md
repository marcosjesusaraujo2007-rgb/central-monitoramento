# Central de Monitoramento TI — Colégio SER

Painel operacional de TI usado pelo Marcos Araújo (marcos.araujo@colegioser.com) no Colégio SER.
Módulos: Pedidos de Compra (PC-xxxx), Manutenção (MNT-xxxx), Links de Internet (LNK-xxx),
Chamados de Link (LCH-xxxx), Usuários, comentários e página de gráficos.

## Infraestrutura (desde jul/2026, custo zero)

- **Produção:** https://central-monitoramento-dlzs.onrender.com
  - Render, plano free — hiberna após 15 min ocioso; primeiro acesso demora ~1 min
  - Deploy automático a cada push na branch `master`
  - Cuidado: `central-monitoramento.onrender.com` (sem sufixo) é de outra pessoa
- **Banco:** Postgres no Neon (plano free, região sa-east-1, banco `neondb`)
  - A connection string fica na variável de ambiente `DATABASE_URL` do Render
  - O servidor NÃO sobe sem `DATABASE_URL` definida
- **Histórico:** rodou no Railway com SQLite até jul/2026 (crédito trial acabando);
  migrado para pg/Postgres no commit `b0b0582`

## Stack e estrutura

- Backend: Node.js (>=20) + Express + pg — tudo em `backend/`
  - `server.js` — todas as rotas (async); usuários padrão criados no boot
  - `database.js` — pool do pg + criação do schema (init)
  - `seed.js` — dados de exemplo (`npm run seed`); roda sozinho se o banco estiver vazio
  - `importar-producao.js` — copiou os dados do Railway antigo (histórico)
- Frontend: `index.html` (SPA única, ~1900 linhas) + `login.html`, servidos pelo Express
- Sessões: express-session em memória (reinício do servidor desloga todo mundo)

## Cuidados no SQL (Postgres)

- `"desc"` é palavra reservada — sempre entre aspas
- `"linkId"` e `"linkNome"` (camelCase) — sempre entre aspas
- IDs sequenciais via tabela `contadores` com `UPDATE ... RETURNING` (atômico)
- Datas são TEXT no formato `dd/mm/aaaa hh:mm` (não usar tipos date do Postgres)

## Rodar localmente

```
set DATABASE_URL=<string do Neon ou Postgres local>
npm install
npm start        # http://localhost:3000
```

Login admin padrão: ver `usuariosPadrao` em `backend/server.js`.
