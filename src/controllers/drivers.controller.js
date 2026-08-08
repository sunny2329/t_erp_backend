const driversService = require('../services/drivers.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, search, carrier_id, is_active } = req.query;
  const { rows, meta } = await driversService.list({
    page: { page, pageSize },
    search,
    carrierId: carrier_id,
    isActive: is_active
  });
  return sendSuccess(res, { rows, meta }, 'Drivers fetched');
});

const getById = asyncHandler(async (req, res) => {
  const driver = await driversService.getById(req.params.id);
  return sendSuccess(res, driver, 'Driver fetched');
});

const create = asyncHandler(async (req, res) => {
  const driver = await driversService.create(req.body, req.user.id);
  return sendSuccess(res, driver, 'Driver created', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id || req.body.id;
  const driver = await driversService.update(id, req.body, req.user.id);
  return sendSuccess(res, driver, 'Driver updated');
});

const remove = asyncHandler(async (req, res) => {
  const result = await driversService.remove(req.params.id);
  return sendSuccess(res, result, 'Driver deactivated');
});

module.exports = { list, getById, create, update, remove };
