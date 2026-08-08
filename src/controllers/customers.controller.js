const customersService = require('../services/customers.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { page, pageSize, search, customer_type_id, carrier_id, status_id } = req.query;
  const { rows, meta } = await customersService.list({
    page: { page, pageSize },
    search,
    carrierId: carrier_id,
    customerTypeId: customer_type_id,
    statusId: status_id
  });
  return sendSuccess(res, { rows, meta }, 'Customers fetched');
});

const getById = asyncHandler(async (req, res) => {
  const customer = await customersService.getById(req.params.id);
  return sendSuccess(res, customer, 'Customer fetched');
});

const create = asyncHandler(async (req, res) => {
  // carrier_id is tenant-scoping (see SCHEMA_ASSUMPTIONS.md) — the frontend
  // never picks it, it's always the logged-in user's own carrier.
  const payload = { carrier_id: req.user.carrierId, ...req.body };
  const customer = await customersService.create(payload, req.user.id);
  return sendSuccess(res, customer, 'Customer created', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id || req.body.id;
  const payload = { carrier_id: req.user.carrierId, ...req.body };
  const customer = await customersService.update(id, payload, req.user.id);
  return sendSuccess(res, customer, 'Customer updated');
});

const remove = asyncHandler(async (req, res) => {
  const result = await customersService.remove(req.params.id);
  return sendSuccess(res, result, 'Customer deactivated');
});

module.exports = { list, getById, create, update, remove };
