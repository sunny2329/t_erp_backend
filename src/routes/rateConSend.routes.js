const express = require('express');
const controller = require('../controllers/rateConSend.controller');

// Mounted at /loads/:loadId/rate-con — authenticated (unlike erate.routes.js,
// which is the public accept/reject side of this same feature).
const router = express.Router({ mergeParams: true });

router.post('/send', controller.send);

module.exports = router;
