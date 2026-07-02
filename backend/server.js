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
    const result = importarPlanilha(req.file.buffer, 'compras');
    res.json(result);
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
    const result = importarPlanilha(req.file.buffer, 'manutencao');
    res.json(result);
  } catch(e) {
    res.status(400).json({ erro: 'Arquivo inválido: ' + e.message });
  }
});

function formatarData(val) {
  if (!val) return null;
  // Excel date serial number
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy} 00:00`;
  }
  if (val instanceof Date) {
    const dd = String(val.getDate()).padStart(2,'0');
    const mm = String(val.getMonth()+1).padStart(2,'0');
    return `${dd}/${mm}/${val.getFullYear()} 00:00`;
  }
  // Already a string like "15/06/2026"
  return String(val).trim() || null;
}

function mapStatus(val, modulo) {
  const s = String(val||'').trim().toLowerCase();
  if (modulo === 'compras') {
    if (s === 'em aberto' || s === 'aberto' || s === 'pendente') return 'Pendente';
    if (s === 'concluído' || s === 'concluido' || s === 'entregue') return 'Entregue';
    if (s === 'em andamento' || s === 'em cotação' || s === 'cotação') return 'Em cotação';
    if (s === 'cancelado') return 'Cancelado';
    if (s === 'aprovado') return 'Aprovado';
    return 'Pendente';
  } else {
    if (s === 'em aberto' || s === 'aberto') return 'Aberto';
    if (s === 'concluído' || s === 'concluido') return 'Concluído';
    if (s === 'em andamento') return 'Em andamento';
    if (s === 'crítico' || s === 'critico') return 'Crítico';
    if (s === 'cancelado') return 'Cancelado';
    return 'Aberto';
  }
}

function mapPrioridade(val) {
  const p = String(val||'').trim().toLowerCase();
  if (p === 'alta' || p === 'high') return 'Alta';
  if (p === 'baixa' || p === 'low') return 'Baixa';
  return 'Média';
}

function importarPlanilha(buffer, moduloFiltro) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Detecta a linha do cabeçalho procurando por "Descrição" ou "Solicitante"
  const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:J100');
  let headerRow = 0;
  for (let r = ref.s.r; r <= Math.min(ref.s.r + 10, ref.e.r); r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({r, c})];
      const v = cell ? String(cell.v||'').trim() : '';
      if (v === 'Descrição' || v === 'Solicitante' || v === 'Descricao') {
        headerRow = r;
        break;
      }
    }
    if (headerRow) break;
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow });
  let importados = 0, erros = [];

  for (const r of rows) {
    const desc = String(r['Descrição'] || r['Descricao'] || r['desc'] || '').trim();
    const solicitante = String(r['Solicitante'] || '').trim();
    const setor = String(r['Setor Responsável'] || r['Setor'] || r['Departamento'] || '').trim().toLowerCase();
    const assunto = String(r['Assunto'] || '').trim();

    // Pula linhas vazias ou de exemplo
    if (!desc && !assunto) continue;
    if (solicitante.toLowerCase() === 'exemplo') continue;

    const descFinal = desc || assunto;
    const prioridade = mapPrioridade(r['Prioridade']);
    const dataAbertura = formatarData(r['Data Abertura']) || agora();
    const dataConclusao = formatarData(r['Data Conclusão'] || r['Data Conclusao']) || null;

    // Determina se é compras ou manutenção pelo setor
    const isManut = setor.includes('manut') || setor.includes('elétric') || setor.includes('eletric') || setor.includes('hidraul') || setor.includes('civil');
    const isCompras = setor.includes('compra') || setor.includes('ti') || setor.includes('financ') || setor.includes('admin');
    const moduloDetectado = isManut ? 'manutencao' : 'compras';

    if (moduloDetectado !== moduloFiltro && setor !== '') {
      // Se o setor não bate com o módulo, tenta aceitar se for ambíguo
      if (isManut && moduloFiltro === 'compras') { erros.push(`"${descFinal}" é Manutenção — importe pela página de Manutenção`); continue; }
      if (isCompras && moduloFiltro === 'manutencao') { erros.push(`"${descFinal}" é Compras — importe pela página de Compras`); continue; }
    }

    try {
      if (moduloFiltro === 'compras') {
        const status = mapStatus(r['Status'], 'compras');
        const { id, numero } = proximoId('compras', 'PC');
        db.prepare(`INSERT INTO compras (id,numero,desc,solicitante,depto,valor,status,prazo,prioridade,obs,data_abertura,data_conclusao)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id, numero, descFinal, solicitante||'—', setor||'—', 0, status, '—', prioridade,
            String(r['Observação']||r['Observacao']||r['Observações']||''), dataAbertura, dataConclusao);
      } else {
        const status = mapStatus(r['Status'], 'manutencao');
        const { id, numero } = proximoId('manutencao', 'MNT');
        db.prepare(`INSERT INTO manutencao (id,numero,desc,local,tipo,resp,status,sla,prioridade,data_abertura,data_conclusao)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id, numero, descFinal, setor||'—', assunto||'Geral', solicitante||'—',
            status, '—', prioridade, dataAbertura, dataConclusao);
      }
      importados++;
    } catch(e) { erros.push(`Erro em "${descFinal}": ${e.message}`); }
  }
  return { ok: true, importados, erros };
}

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
// COMENTÁRIOS
// ============================================================
app.get('/api/comentarios/:modulo/:id', autenticado, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM comentarios WHERE modulo=? AND chamado_id=? ORDER BY id ASC'
  ).all(req.params.modulo, req.params.id);
  res.json(rows);
});

app.post('/api/comentarios/:modulo/:id', autenticado, (req, res) => {
  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto obrigatório' });
  db.prepare(
    'INSERT INTO comentarios (modulo, chamado_id, usuario_nome, texto, data) VALUES (?,?,?,?,?)'
  ).run(req.params.modulo, req.params.id, req.session.usuario.nome, texto.trim(), agora());
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
