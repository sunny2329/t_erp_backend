const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { signToken } = require('../utils/jwt');
const { AppError } = require('../utils/AppError');

/**
 * A row here means "this user can see this page" — allow_add/edit/delete are
 * finer-grained action flags *within* that page, not a separate view flag
 * (user_roles has no allow_view column; presence of the row is the view grant).
 */
async function fetchPermissions(userId) {
  try {
    const result = await query(
      `SELECT ur.page_id, ur.allow_add, ur.allow_edit, ur.allow_delete,
              p.title, p.route, p.group_name
         FROM user_roles ur
         JOIN pages p ON p.id = ur.page_id
        WHERE ur.userid = $1 AND p.is_active = true
        ORDER BY p.group_name, p.title`,
      [userId]
    );
    return result.rows;
  } catch (_) {
    // Login/me should still succeed even if the permission join fails for any reason.
    return [];
  }
}

async function login(loginId, password) {
  if (!loginId || !password) {
    throw new AppError('user_name/email and password are required', 400);
  }

  const result = await query(
    `SELECT id, carrier_id, full_name, user_name, user_email, password,
            is_active, is_blocked, user_type
       FROM carrier_users
      WHERE user_name = $1 OR user_email = $1
      LIMIT 1`,
    [loginId]
  );

  const user = result.rows[0];
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }
  if (user.is_active === false) {
    throw new AppError('This account is inactive', 403);
  }
  if (user.is_blocked) {
    throw new AppError('This account is blocked', 403);
  }

  const passwordOk = await bcrypt.compare(password, user.password || '');
  if (!passwordOk) {
    throw new AppError('Invalid credentials', 401);
  }

  const permissions = await fetchPermissions(user.id);

  // Kept compact on purpose — just enough to authorize a request without a
  // DB round trip. The richer joined shape (title/route/group_name) goes in
  // the JSON response body below, not the token itself.
  const tokenPayload = {
    id: user.id,
    carrierId: user.carrier_id,
    userType: user.user_type,
    userName: user.user_name,
    permissions: permissions.map((p) => ({
      page_id: p.page_id,
      allow_add: p.allow_add,
      allow_edit: p.allow_edit,
      allow_delete: p.allow_delete
    }))
  };
  const token = signToken(tokenPayload);

  await query(
    `UPDATE carrier_users SET last_login_dt = NOW(), is_login = true, failed_login_count = 0 WHERE id = $1`,
    [user.id]
  ).catch(() => {});

  const { password: _password, ...safeUser } = user;
  return { token, user: { ...safeUser, permissions } };
}

async function getMe(userId) {
  const result = await query(
    `SELECT id, carrier_id, full_name, user_name, user_email, isd_code, mobileno,
            is_active, is_blocked, user_type, last_login_dt
       FROM carrier_users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const permissions = await fetchPermissions(userId);
  return { ...user, permissions };
}

module.exports = { login, getMe };
