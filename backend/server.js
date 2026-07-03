const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Usuários padrão criados na inicialização se não existirem
const usuariosPadrao = [
  { nome: 'Administrador', email: 'admin@sistema.com', senha: 'admin123', perfil: 'admin' },
  { nome: 'Marcos Araújo', email: 'marcos.araujo@colegioser.com', senha: 'Marcos@2007', perfil: 'admin' },
];

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'central-ti-secret-2024',
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

// Rotas async precisam repassar erros ao Express manualmente
const ah = fn => (req, res, next) => fn(req, res, next).catch(next);

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

app.post('/api/login', ah(async (req, res) => {
  const { email, senha } = req.body;
  const user = await db.get('SELECT * FROM usuarios WHERE email = $1', [email]);
  if (!user || !bcrypt.compareSync(senha, user.senha)) {
    return res.status(401).json({ erro: 'Email ou senha incorretos' });
  }
  req.session.usuario = { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil };
  res.json({ ok: true, nome: user.nome });
}));

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

// Gera próximo ID sequencial para um módulo (atômico no Postgres)
async function proximoId(modulo, prefixo) {
  const row = await db.get('UPDATE contadores SET ultimo = ultimo + 1 WHERE modulo = $1 RETURNING ultimo', [modulo]);
  const proximo = row.ultimo;
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
app.post('/api/compras/importar', autenticado, upload.single('arquivo'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  try {
    const result = await importarPlanilha(req.file.buffer, 'compras');
    res.json(result);
  } catch(e) {
    res.status(400).json({ erro: 'Arquivo inválido: ' + e.message });
  }
}));

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
app.post('/api/manutencao/importar', autenticado, upload.single('arquivo'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  try {
    const result = await importarPlanilha(req.file.buffer, 'manutencao');
    res.json(result);
  } catch(e) {
    res.status(400).json({ erro: 'Arquivo inválido: ' + e.message });
  }
}));

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

async function importarPlanilha(buffer, moduloFiltro) {
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
        const { id, numero } = await proximoId('compras', 'PC');
        await db.run(`INSERT INTO compras (id,numero,"desc",solicitante,depto,valor,status,prazo,prioridade,obs,data_abertura,data_conclusao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, numero, descFinal, solicitante||'—', setor||'—', 0, status, '—', prioridade,
            String(r['Observação']||r['Observacao']||r['Observações']||''), dataAbertura, dataConclusao]);
      } else {
        const status = mapStatus(r['Status'], 'manutencao');
        const { id, numero } = await proximoId('manutencao', 'MNT');
        await db.run(`INSERT INTO manutencao (id,numero,"desc",local,tipo,resp,status,sla,prioridade,data_abertura,data_conclusao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, numero, descFinal, setor||'—', assunto||'Geral', solicitante||'—',
            status, '—', prioridade, dataAbertura, dataConclusao]);
      }
      importados++;
    } catch(e) { erros.push(`Erro em "${descFinal}": ${e.message}`); }
  }
  return { ok: true, importados, erros };
}

// ============================================================
// COMPRAS
// ============================================================
app.get('/api/compras', autenticado, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM compras ORDER BY numero DESC'));
}));

app.post('/api/compras', autenticado, ah(async (req, res) => {
  const { desc, solicitante, depto, valor, prazo, prioridade, obs, status } = req.body;
  const { id, numero } = await proximoId('compras', 'PC');
  await db.run(`
    INSERT INTO compras (id, numero, "desc", solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, null)
  `, [id, numero, desc, solicitante, depto, valor, status||'Pendente', prazo, prioridade, obs, agora()]);
  res.json({ ok: true, id });
}));

app.put('/api/compras/:id', autenticado, ah(async (req, res) => {
  const { desc, solicitante, depto, valor, status, prazo, prioridade, obs, data_abertura, data_conclusao } = req.body;
  const atual = await db.get('SELECT data_abertura, data_conclusao FROM compras WHERE id=$1', [req.params.id]);
  let conclusao;
  if (data_conclusao) conclusao = data_conclusao;
  else if (STATUS_CONCLUSAO.includes(status)) conclusao = agora();
  else conclusao = null;
  await db.run(`
    UPDATE compras SET "desc"=$1, solicitante=$2, depto=$3, valor=$4, status=$5, prazo=$6, prioridade=$7, obs=$8, data_abertura=$9, data_conclusao=$10
    WHERE id=$11
  `, [desc, solicitante, depto, valor, status, prazo, prioridade, obs,
    data_abertura || atual.data_abertura,
    conclusao,
    req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/compras/:id', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  await db.run('DELETE FROM compras WHERE id=$1', [req.params.id]);
  await db.run('DELETE FROM comentarios WHERE modulo=$1 AND chamado_id=$2', ['compras', req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// MANUTENÇÃO
// ============================================================
app.get('/api/manutencao', autenticado, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM manutencao ORDER BY numero DESC'));
}));

app.post('/api/manutencao', autenticado, ah(async (req, res) => {
  const { desc, local, tipo, resp, sla, prioridade, status } = req.body;
  const { id, numero } = await proximoId('manutencao', 'MNT');
  await db.run(`
    INSERT INTO manutencao (id, numero, "desc", local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, null)
  `, [id, numero, desc, local, tipo, resp, status||'Aberto', sla, prioridade, agora()]);
  res.json({ ok: true, id });
}));

app.put('/api/manutencao/:id', autenticado, ah(async (req, res) => {
  const { desc, local, tipo, resp, status, sla, prioridade, data_abertura, data_conclusao } = req.body;
  const atual = await db.get('SELECT data_abertura, data_conclusao FROM manutencao WHERE id=$1', [req.params.id]);
  let conclusao;
  if (data_conclusao) conclusao = data_conclusao;
  else if (STATUS_CONCLUSAO.includes(status)) conclusao = agora();
  else conclusao = null;
  await db.run(`
    UPDATE manutencao SET "desc"=$1, local=$2, tipo=$3, resp=$4, status=$5, sla=$6, prioridade=$7, data_abertura=$8, data_conclusao=$9
    WHERE id=$10
  `, [desc, local, tipo, resp, status, sla, prioridade,
    data_abertura || atual.data_abertura,
    conclusao,
    req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/manutencao/:id', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  await db.run('DELETE FROM manutencao WHERE id=$1', [req.params.id]);
  await db.run('DELETE FROM comentarios WHERE modulo=$1 AND chamado_id=$2', ['manutencao', req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// LINKS
// ============================================================
app.get('/api/links', autenticado, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM links'));
}));

app.put('/api/links/:id', autenticado, ah(async (req, res) => {
  const { latencia, uptime, status, ultima } = req.body;
  await db.run('UPDATE links SET latencia=$1, uptime=$2, status=$3, ultima=$4 WHERE id=$5',
    [latencia, uptime, status, ultima, req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// CHAMADOS DE LINK
// ============================================================
app.get('/api/links-chamados', autenticado, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM links_chamados ORDER BY numero DESC'));
}));

app.post('/api/links-chamados', autenticado, ah(async (req, res) => {
  const { linkId, linkNome, tipo, desc, resp, prioridade } = req.body;
  const { id, numero } = await proximoId('links_chamados', 'LCH');
  await db.run(`
    INSERT INTO links_chamados (id, numero, "linkId", "linkNome", tipo, "desc", resp, prioridade, status, data_abertura, data_conclusao)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, 'Aberto', $9, null)
  `, [id, numero, linkId, linkNome, tipo, desc, resp, prioridade, agora()]);
  res.json({ ok: true, id });
}));

app.put('/api/links-chamados/:id', autenticado, ah(async (req, res) => {
  const { status, data_conclusao } = req.body;
  const conclusao = data_conclusao || (STATUS_CONCLUSAO.includes(status) ? agora() : null);
  await db.run('UPDATE links_chamados SET status=$1, data_conclusao=$2 WHERE id=$3',
    [status, conclusao, req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// COMENTÁRIOS
// ============================================================
app.get('/api/comentarios/:modulo/:id', autenticado, ah(async (req, res) => {
  const rows = await db.all(
    'SELECT * FROM comentarios WHERE modulo=$1 AND chamado_id=$2 ORDER BY id ASC',
    [req.params.modulo, req.params.id]);
  res.json(rows);
}));

app.post('/api/comentarios/:modulo/:id', autenticado, ah(async (req, res) => {
  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto obrigatório' });
  await db.run(
    'INSERT INTO comentarios (modulo, chamado_id, usuario_nome, texto, data) VALUES ($1,$2,$3,$4,$5)',
    [req.params.modulo, req.params.id, req.session.usuario.nome, texto.trim(), agora()]);
  res.json({ ok: true });
}));

// ============================================================
// USUÁRIOS
// ============================================================
app.get('/api/usuarios', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  res.json(await db.all('SELECT id, nome, email, perfil FROM usuarios'));
}));

app.post('/api/usuarios', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  const { nome, email, senha, perfil } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios' });
  const existe = await db.get('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });
  const hash = bcrypt.hashSync(senha, 10);
  await db.run('INSERT INTO usuarios (nome, email, senha, perfil) VALUES ($1,$2,$3,$4)', [nome, email, hash, perfil || 'usuario']);
  res.json({ ok: true });
}));

app.put('/api/usuarios/:id', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  const { nome, email, senha, perfil } = req.body;
  if (senha) {
    const hash = bcrypt.hashSync(senha, 10);
    await db.run('UPDATE usuarios SET nome=$1, email=$2, senha=$3, perfil=$4 WHERE id=$5', [nome, email, hash, perfil, req.params.id]);
  } else {
    await db.run('UPDATE usuarios SET nome=$1, email=$2, perfil=$3 WHERE id=$4', [nome, email, perfil, req.params.id]);
  }
  res.json({ ok: true });
}));

app.delete('/api/usuarios/:id', autenticado, ah(async (req, res) => {
  if (req.session.usuario.perfil !== 'admin') return res.status(403).json({ erro: 'Sem permissão' });
  if (Number(req.params.id) === req.session.usuario.id) return res.status(400).json({ erro: 'Não pode excluir a si mesmo' });
  await db.run('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Tratador de erros das rotas async
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;

async function iniciar() {
  await db.init();

  // Popula banco automaticamente se estiver vazio
  const total = (await db.get('SELECT COUNT(*)::int AS n FROM compras')).n;
  if (total === 0) {
    await require('./seed')();
  }

  // Cria usuários padrão se não existirem
  for (const u of usuariosPadrao) {
    const existe = await db.get('SELECT id FROM usuarios WHERE email = $1', [u.email]);
    if (!existe) {
      const hash = bcrypt.hashSync(u.senha, 10);
      await db.run('INSERT INTO usuarios (nome, email, senha, perfil) VALUES ($1,$2,$3,$4)', [u.nome, u.email, hash, u.perfil]);
    }
  }

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

iniciar().catch(e => {
  console.error('Erro ao iniciar o servidor:', e);
  process.exit(1);
});
