const { createSimpleCrudController } = require('./simpleCrudControllerFactory');
const pagesService = require('../services/pages.service');

module.exports = createSimpleCrudController(pagesService, 'Pages', ['group_name']);
