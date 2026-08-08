const express = require('express');
const controller = require('../controllers/documents.controller');

// Mounted at /loads/:loadId/documents — always scoped to a load.
const router = express.Router({ mergeParams: true });

router.get('/', controller.list);
router.post('/upload', controller.uploadFile);
router.post('/', controller.create);
router.post('/:id/delete', controller.remove);

module.exports = router;
