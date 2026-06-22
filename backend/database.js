const Database = require('better-sqlite3');
const db = new Database('central.db');

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
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT DEFAULT 'admin'
  );

  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('compras', 0);
  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('manutencao', 0);
  INSERT OR IGNORE INTO contadores (modulo, ultimo) VALUES ('links_chamados', 0);
`);

module.exports = db;
