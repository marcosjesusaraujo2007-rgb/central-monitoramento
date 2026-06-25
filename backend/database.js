const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'central.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS contadores (
    modulo TEXT PRIMARY KEY,
    ultimo INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS compras (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    desc TEXT,
    solicitante TEXT,
    depto TEXT,
    valor REAL,
    status TEXT,
    prazo TEXT,
    prioridade TEXT,
    obs TEXT,
    data_abertura TEXT,
    data_conclusao TEXT
  );

  CREATE TABLE IF NOT EXISTS manutencao (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    desc TEXT,
    local TEXT,
    tipo TEXT,
    resp TEXT,
    status TEXT,
    sla TEXT,
    prioridade TEXT,
    data_abertura TEXT,
    data_conclusao TEXT
  );

  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    nome TEXT,
    tipo TEXT,
    ip TEXT,
    velocidade TEXT,
    latencia REAL,
    uptime REAL,
    status TEXT,
    ultima TEXT
  );

  CREATE TABLE IF NOT EXISTS links_chamados (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    linkId TEXT,
    linkNome TEXT,
    tipo TEXT,
    desc TEXT,
    resp TEXT,
    prioridade TEXT,
    status TEXT,
    data_abertura TEXT,
    data_conclusao TEXT
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT DEFAULT 'usuario'
  );


  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('compras', 0);
  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('manutencao', 0);
  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('links_chamados', 0);
`);

// Migração: se tabela usuarios ainda tem coluna 'usuario', recria com 'email'
const colunas = db.prepare("PRAGMA table_info(usuarios)").all().map(c => c.name);
if (colunas.includes('usuario')) {
  db.exec('DROP TABLE usuarios');
  db.exec(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT DEFAULT 'usuario'
  )`);
}

module.exports = db;
