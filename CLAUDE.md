# Central de Monitoramento TI — Colégio SER

Painel operacional de TI usado pelo Marcos Araújo (marcos.araujo@colegioser.com) no Colégio SER.
Módulos: Pedidos de Compra (PC-xxxx), Manutenção (MNT-xxxx), Links de Internet (LNK-xxx),
Chamados de Link (LCH-xxxx), Inventário de equipamentos (EQP-xxxx), Usuários, comentários,
gráficos e relatório mensal em Excel (`/api/relatorio?mes=AAAA-MM`, botão na página Gráficos).

Páginas públicas (sem login): `/abrir-chamado` (formulário para professores abrirem chamados
de manutenção, rate limit 5/15min por IP, vira MNT com "— solicitado por NOME" na descrição)
e `/tv` (painel agregado para monitor da sala de TI, atualiza a cada 60s, sem dados financeiros).

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
  - `server.js` — todas as rotas (async); login com limite de 5 falhas/15min por IP
  - `database.js` — pool do pg + criação do schema (init)
  - `seed.js` — dados de exemplo (`npm run seed`); roda sozinho se o banco estiver vazio
  - `importar-producao.js` — copiou os dados do Railway antigo (histórico)
- Frontend: `index.html` (SPA única, ~2000 linhas) + `login.html`, servidos pelo Express;
  responsivo (menu hamburger abaixo de 900px)
- Sessões: express-session + connect-pg-simple (tabela `session` no Postgres — sobrevive a reinícios)
- Admin inicial: criado no boot APENAS se a tabela usuarios estiver vazia
  (env ADMIN_EMAIL/ADMIN_SENHA; sem ADMIN_SENHA, gera aleatória e mostra no log).
  NUNCA colocar senhas no código — o repositório é público.
- `.github/workflows/manter-acordado.yml` — ping a cada 10 min (7h-19h BRT, seg-sáb)
  para o Render free não hibernar em horário de expediente

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

Login: usar as contas cadastradas na tela Usuários (senhas não ficam no código).
