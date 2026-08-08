const authService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  };
}

const login = asyncHandler(async (req, res) => {
  const { loginId, email, password } = req.body;
  const identifier = loginId || email;

  const { token, user } = await authService.login(identifier, password);

  res.cookie(process.env.COOKIE_NAME || 'token', token, cookieOptions());
  return sendSuccess(res, { token, user }, 'Login successful');
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(process.env.COOKIE_NAME || 'token');
  return sendSuccess(res, null, 'Logged out');
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return sendSuccess(res, user, 'Current user');
});

module.exports = { login, logout, me };
