const dropdownService = require('../services/dropdown.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const getTypes = asyncHandler(async (req, res) => {
  const data = await dropdownService.getTypes(req.query.type_id);
  return sendSuccess(res, data, 'Types fetched');
});

const getCities = asyncHandler(async (req, res) => {
  const data = await dropdownService.getCities(req.query.q);
  return sendSuccess(res, data, 'Cities fetched');
});

const getStates = asyncHandler(async (req, res) => {
  const data = await dropdownService.getStates();
  return sendSuccess(res, data, 'States fetched');
});

module.exports = { getTypes, getCities, getStates };
