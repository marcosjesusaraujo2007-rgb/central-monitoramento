const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
const path = require('path');
const FRONT = path.join(__dirname, '..');
app.use(express.static(FRONT));
app.get('/', (req, res) => res.sendFile(path.join(FRONT, 'index.html')));

// Gera próximo ID sequencial para um módulo
function proximoId(modulo, prefixo) {
  const atual = db.prepare('SELECT ultimo FROM contadores WHERE modulo = ?').get(modulo);
  const proximo = atual.ultimo + 1;
  db.prepare('UPDATE contadores SET ultimo = ? WHERE modulo = ?').run(proximo, modulo);
  return {
    numero: proximo,
    id: `${prefixo}-${String(proximo).padStart(4, '0')}`
  };
}

// Retorna data/hora atual formatada
function agora() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

const STATUS_CONCLUSAO = ['Concluído', 'Resolvido', 'Entregue', 'Cancelado'];

// ============================================================
// COMPRAS
// ============================================================
app.get('/api/compras', (req, res) => {
  res.json(db.prepare('SELECT * FROM compras ORDER BY numero DESC').all());
});

app.post('/api/compras', (req, res) => {
  const { desc, solicitante, depto, valor, prazo, prioridade, obs } = req.body;
  const { id, numero } = proximoId('compras', 'PC');
  db.prepare(`
    INSERT INTO compras (id, numero, desc, solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, null)
  `).run(id, numero, desc, solicitante, depto, valor, prazo, prioridade, obs, agora());
  res.json({ ok: true, id });
});

app.put('/api/compras/:id', (req, res) => {
  const { desc, solicitante, depto, valor, status, prazo, prioridade, obs, data_conclusao } = req.body;
  const conclusao = data_conclusao || (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  db.prepare(`
    UPDATE compras SET desc=?, solicitante=?, depto=?, valor=?, status=?, prazo=?, prioridade=?, obs=?, data_conclusao=?
    WHERE id=?
  `).run(desc, solicitante, depto, valor, status, prazo, prioridade, obs, conclusao, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// MANUTENÇÃO
// ============================================================
app.get('/api/manutencao', (req, res) => {
  res.json(db.prepare('SELECT * FROM manutencao ORDER BY numero DESC').all());
});

app.post('/api/manutencao', (req, res) => {
  const { desc, local, tipo, resp, sla, prioridade } = req.body;
  const { id, numero } = proximoId('manutencao', 'MNT');
  db.prepare(`
    INSERT INTO manutencao (id, numero, desc, local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, 'Aberto', ?, ?, ?, null)
  `).run(id, numero, desc, local, tipo, resp, sla, prioridade, agora());
  res.json({ ok: true, id });
});

app.put('/api/manutencao/:id', (req, res) => {
  const { desc, local, tipo, resp, status, sla, prioridade, data_conclusao } = req.body;
  const conclusao = data_conclusao || (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  db.prepare(`
    UPDATE manutencao SET desc=?, local=?, tipo=?, resp=?, status=?, sla=?, prioridade=?, data_conclusao=?
    WHERE id=?
  `).run(desc, local, tipo, resp, status, sla, prioridade, conclusao, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// LINKS
// ============================================================
app.get('/api/links', (req, res) => {
  res.json(db.prepare('SELECT * FROM links').all());
});

app.put('/api/links/:id', (req, res) => {
  const { latencia, uptime, status, ultima } = req.body;
  db.prepare('UPDATE links SET latencia=?, uptime=?, status=?, ultima=? WHERE id=?')
    .run(latencia, uptime, status, ultima, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// CHAMADOS DE LINK
// ============================================================
app.get('/api/links-chamados', (req, res) => {
  res.json(db.prepare('SELECT * FROM links_chamados ORDER BY numero DESC').all());
});

app.post('/api/links-chamados', (req, res) => {
  const { linkId, linkNome, tipo, desc, resp, prioridade } = req.body;
  const { id, numero } = proximoId('links_chamados', 'LCH');
  db.prepare(`
    INSERT INTO links_chamados (id, numero, linkId, linkNome, tipo, desc, resp, prioridade, status, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Aberto', ?, null)
  `).run(id, numero, linkId, linkNome, tipo, desc, resp, prioridade, agora());
  res.json({ ok: true, id });
});

app.put('/api/links-chamados/:id', (req, res) => {
  const { status, data_conclusao } = req.body;
  const conclusao = data_conclusao || (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  db.prepare('UPDATE links_chamados SET status=?, data_conclusao=? WHERE id=?')
    .run(status, conclusao, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
