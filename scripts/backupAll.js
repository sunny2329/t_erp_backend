// One-off: dumps every table in the public schema to a JSON file, one file
// per table, before the client-handoff data wipe (see scripts/wipeForHandoff.js).
// Not a schema backup (structure isn't changing) — just every row, so any
// table can be restored with plain INSERTs if something needs to come back.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

const OUT_DIR = process.argv[2];
if (!OUT_DIR) {
  console.error('Usage: node scripts/backupAll.js <output-dir>');
  process.exit(1);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  const tables = tablesRes.rows.map((r) => r.table_name);

  const summary = [];
  for (const table of tables) {
    const res = await pool.query(`SELECT * FROM "${table}"`);
    fs.writeFileSync(path.join(OUT_DIR, `${table}.json`), JSON.stringify(res.rows, null, 2));
    summary.push({ table, rows: res.rows.length });
  }

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.table(summary);
  console.log(`\nBackup written to ${OUT_DIR}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
