const documentsService = require('../services/documents.service');
const { handleUpload } = require('../services/uploads.service');
const eventsService = require('../services/events.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const rows = await documentsService.listForLoad(req.params.loadId, req.user.carrierId);
  return sendSuccess(res, rows, 'Documents fetched');
});

// Event logging lives here (controller), not in documents.service.js —
// createForLoad/removeForLoad are also called directly by pdf.service.js
// for generated PDFs, which log their own distinct PDF_GENERATED event
// instead (see pdf.controller.js). Logging here means only manual uploads
// via the Documents panel show up as "Document Uploaded"/"Document Deleted".
const create = asyncHandler(async (req, res) => {
  const row = await documentsService.createForLoad(req.params.loadId, req.body, req.user.id, req.user.carrierId);
  await eventsService.logEvent(null, {
    loadId: req.params.loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    eventTypeId: eventsService.EVENT_TYPES.DOCUMENT_UPLOADED,
    remark: `Document uploaded: ${row.doc_name || 'Untitled'}`,
    newValue: { snapshot: { doc_name: row.doc_name, doc_type_id: row.doc_type_id, doc_url: row.doc_url } }
  });
  return sendSuccess(res, row, 'Document saved', 201);
});

const remove = asyncHandler(async (req, res) => {
  const deleted = await documentsService.removeForLoad(req.params.id, req.params.loadId, req.user.carrierId);
  await eventsService.logEvent(null, {
    loadId: req.params.loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    eventTypeId: eventsService.EVENT_TYPES.DOCUMENT_DELETED,
    remark: `Document deleted: ${deleted.doc_name || 'Untitled'}`,
    oldValue: { snapshot: { doc_name: deleted.doc_name, doc_type_id: deleted.doc_type_id, doc_url: deleted.doc_url } }
  });
  return sendSuccess(res, null, 'Document deleted');
});

// Two-step flow (matches the reference project): upload the raw file first
// to get back a URL, then POST /documents with that URL to persist the row.
const uploadFile = [
  handleUpload,
  asyncHandler(async (req, res) => {
    return sendSuccess(res, { url: req.uploadedUrl }, 'File uploaded', 201);
  })
];

module.exports = { list, create, remove, uploadFile };
