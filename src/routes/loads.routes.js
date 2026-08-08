const express = require('express');
const loadsController = require('../controllers/loads.controller');
const loadAssignmentsRoutes = require('./loadAssignments.routes');
const documentsRoutes = require('./documents.routes');
const notesRoutes = require('./notes.routes');
const pdfRoutes = require('./pdf.routes');
const rateConSendRoutes = require('./rateConSend.routes');
const historyRoutes = require('./history.routes');

const router = express.Router();

router.get('/', loadsController.list);
router.get('/:id', loadsController.getById);
router.post('/create', loadsController.create);
router.post('/update/:id', loadsController.update);
router.post('/update', loadsController.update);

router.use('/:loadId/assignments', loadAssignmentsRoutes);
router.use('/:loadId/documents', documentsRoutes);
router.use('/:loadId/notes', notesRoutes);
router.use('/:loadId/pdf', pdfRoutes);
router.use('/:loadId/rate-con', rateConSendRoutes);
router.use('/:loadId/history', historyRoutes);

module.exports = router;
