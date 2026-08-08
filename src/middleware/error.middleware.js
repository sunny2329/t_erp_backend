const { sendError } = require('../utils/response');

function notFoundHandler(req, res) {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err && err.isAppError) {
    return sendError(res, err.message, err.statusCode);
  }

  // Postgres unique violation
  if (err && err.code === '23505') {
    return sendError(res, 'Record already exists (duplicate value)', 409);
  }

  // Postgres foreign key violation
  if (err && err.code === '23503') {
    return sendError(res, 'Related record not found or in use', 409);
  }

  // Postgres not-null violation
  if (err && err.code === '23502') {
    return sendError(res, `${err.column || 'A required field'} cannot be empty`, 400);
  }

  return sendError(res, err && err.message ? err.message : 'Internal server error', 500);
}

module.exports = { notFoundHandler, errorHandler };
