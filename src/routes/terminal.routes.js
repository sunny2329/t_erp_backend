const express = require('express');
const terminalController = require('../controllers/terminal.controller');

const router = express.Router();

router.get('/', terminalController.list);
router.get('/:id', terminalController.getById);
router.post('/create', terminalController.create);
router.post('/update/:id', terminalController.update);
router.post('/update', terminalController.update);
router.post('/delete/:id', terminalController.remove);

module.exports = router;
