const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Builds standard list/getById/create/update/remove controllers around a
 * simpleCrudFactory service.
 *
 * filterParams: query-param names (besides page/pageSize/search/is_active) to
 *               forward into service.list({ filters }), e.g. ['carrier_id']
 * getDefaultPayload(req): optional — returns fields merged in *before*
 *               req.body on create/update (req.body wins if it also sets
 *               them). Used for tenant-scoped fields like locations'
 *               carrier_id, which the frontend never picks — see
 *               locations.controller.js.
 */
function createSimpleCrudController(service, entityLabel, filterParams = [], getDefaultPayload = null) {
  const list = asyncHandler(async (req, res) => {
    const { page, pageSize, search, is_active } = req.query;
    const filters = {};
    for (const param of filterParams) {
      if (req.query[param] !== undefined) filters[param] = req.query[param];
    }
    const { rows, meta } = await service.list({ page: { page, pageSize }, search, filters, isActive: is_active });
    return sendSuccess(res, { rows, meta }, `${entityLabel} fetched`);
  });

  const getById = asyncHandler(async (req, res) => {
    const row = await service.getById(req.params.id);
    return sendSuccess(res, row, `${entityLabel.replace(/s$/, '')} fetched`);
  });

  const create = asyncHandler(async (req, res) => {
    const payload = getDefaultPayload ? { ...getDefaultPayload(req), ...req.body } : req.body;
    const row = await service.create(payload, req.user.id);
    return sendSuccess(res, row, `${entityLabel.replace(/s$/, '')} created`, 201);
  });

  const update = asyncHandler(async (req, res) => {
    const id = req.params.id || req.body.id;
    const payload = getDefaultPayload ? { ...getDefaultPayload(req), ...req.body } : req.body;
    const row = await service.update(id, payload, req.user.id);
    return sendSuccess(res, row, `${entityLabel.replace(/s$/, '')} updated`);
  });

  const remove = asyncHandler(async (req, res) => {
    const result = await service.remove(req.params.id);
    return sendSuccess(res, result, `${entityLabel.replace(/s$/, '')} deactivated`);
  });

  return { list, getById, create, update, remove };
}

module.exports = { createSimpleCrudController };
