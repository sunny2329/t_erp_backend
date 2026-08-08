const loadAssignmentsService = require('../services/loadAssignments.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const rows = await loadAssignmentsService.listByLoad(req.params.loadId);
  return sendSuccess(res, rows, 'Assignments fetched');
});

const create = asyncHandler(async (req, res) => {
  const row = await loadAssignmentsService.createLeg(req.params.loadId, req.body, req.user.id);
  return sendSuccess(res, row, 'Load dispatched', 201);
});

const update = asyncHandler(async (req, res) => {
  const row = await loadAssignmentsService.updateLeg(req.params.id, req.body, req.user.id);
  return sendSuccess(res, row, 'Assignment updated');
});

const remove = asyncHandler(async (req, res) => {
  await loadAssignmentsService.deleteLeg(req.params.id, req.user.id);
  return sendSuccess(res, null, 'Assignment removed');
});

const checkConflicts = asyncHandler(async (req, res) => {
  const result = await loadAssignmentsService.checkConflicts(req.params.loadId, req.body);
  return sendSuccess(res, result, 'Conflict check complete');
});

module.exports = { list, create, update, remove, checkConflicts };
