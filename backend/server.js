const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Popula banco automaticamente se estiver vazio
const total = db.prepare('SELECT COUNT(*) as n FROM compras').get().n;
if (total === 0) {
  require('./seed');
}

// Cria usuários padrão se não existirem
const usuariosPadrao = [
  { nome: 'Administrador', email: 'admin@sistema.com', senha: 'admin123', perfil: 'admin' },
  { nome: 'Marcos Araújo', email: 'marcos.araujo@colegioser.com', senha: 'Marcos@2007', perfil: 'admin' },
];
for (const u of usuariosPadrao) {
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(u.email);
  if (!existe) {
    const hash = bcrypt.hashSync(u.senha, 10);
    db.prepare("INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)").run(u.nome, u.email, hash, u.perfil);
  }
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
// TEMPLATES E IMPORTAÇÃO
// ============================================================

// Template Compras
app.get('/api/compras/template', autenticado, (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Descrição', 'Solicitante', 'Departamento', 'Valor (R$)', 'Prazo', 'Prioridade', 'Observações'],
    ['Exemplo: Compra de notebooks', 'João Silva', 'TI', '5000', '30/07/2025', 'Alta', 'Urgente'],
  ]);
  ws['!cols'] = [30,20,15,12,12,10,30].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Compras');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="template_compras.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Importar Compras
app.post('/api/compras/importar', autenticado, upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let importados = 0, erros = [];
    for (const r of rows) {
      const desc = r['Descrição'] || r['Descricao'] || r['desc'] || '';
      if (!desc) { erros.push('Linha sem descrição ignorada'); continue; }
      try {
        const { id, numero } = proximoId('compras', 'PC');
        db.prepare(`INSERT INTO compras (id,numero,desc,solicitante,depto,valor,status,prazo,prioridade,obs,data_abertura,data_conclusao)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,null)`)
          .run(id, numero, desc,
            r['Solicitante']||'—', r['Departamento']||'—',
            parseFloat(String(r['Valor (R$)']).replace(',','.'))||0,
            'Pendente',
            r['Prazo']||'—',
            r['Prioridade']||'Média',
            r['Observações']||r['Observacoes']||'',
            agora());
        importados++;
      } catch(e) { erros.push(`Erro na linha "${desc}": ${e.message}`); }
    }
    res.json({ ok: true, importados, erros });
  } catch(e) {
    res.status(400).json({ erro: 'Arquivo inválido: ' + e.message });
  }
});

// Template Manutenção
app.get('/api/manutencao/template', autenticado, (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Descrição', 'Local', 'Tipo', 'Responsável', 'SLA', 'Prioridade'],
    ['Exemplo: Troca de lâmpadas', 'Bloco A', 'Elétrica', 'João S.', '4h', 'Média'],
  ]);
  ws['!cols'] = [30,15,15,15,8,10].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Manutenção');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="template_manutencao.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Importar Manutenção
app.post('/api/manutencao/importar', autenticado, upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let importados = 0, erros = [];
    for (const r of rows) {
      const desc = r['Descrição'] || r['Descricao'] || r['desc'] || '';
      if (!desc) { erros.push('Linha sem descrição ignorada'); continue; }
      try {
        const { id, numero } = proximoId('manutencao', 'MNT');
        db.prepare(`INSERT INTO manutencao (id,numero,desc,local,tipo,resp,status,sla,prioridade,data_abertura,data_conclusao)
          VALUES (?,?,?,?,?,?,?,?,?,?,null)`)
          .run(id, numero, desc,
            r['Local']||'—', r['Tipo']||'Geral',
            r['Responsável']||r['Responsavel']||'—',
            'Aberto',
            r['SLA']||'—',
            r['Prioridade']||'Média',
            agora());
        importados++;
      } catch(e) { erros.push(`Erro na linha "${desc}": ${e.message}`); }
    }
    res.json({ ok: true, importados, erros });
  } catch(e) {
    res.status(400).json({ erro: 'Arquivo inválido: ' + e.message });
  }
});

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
  const atual = db.prepare('SELECT data_abertura, data_conclusao FROM compras WHERE id=?').get(req.params.id);
  let conclusao;
  if (data_conclusao) conclusao = data_conclusao;
  else if (STATUS_CONCLUSAO.includes(status)) conclusao = agora();
  else conclusao = null;
  db.prepare(`
    UPDATE compras SET desc=?, solicitante=?, depto=?, valor=?, status=?, prazo=?, prioridade=?, obs=?, data_abertura=?, data_conclusao=?
    WHERE id=?
  `).run(desc, solicitante, depto, valor, status, prazo, prioridade, obs,
    data_abertura || atual.data_abertura,
    conclusao,
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
  const atual = db.prepare('SELECT data_abertura, data_conclusao FROM manutencao WHERE id=?').get(req.params.id);
  let conclusao;
  if (data_conclusao) conclusao = data_conclusao;
  else if (STATUS_CONCLUSAO.includes(status)) conclusao = agora();
  else conclusao = null;
  db.prepare(`
    UPDATE manutencao SET desc=?, local=?, tipo=?, resp=?, status=?, sla=?, prioridade=?, data_abertura=?, data_conclusao=?
    WHERE id=?
  `).run(desc, local, tipo, resp, status, sla, prioridade,
    data_abertura || atual.data_abertura,
    conclusao,
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
