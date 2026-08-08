const eventsService = require('../services/events.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const getHistory = asyncHandler(async (req, res) => {
  const history = await eventsService.getLoadHistory(req.params.loadId, req.user.carrierId);
  return sendSuccess(res, history, 'Load history fetched');
});

module.exports = { getHistory };
