const express = require('express');
const pagesController = require('../controllers/pages.controller');

const router = express.Router();

router.get('/', pagesController.list);
router.get('/:id', pagesController.getById);
router.post('/create', pagesController.create);
router.post('/update/:id', pagesController.update);
router.post('/update', pagesController.update);
router.post('/delete/:id', pagesController.remove);

module.exports = router;
