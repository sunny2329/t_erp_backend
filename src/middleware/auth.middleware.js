const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

/**
 * Requires a valid JWT via Authorization: Bearer <token> or the auth cookie.
 * Populates req.user = { id, carrierId, roleId, loginId }
 */
function requireAuth(req, res, next) {
  const cookieName = process.env.COOKIE_NAME || 'token';
  const header = req.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearerToken || (req.cookies && req.cookies[cookieName]);

  if (!token) {
    return sendError(res, 'Authentication required', 401);
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return sendError(res, 'Invalid or expired token', 401);
  }
}

module.exports = { requireAuth };
