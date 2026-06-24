const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');

// Popula banco automaticamente se estiver vazio
const total = db.prepare('SELECT COUNT(*) as n FROM compras').get().n;
if (total === 0) {
  require('./seed');
}

// Cria usuário admin padrão se não existir
const adminExiste = db.prepare("SELECT id FROM usuarios WHERE email = 'admin@sistema.com'").get();
if (!adminExiste) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO usuarios (nome, email, senha, perfil) VALUES ('Administrador', 'admin@sistema.com', ?, 'admin')").run(hash);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'central-ti-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

const FRONT = path.join(__dirname, '..');
app.use(express.static(FRONT));

// Middleware de autenticação
function autenticado(req, res, next) {
  if (req.session && req.session.usuario) return next();
  res.status(401).json({ erro: 'Não autenticado' });
}

// ============================================================
// AUTH
// ============================================================
app.get('/', (req, res) => {
  if (req.session && req.session.usuario) {
    res.sendFile(path.join(FRONT, 'index.html'));
  } else {
    res.sendFile(path.join(FRONT, 'login.html'));
  }
});

app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(senha, user.senha)) {
    return res.status(401).json({ erro: 'Email ou senha incorretos' });
  }
  req.session.usuario = { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil };
  res.json({ ok: true, nome: user.nome });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.usuario) {
    res.json(req.session.usuario);
  } else {
    res.status(401).json({ erro: 'Não autenticado' });
  }
});

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
app.get('/api/compras', autenticado, (req, res) => {
  res.json(db.prepare('SELECT * FROM compras ORDER BY numero DESC').all());
});

app.post('/api/compras', autenticado, (req, res) => {
  const { desc, solicitante, depto, valor, prazo, prioridade, obs } = req.body;
  const { id, numero } = proximoId('compras', 'PC');
  db.prepare(`
    INSERT INTO compras (id, numero, desc, solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, null)
  `).run(id, numero, desc, solicitante, depto, valor, prazo, prioridade, obs, agora());
  res.json({ ok: true, id });
});

app.put('/api/compras/:id', autenticado, (req, res) => {
  const { desc, solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao } = req.body;
  const conclusao = data_conclusao !== undefined ? data_conclusao : (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  const abertura = data_abertura !== undefined ? data_abertura : null;
  const atual = db.prepare('SELECT data_abertura, data_conclusao FROM compras WHERE id=?').get(req.params.id);
  db.prepare(`
    UPDATE compras SET desc=?, solicitante=?, depto=?, valor=?, status=?, prazo=?, prioridade=?, obs=?, data_abertura=?, data_conclusao=?
    WHERE id=?
  `).run(desc, solicitante, depto, valor, status, prazo, prioridade, obs,
    abertura || atual.data_abertura,
    conclusao !== null ? conclusao : atual.data_conclusao,
    req.params.id);
  res.json({ ok: true });
});

// ============================================================
// MANUTENÇÃO
// ============================================================
app.get('/api/manutencao', autenticado, (req, res) => {
  res.json(db.prepare('SELECT * FROM manutencao ORDER BY numero DESC').all());
});

app.post('/api/manutencao', autenticado, (req, res) => {
  const { desc, local, tipo, resp, sla, prioridade } = req.body;
  const { id, numero } = proximoId('manutencao', 'MNT');
  db.prepare(`
    INSERT INTO manutencao (id, numero, desc, local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, 'Aberto', ?, ?, ?, null)
  `).run(id, numero, desc, local, tipo, resp, sla, prioridade, agora());
  res.json({ ok: true, id });
});

app.put('/api/manutencao/:id', autenticado, (req, res) => {
  const { desc, local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao } = req.body;
  const conclusao = data_conclusao !== undefined ? data_conclusao : (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  const atual = db.prepare('SELECT data_abertura, data_conclusao FROM manutencao WHERE id=?').get(req.params.id);
  db.prepare(`
    UPDATE manutencao SET desc=?, local=?, tipo=?, resp=?, status=?, sla=?, prioridade=?, data_abertura=?, data_conclusao=?
    WHERE id=?
  `).run(desc, local, tipo, resp, status, sla, prioridade,
    data_abertura || atual.data_abertura,
    conclusao !== null ? conclusao : atual.data_conclusao,
    req.params.id);
  res.json({ ok: true });
});

// ============================================================
// LINKS
// ============================================================
app.get('/api/links', autenticado, (req, res) => {
  res.json(db.prepare('SELECT * FROM links').all());
});

app.put('/api/links/:id', autenticado, (req, res) => {
  const { latencia, uptime, status, ultima } = req.body;
  db.prepare('UPDATE links SET latencia=?, uptime=?, status=?, ultima=? WHERE id=?')
    .run(latencia, uptime, status, ultima, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// CHAMADOS DE LINK
// ============================================================
app.get('/api/links-chamados', autenticado, (req, res) => {
  res.json(db.prepare('SELECT * FROM links_chamados ORDER BY numero DESC').all());
});

app.post('/api/links-chamados', autenticado, (req, res) => {
  const { linkId, linkNome, tipo, desc, resp, prioridade } = req.body;
  const { id, numero } = proximoId('links_chamados', 'LCH');
  db.prepare(`
    INSERT INTO links_chamados (id, numero, linkId, linkNome, tipo, desc, resp, prioridade, status, data_abertura, data_conclusao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Aberto', ?, null)
  `).run(id, numero, linkId, linkNome, tipo, desc, resp, prioridade, agora());
  res.json({ ok: true, id });
});

app.put('/api/links-chamados/:id', autenticado, (req, res) => {
  const { status, data_conclusao } = req.body;
  const conclusao = data_conclusao || (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  db.prepare('UPDATE links_chamados SET status=?, data_conclusao=? WHERE id=?')
    .run(status, conclusao, req.params.id);
  res.json({ ok: true });
});

// ============================================================
// USUÁRIOS
// ============================================================
app.get('/api/usuarios', autenticado, (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  res.json(db.prepare('SELECT id, nome, email, perfil FROM usuarios').all());
});

app.post('/api/usuarios', autenticado, (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  const { nome, email, senha, perfil } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios' });
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });
  const hash = bcrypt.hashSync(senha, 10);
  db.prepare('INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)').run(nome, email, hash, perfil || 'usuario');
  res.json({ ok: true });
});

app.put('/api/usuarios/:id', autenticado, (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  const { nome, email, senha, perfil } = req.body;
  if (senha) {
    const hash = bcrypt.hashSync(senha, 10);
    db.prepare('UPDATE usuarios SET nome=?, email=?, senha=?, perfil=? WHERE id=?').run(nome, email, hash, perfil, req.params.id);
  } else {
    db.prepare('UPDATE usuarios SET nome=?, email=?, perfil=? WHERE id=?').run(nome, email, perfil, req.params.id);
  }
  res.json({ ok: true });
});

app.delete('/api/usuarios/:id', autenticado, (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  if (Number(req.params.id) === req.session.usuario.id) return res.status(400).json({ erro: 'Não pode excluir a si mesmo' });
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
