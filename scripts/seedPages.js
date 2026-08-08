/* Seeds the `pages` table with one row per frontend page/route, then grants
 * the admin carrier_user full (add/edit/delete) access to every page via
 * user_roles. Safe to run once — aborts if pages already has rows. */
require('dotenv').config();
const { pool } = require('../src/config/database');

const PAGES = [
  { title: 'Dashboard', route: '/dashboard', group_name: 'Overview', page_icon: 'LayoutDashboard', has_add: false, has_edit: false, has_delete: false },
  { title: 'Loads', route: '/loads', group_name: 'Dispatch Ops', page_icon: 'Package', has_add: true, has_edit: true, has_delete: false },
  { title: 'Dispatch', route: '/dispatch', group_name: 'Dispatch Ops', page_icon: 'Radio', has_add: false, has_edit: false, has_delete: false },
  { title: 'Customers', route: '/customers', group_name: 'CRM', page_icon: 'Building2', has_add: true, has_edit: true, has_delete: false },
  { title: 'Carriers', route: '/carriers', group_name: 'Fleet', page_icon: 'Truck', has_add: true, has_edit: true, has_delete: true },
  { title: 'Drivers', route: '/drivers', group_name: 'Fleet', page_icon: 'UserRound', has_add: true, has_edit: true, has_delete: true },
  { title: 'Vehicles', route: '/vehicles', group_name: 'Fleet', page_icon: 'CarFront', has_add: true, has_edit: true, has_delete: true },
  { title: 'Trailers', route: '/trailers', group_name: 'Fleet', page_icon: 'Container', has_add: true, has_edit: true, has_delete: true },
  { title: 'Locations', route: '/locations', group_name: 'Network', page_icon: 'MapPin', has_add: true, has_edit: true, has_delete: false },
  { title: 'Terminals', route: '/terminals', group_name: 'Network', page_icon: 'Warehouse', has_add: true, has_edit: true, has_delete: true },
  { title: 'Users', route: '/users', group_name: 'Admin', page_icon: 'UsersRound', has_add: true, has_edit: true, has_delete: true },
];

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int AS c FROM pages');
  if (existing.rows[0].c > 0) {
    console.log('pages already has rows — aborting to avoid double-seeding.');
    process.exit(1);
  }

  const admin = await pool.query(`SELECT id FROM carrier_users WHERE user_name = 'admin' LIMIT 1`);
  if (!admin.rows[0]) {
    console.log('No admin carrier_user found — run scripts/seed.js first.');
    process.exit(1);
  }
  const adminId = admin.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pageIds = [];
    for (const p of PAGES) {
      const r = await client.query(
        `INSERT INTO pages (title, route, group_name, page_icon, has_add, has_edit, has_delete, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
        [p.title, p.route, p.group_name, p.page_icon, p.has_add, p.has_edit, p.has_delete]
      );
      pageIds.push({ id: r.rows[0].id, title: p.title });
    }

    for (const { id: pageId } of pageIds) {
      await client.query(
        `INSERT INTO user_roles (userid, page_id, allow_add, allow_edit, allow_delete, aduserid, addtime)
         VALUES ($1,$2,true,true,true,$1,NOW())`,
        [adminId, pageId]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${pageIds.length} pages and granted full access to admin (carrier_users.id=${adminId}).`);
    console.table(pageIds);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
