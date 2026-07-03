const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL não definida. Configure a variável de ambiente com a string de conexão do Postgres (ex.: Neon).');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

async function run(sql, params = []) { return pool.query(sql, params); }
async function all(sql, params = []) { return (await pool.query(sql, params)).rows; }
async function get(sql, params = []) { return (await pool.query(sql, params)).rows[0]; }

// Cria as tabelas se não existirem. "desc", "linkId" e "linkNome" precisam de
// aspas no Postgres (palavra reservada / preservação de maiúsculas).
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contadores (
      modulo TEXT PRIMARY KEY,
      ultimo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS compras (
      id TEXT PRIMARY KEY,
      numero INTEGER,
      "desc" TEXT,
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
      "desc" TEXT,
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
      "linkId" TEXT,
      "linkNome" TEXT,
      tipo TEXT,
      "desc" TEXT,
      resp TEXT,
      prioridade TEXT,
      status TEXT,
      data_abertura TEXT,
      data_conclusao TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      perfil TEXT DEFAULT 'usuario'
    );

    CREATE TABLE IF NOT EXISTS comentarios (
      id SERIAL PRIMARY KEY,
      modulo TEXT NOT NULL,
      chamado_id TEXT NOT NULL,
      usuario_nome TEXT NOT NULL,
      texto TEXT NOT NULL,
      data TEXT NOT NULL
    );

    INSERT INTO contadores (modulo, ultimo) VALUES ('compras', 0) ON CONFLICT (modulo) DO NOTHING;
    INSERT INTO contadores (modulo, ultimo) VALUES ('manutencao', 0) ON CONFLICT (modulo) DO NOTHING;
    INSERT INTO contadores (modulo, ultimo) VALUES ('links_chamados', 0) ON CONFLICT (modulo) DO NOTHING;
  `);
}

module.exports = { pool, run, all, get, init };
