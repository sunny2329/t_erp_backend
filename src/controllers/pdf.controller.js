const pdfService = require('../services/pdf.service');
const { asyncHandler } = require('../utils/asyncHandler');

// ?view_only=true skips the documents-row save — used when the frontend just
// wants to preview a PDF without cluttering the load's Documents list with a
// new row on every click (matches the reference project's view_only flag).
function isViewOnly(req) {
  return String(req.query.view_only).toLowerCase() === 'true';
}

function streamPdf(res, buffer, filename) {
  res.status(200);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length
  });
  return res.end(buffer);
}

const customerConfirmation = asyncHandler(async (req, res) => {
  const { loadId } = req.params;
  const { buffer, load } = await pdfService.buildCustomerConfirmation(loadId, req.user.carrierId);

  let docUrl = null;
  if (!isViewOnly(req)) {
    const doc = await pdfService.persistDocument({
      loadId,
      carrierId: req.user.carrierId,
      userId: req.user.id,
      buffer,
      docType: pdfService.DOC_TYPE.CONFIRMATION,
      docNamePrefix: 'Customer_Confirmation',
      loadNumber: load.load_number
    });
    docUrl = doc.doc_url;
    res.set('X-Document-Id', String(doc.id));
    res.set('X-Document-Url', docUrl);
  }

  return streamPdf(res, buffer, `Customer_Confirmation_${load.load_number}.pdf`);
});

async function loadConfirmationHandler(req, res) {
  const { loadId, assignmentId } = req.params;
  const { buffer, load } = await pdfService.buildLoadConfirmation(loadId, req.user.carrierId, assignmentId || null);

  if (!isViewOnly(req)) {
    const doc = await pdfService.persistDocument({
      loadId,
      carrierId: req.user.carrierId,
      userId: req.user.id,
      buffer,
      docType: pdfService.DOC_TYPE.CONFIRMATION,
      docNamePrefix: 'Load_Confirmation',
      loadNumber: load.load_number,
      assignmentId: assignmentId || null
    });
    res.set('X-Document-Id', String(doc.id));
    res.set('X-Document-Url', doc.doc_url);
  }

  return streamPdf(res, buffer, `Load_Confirmation_${load.load_number}.pdf`);
}

async function bolHandler(req, res) {
  const { loadId, assignmentId } = req.params;
  const { buffer, load } = await pdfService.buildBOL(loadId, req.user.carrierId, assignmentId || null);

  if (!isViewOnly(req)) {
    const doc = await pdfService.persistDocument({
      loadId,
      carrierId: req.user.carrierId,
      userId: req.user.id,
      buffer,
      docType: pdfService.DOC_TYPE.BOL,
      docNamePrefix: 'BOL',
      loadNumber: load.load_number,
      assignmentId: assignmentId || null
    });
    res.set('X-Document-Id', String(doc.id));
    res.set('X-Document-Url', doc.doc_url);
  }

  return streamPdf(res, buffer, `BOL_${load.load_number}.pdf`);
}

module.exports = {
  customerConfirmation,
  loadConfirmation: asyncHandler(loadConfirmationHandler),
  bol: asyncHandler(bolHandler)
};
