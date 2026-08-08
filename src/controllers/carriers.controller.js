const carriersService = require('../services/carriers.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, search, authority_type, is_active } = req.query;
  const { rows, meta } = await carriersService.list({
    page: { page, pageSize },
    search,
    authorityType: authority_type,
    isActive: is_active
  });
  return sendSuccess(res, { rows, meta }, 'Carriers fetched');
});

const getById = asyncHandler(async (req, res) => {
  const carrier = await carriersService.getById(req.params.id);
  return sendSuccess(res, carrier, 'Carrier fetched');
});

const create = asyncHandler(async (req, res) => {
  const carrier = await carriersService.create(req.body, req.user.id);
  return sendSuccess(res, carrier, 'Carrier created', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id || req.body.id;
  const carrier = await carriersService.update(id, req.body, req.user.id);
  return sendSuccess(res, carrier, 'Carrier updated');
});

const remove = asyncHandler(async (req, res) => {
  const result = await carriersService.remove(req.params.id);
  return sendSuccess(res, result, 'Carrier deactivated');
});

module.exports = { list, getById, create, update, remove };
