const notesService = require('../services/notes.service');
const eventsService = require('../services/events.service');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

function truncate(text, max = 60) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const list = asyncHandler(async (req, res) => {
  const rows = await notesService.listForLoad(req.params.loadId, req.user.carrierId);
  return sendSuccess(res, rows, 'Notes fetched');
});

const create = asyncHandler(async (req, res) => {
  const row = await notesService.createForLoad(req.params.loadId, req.body, req.user.id, req.user.carrierId);
  await eventsService.logEvent(null, {
    loadId: req.params.loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    eventTypeId: eventsService.EVENT_TYPES.NOTE_ADDED,
    remark: `Note added: "${truncate(row.notes)}"`,
    newValue: { snapshot: { notes: row.notes } }
  });
  return sendSuccess(res, row, 'Note added', 201);
});

const update = asyncHandler(async (req, res) => {
  const row = await notesService.updateForLoad(req.params.id, req.params.loadId, req.body, req.user.id, req.user.carrierId);
  if (row.previousNotes !== row.notes) {
    await eventsService.logEvent(null, {
      loadId: req.params.loadId,
      carrierId: req.user.carrierId,
      userId: req.user.id,
      eventTypeId: eventsService.EVENT_TYPES.NOTE_UPDATED,
      remark: `Note updated: "${truncate(row.notes)}"`,
      newValue: { changes: [{ field: 'notes', label: 'Note Text', ref: 'text', oldValue: row.previousNotes, newValue: row.notes }] }
    });
  }
  return sendSuccess(res, row, 'Note updated');
});

const remove = asyncHandler(async (req, res) => {
  const deleted = await notesService.removeForLoad(req.params.id, req.params.loadId, req.user.carrierId);
  await eventsService.logEvent(null, {
    loadId: req.params.loadId,
    carrierId: req.user.carrierId,
    userId: req.user.id,
    eventTypeId: eventsService.EVENT_TYPES.NOTE_DELETED,
    remark: `Note deleted: "${truncate(deleted.notes)}"`,
    oldValue: { snapshot: { notes: deleted.notes } }
  });
  return sendSuccess(res, null, 'Note deleted');
});

module.exports = { list, create, update, remove };
