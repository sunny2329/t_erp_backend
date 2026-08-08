const { Pool, types } = require('pg');

// DATE (1082) and TIMESTAMP WITHOUT TIME ZONE (1114) columns carry no offset
// info — pg's default parsers convert them into JS Date objects using the
// server process's local TZ, and Date -> JSON always serializes as UTC. That
// silently shifts both the date and time by the server's UTC offset on every
// round trip (e.g. a stop's "2026-08-16 00:00" became "2026-08-15T18:30Z" on
// a UTC+5:30 box). None of these columns have real timezone semantics, so
// parse them as plain strings and let each adapter slice what it needs.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // `servername` forces the correct SNI hostname on the TLS ClientHello.
  // Without it, some hosting platforms (Render, Vercel, etc.) resolve
  // DB_HOST to a raw IP before connecting, and Supabase's Supavisor pooler
  // can't tell which tenant/project the connection is for without SNI —
  // it fails closed with "(ENOIDENTIFIER) no tenant identifier provided".
  // Harmless locally, where DNS/TLS already happens to send SNI correctly.
  ssl: String(process.env.DB_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false, servername: process.env.DB_HOST } : false
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

/**
 * Run a parameterized query. Best-effort error logging to sql_errors table
 * (never throws from the logging path itself).
 */
async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    logSqlError(text, params, err).catch(() => {});
    throw err;
  }
}

async function logSqlError(queryText, params, err) {
  try {
    await pool.query(
      `INSERT INTO sql_errors (query_text, params, error_message, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [queryText, JSON.stringify(params || []), err.message]
    );
  } catch (_) {
    // sql_errors table may not match this shape in all environments; ignore.
  }
}

/**
 * Run a callback inside a single client transaction.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
