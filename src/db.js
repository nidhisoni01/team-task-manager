const { Pool } = require("pg");

function buildConnectionStringFromParts(env) {
  const host = env.PGHOST;
  const user = env.PGUSER;
  const password = env.PGPASSWORD;
  const database = env.PGDATABASE;
  const port = env.PGPORT || "5432";

  if (!host || !user || !password || !database) return null;

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password
  )}@${host}:${port}/${database}`;
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.POSTGRES_CONNECTION_STRING ||
  buildConnectionStringFromParts(process.env);

if (!connectionString) {
  throw new Error(
    "Database connection is not configured. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE."
  );
}

const ssl =
  process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  connectionString,
  ssl,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Prevent concurrent initializations (watcher restarts, multi-instance, etc.).
    await client.query("SELECT pg_advisory_xact_lock(424242)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(project_id, user_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')) DEFAULT 'TODO',
        priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
        due_date TIMESTAMP NULL,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_to INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  initDb,
};
