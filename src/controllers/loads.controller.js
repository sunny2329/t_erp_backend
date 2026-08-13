const loadsService = require('../services/loads.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

// Loads are visible across all carriers — every logged-in user sees every
// load regardless of which carrier_id it (or they) belong to, unlike every
// other module in this API (customers/locations/terminals/etc are all
// carrier-scoped). Deliberate: carrier_id here is per-load ownership
// metadata, not a tenant boundary.
const list = asyncHandler(async (req, res) => {
  const { page, pageSize, search } = req.query;
  const { rows, meta } = await loadsService.list({
    page: { page, pageSize },
    search
  });
  return sendSuccess(res, { rows, meta }, 'Loads fetched');
});

const getById = asyncHandler(async (req, res) => {
  const load = await loadsService.getById(req.params.id);
  return sendSuccess(res, load, 'Load fetched');
});

const create = asyncHandler(async (req, res) => {
  // carrier_id is tenant-scoping — never picked by the frontend, always the
  // logged-in user's own carrier (matches Customers/Locations/Terminals).
  const payload = { carrier_id: req.user.carrierId, ...req.body };
  const load = await loadsService.create(payload, req.user.id);
  return sendSuccess(res, load, 'Load created', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = req.params.id || req.body.id;
  const payload = { carrier_id: req.user.carrierId, ...req.body };
  const load = await loadsService.update(id, payload, req.user.id);
  return sendSuccess(res, load, 'Load updated');
});

module.exports = { list, getById, create, update };
