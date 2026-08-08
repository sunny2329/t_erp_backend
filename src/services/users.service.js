const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');

/**
 * carrier_users: password is bcrypt-hashed into the `password` column and never
 * returned. Per-page permissions live in user_roles (userid, page_id, allow_add,
 * allow_edit, allow_delete) joined against pages — there is no single role_id/
 * role_name on this schema, it's a per-user page-permission matrix.
 */

const USER_COLUMNS = [
  'carrier_id',
  'full_name',
  'isd_code',
  'mobileno',
  'user_name',
  'user_email',
  'is_active',
  'is_blocked',
  'force_logout',
  'user_type'
];

const SAFE_COLUMNS = `id, carrier_id, full_name, isd_code, mobileno, user_name, user_email,
                       is_active, is_blocked, force_logout, is_login, last_login_dt, user_type,
                       failed_login_count`;

async function fetchPermissions(userId) {
  const result = await query(
    `SELECT ur.id, ur.page_id, ur.allow_add, ur.allow_edit, ur.allow_delete,
            p.title, p.route, p.group_name
       FROM user_roles ur
       JOIN pages p ON p.id = ur.page_id
      WHERE ur.userid = $1
      ORDER BY p.group_name, p.title`,
    [userId]
  );
  return result.rows;
}

async function replacePermissions(client, userId, permissions, adderId) {
  await client.query('DELETE FROM user_roles WHERE userid = $1', [userId]);

  if (!Array.isArray(permissions) || permissions.length === 0) return [];

  const inserted = [];
  for (const perm of permissions) {
    if (!perm.page_id) {
      throw new AppError('Each permission entry requires a page_id', 400);
    }
    const result = await client.query(
      `INSERT INTO user_roles (userid, page_id, allow_add, allow_edit, allow_delete, aduserid, addtime)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING *`,
      [
        userId,
        perm.page_id,
        perm.allow_add === undefined ? false : perm.allow_add,
        perm.allow_edit === undefined ? false : perm.allow_edit,
        perm.allow_delete === undefined ? false : perm.allow_delete,
        adderId
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function list({ page, search, carrierId, isActive }) {
  const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
  const params = [];
  const conditions = [];

  if (isActive === undefined) {
    conditions.push('is_active = true');
  } else if (isActive !== 'all') {
    params.push(isActive === 'true' || isActive === true);
    conditions.push(`is_active = $${params.length}`);
  }

  if (carrierId) {
    params.push(carrierId);
    conditions.push(`carrier_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(full_name ILIKE $${params.length} OR user_email ILIKE $${params.length} OR user_name ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM carrier_users ${whereClause}`,
    params
  );
  const totalCount = countResult.rows[0].count;

  let sql = `SELECT ${SAFE_COLUMNS} FROM carrier_users ${whereClause} ORDER BY full_name`;
  if (!pagination.all) {
    params.push(pagination.limit, pagination.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  return { rows: result.rows, meta: buildPageMeta(pagination, totalCount) };
}

async function getById(id) {
  const result = await query(`SELECT ${SAFE_COLUMNS} FROM carrier_users WHERE id = $1`, [id]);
  const user = result.rows[0];
  if (!user) {
    throw new AppError('User not found', 404);
  }
  const permissions = await fetchPermissions(id);
  return { ...user, permissions };
}

function validateCreatePayload(payload) {
  if (!payload.full_name) {
    throw new AppError('full_name is required', 400);
  }
  if (!payload.user_name && !payload.user_email) {
    throw new AppError('user_name or user_email is required', 400);
  }
  if (!payload.password) {
    throw new AppError('password is required', 400);
  }
}

async function create(payload, userId) {
  validateCreatePayload(payload);
  const passwordHash = await bcrypt.hash(payload.password, 10);

  const newUserId = await withTransaction(async (client) => {
    const user = await insertRow(
      client,
      { table: 'carrier_users', columns: [...USER_COLUMNS, 'password'] },
      { ...payload, password: passwordHash },
      userId
    );
    if (payload.permissions !== undefined) {
      await replacePermissions(client, user.id, payload.permissions, userId);
    }
    return user.id;
  });

  return getById(newUserId);
}

async function update(id, payload, userId) {
  await getById(id);

  await withTransaction(async (client) => {
    let columns = USER_COLUMNS;
    let updatePayload = payload;
    if (payload.password) {
      const passwordHash = await bcrypt.hash(payload.password, 10);
      columns = [...USER_COLUMNS, 'password'];
      updatePayload = { ...payload, password: passwordHash };
    }
    await updateRow(client, { table: 'carrier_users', columns }, id, updatePayload, userId);
    if (payload.permissions !== undefined) {
      await replacePermissions(client, id, payload.permissions, userId);
    }
  });

  return getById(id);
}

async function remove(id) {
  const result = await query('UPDATE carrier_users SET is_active = false WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) {
    throw new AppError('User not found', 404);
  }
  return { id };
}

module.exports = { list, getById, create, update, remove };
