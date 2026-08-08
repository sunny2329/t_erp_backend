const usersService = require('../services/users.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, search, carrier_id, is_active } = req.query;
  const { rows, meta } = await usersService.list({
    page: { page, pageSize },
    search,
    carrierId: carrier_id,
    isActive: is_active
  });
  return sendSuccess(res, { rows, meta }, 'Users fetched');
});

const getById = asyncHandler(async (req, res) => {
  const user = await usersService.getById(req.params.id);
  return sendSuccess(res, user, 'User fetched');
});

const create = asyncHandler(async (req, res) => {
  const user = await usersService.create(req.body, req.user.id);
  return sendSuccess(res, user, 'User created', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id || req.body.id;
  const user = await usersService.update(id, req.body, req.user.id);
  return sendSuccess(res, user, 'User updated');
});

const remove = asyncHandler(async (req, res) => {
  const result = await usersService.remove(req.params.id);
  return sendSuccess(res, result, 'User deactivated');
});

module.exports = { list, getById, create, update, remove };
