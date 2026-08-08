const express = require('express');
const usersController = require('../controllers/users.controller');

const router = express.Router();

router.get('/', usersController.list);
router.get('/:id', usersController.getById);
router.post('/create', usersController.create);
router.post('/update/:id', usersController.update);
router.post('/update', usersController.update);
router.post('/delete/:id', usersController.remove);

module.exports = router;
