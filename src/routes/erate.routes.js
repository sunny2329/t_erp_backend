const express = require('express');
const controller = require('../controllers/erate.controller');

// Public routes — deliberately NOT behind requireAuth (see routes/index.js,
// this must be mounted before the authenticated /loads router so it's
// matched first). The token in the URL is the only credential, same as the
// reference project's public rate-confirm link.
const router = express.Router();

router.get('/:token', controller.getErate);
router.put('/:token', controller.updateErate);

module.exports = router;
