// Copia os dados da produção antiga (Railway) para o novo banco Postgres.
// Uso:  DATABASE_URL=<string do Neon> node backend/importar-producao.js
// Apaga o conteúdo atual das tabelas de dados antes de importar.
const db = require('./database');

const ORIGEM = process.env.ORIGEM || 'https://central-monitoramento-production.up.railway.app';
const ORIGEM_EMAIL = process.env.ORIGEM_EMAIL || 'admin@sistema.com';
const ORIGEM_SENHA = process.env.ORIGEM_SENHA || 'admin123';

async function main() {
  console.log(`Conectando na produção antiga: ${ORIGEM}`);
  const login = await fetch(`${ORIGEM}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ORIGEM_EMAIL, senha: ORIGEM_SENHA }),
  });
  if (!login.ok) throw new Error(`Login na produção antiga falhou (${login.status})`);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const pega = async rota => {
    const r = await fetch(`${ORIGEM}${rota}`, { headers: { cookie } });
    if (!r.ok) throw new Error(`Falha ao buscar ${rota} (${r.status})`);
    return r.json();
  };

  const [compras, manutencao, links, chamados] = await Promise.all([
    pega('/api/compras'),
    pega('/api/manutencao'),
    pega('/api/links'),
    pega('/api/links-chamados'),
  ]);
  console.log(`Produção: ${compras.length} compras, ${manutencao.length} manutenções, ${links.length} links, ${chamados.length} chamados de link`);

  await db.init();
  await db.run('DELETE FROM compras');
  await db.run('DELETE FROM manutencao');
  await db.run('DELETE FROM links');
  await db.run('DELETE FROM links_chamados');
  await db.run('DELETE FROM comentarios');

  for (const c of compras) {
    await db.run(`INSERT INTO compras (id, numero, "desc", solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.id, c.numero, c.desc, c.solicitante, c.depto, c.valor, c.status, c.prazo, c.prioridade, c.obs, c.data_abertura, c.data_conclusao]);
  }
  for (const m of manutencao) {
    await db.run(`INSERT INTO manutencao (id, numero, "desc", local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [m.id, m.numero, m.desc, m.local, m.tipo, m.resp, m.status, m.sla, m.prioridade, m.data_abertura, m.data_conclusao]);
  }
  for (const l of links) {
    await db.run(`INSERT INTO links (id, nome, tipo, ip, velocidade, latencia, uptime, status, ultima)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [l.id, l.nome, l.tipo, l.ip, l.velocidade, l.latencia, l.uptime, l.status, l.ultima]);
  }
  for (const ch of chamados) {
    await db.run(`INSERT INTO links_chamados (id, numero, "linkId", "linkNome", tipo, "desc", resp, prioridade, status, data_abertura, data_conclusao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ch.id, ch.numero, ch.linkId, ch.linkNome, ch.tipo, ch.desc, ch.resp, ch.prioridade, ch.status, ch.data_abertura, ch.data_conclusao]);
  }

  // Comentários de cada chamado
  let totalComentarios = 0;
  const grupos = [
    ['compras', compras],
    ['manutencao', manutencao],
    ['links', chamados],
  ];
  for (const [modulo, itens] of grupos) {
    for (const item of itens) {
      const comentarios = await pega(`/api/comentarios/${modulo}/${item.id}`).catch(() => []);
      for (const co of comentarios) {
        await db.run(`INSERT INTO comentarios (modulo, chamado_id, usuario_nome, texto, data) VALUES ($1,$2,$3,$4,$5)`,
          [co.modulo, co.chamado_id, co.usuario_nome, co.texto, co.data]);
        totalComentarios++;
      }
    }
  }

  // Ajusta contadores para continuar a numeração de onde parou
  const maxNum = arr => arr.reduce((m, x) => Math.max(m, x.numero || 0), 0);
  await db.run('UPDATE contadores SET ultimo = $1 WHERE modulo = $2', [maxNum(compras), 'compras']);
  await db.run('UPDATE contadores SET ultimo = $1 WHERE modulo = $2', [maxNum(manutencao), 'manutencao']);
  await db.run('UPDATE contadores SET ultimo = $1 WHERE modulo = $2', [maxNum(chamados), 'links_chamados']);

  console.log(`Importação concluída! ${compras.length + manutencao.length + links.length + chamados.length} registros e ${totalComentarios} comentários copiados.`);
  console.log('Obs.: usuários não são copiados (senhas não podem ser exportadas) — recadastre-os na tela de Usuários.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('Erro:', e.message); process.exit(1); });
