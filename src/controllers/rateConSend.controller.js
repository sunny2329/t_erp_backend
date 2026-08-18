const pdfService = require('../services/pdf.service');
const rateConSendService = require('../services/rateConSend.service');
const eventsService = require('../services/events.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

// POST /loads/:loadId/rate-con/send — authenticated. Regenerates+saves the
// Load Confirmation PDF for the given leg (so the public link always shows
// the latest terms), then emails the carrier a link-only message.
const send = asyncHandler(async (req, res) => {
  const { loadId } = req.params;
  const { assignmentId } = req.body;

  const { load, buffer, dispatchCarrier } = await pdfService.buildLoadConfirmation(loadId, req.user.carrierId, assignmentId);
  await pdfService.persistDocument({
    loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    buffer,
    docType: pdfService.DOC_TYPE.CONFIRMATION,
    docNamePrefix: 'Load_Confirmation',
    loadNumber: load.load_number,
    assignmentId
  });

  const result = await rateConSendService.sendRateCon(load, {
    ...req.body,
    dispatchCarrierName: dispatchCarrier?.carrier_name
  });

  await eventsService.logEvent(null, {
    loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    eventTypeId: eventsService.EVENT_TYPES.RATE_CON_SENT,
    remark: `Rate confirmation sent to ${req.body.to}${dispatchCarrier ? ` (${dispatchCarrier.carrier_name})` : ''}`,
    newValue: { snapshot: { to: req.body.to, cc: req.body.cc || null, assignmentId } }
  });

  return sendSuccess(res, result, 'Rate confirmation sent');
});

module.exports = { send };
