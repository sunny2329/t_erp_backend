// One-off client-handoff reset: deletes every business/transactional record,
// keeping only carrier_users id=8 (admin/admin@youngs.com) and its carrier
// (id=8, "Youngs Company Fleet") — plus the reference tables the app can't
// run without (type_master, pages) and that admin's own user_roles rows.
// A full JSON backup of every table must exist before this runs — see
// scripts/backupAll.js. Order matters: children are deleted before the
// parents they reference (most FKs here are ON DELETE NO ACTION, not
// CASCADE), and carrier_users/carriers are trimmed last so nothing still
// points at the rows being removed when they go.
require('dotenv').config();
const { pool, withTransaction } = require('../src/config/database');

const KEEP_CARRIER_USER_ID = 8;
const KEEP_CARRIER_ID = 8;

const FULL_WIPE_TABLES_IN_ORDER = [
  'load_assignments',
  'load_stops',
  'loads',
  'driver_vehicle_mapping',
  'driver_contact',
  'driver_payables',
  'driver_team',
  'driver_team_rate_card',
  'driver_rate_card',
  'driver_endorsements',
  'driver_details_extended',
  'driver_timing',
  'drivers',
  'customer_billing',
  'customer_contacts',
  'customer_invoice_docs',
  'customers',
  'documents',
  'notes',
  'events',
  'carrier_cargo_insurance',
  'carrier_certification',
  'carrier_contacts',
  'carrier_dispatch',
  'carrier_factoring',
  'carrier_liability',
  'carrier_settlement',
  'carrier_smtp_settings',
  'carrier_details',
  'carrier_user_log',
  'vehicles',
  'trailers',
  'locations',
  'terminal',
];

async function main() {
  await withTransaction(async (client) => {
    for (const table of FULL_WIPE_TABLES_IN_ORDER) {
      const res = await client.query(`DELETE FROM "${table}"`);
      console.log(`DELETE FROM ${table}: ${res.rowCount} rows`);
    }

    const roles = await client.query('DELETE FROM user_roles WHERE userid != $1', [KEEP_CARRIER_USER_ID]);
    console.log(`DELETE FROM user_roles (except admin): ${roles.rowCount} rows`);

    const users = await client.query('DELETE FROM carrier_users WHERE id != $1', [KEEP_CARRIER_USER_ID]);
    console.log(`DELETE FROM carrier_users (except admin): ${users.rowCount} rows`);

    const carriers = await client.query('DELETE FROM carriers WHERE id != $1', [KEEP_CARRIER_ID]);
    console.log(`DELETE FROM carriers (except Youngs Company Fleet): ${carriers.rowCount} rows`);
  });

  console.log('\nDone. type_master and pages were left untouched.');
  await pool.end();
}

main().catch((err) => {
  console.error('Wipe failed — transaction rolled back:', err);
  process.exit(1);
});
