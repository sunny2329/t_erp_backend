const erateService = require('../services/erate.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/AppError');

// Public (no auth) — the token in the URL IS the credential, matching the
// reference project's public rate-confirm link.
const getErate = asyncHandler(async (req, res) => {
  const data = await erateService.getPublicErate(req.params.token);
  return sendSuccess(res, data, 'E-rate fetched');
});

const updateErate = asyncHandler(async (req, res) => {
  const { assignmentId, status, driverName, driverPhone, vehicleNo, trailerNo } = req.body;
  if (!assignmentId) throw new AppError('assignmentId is required', 400);
  if (status !== 'accept' && status !== 'reject') throw new AppError('status must be accept or reject', 400);

  const row = await erateService.updateErate(req.params.token, assignmentId, {
    status, driverName, driverPhone, vehicleNo, trailerNo
  });
  return sendSuccess(res, row, status === 'accept' ? 'Accepted' : 'Rejected');
});

module.exports = { getErate, updateErate };
