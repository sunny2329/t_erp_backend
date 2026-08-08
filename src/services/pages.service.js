const { createSimpleCrudService } = require('./simpleCrudFactory');

// pages has no aduserid/addtime columns (unlike the master tables) — see
// information_schema check in SCHEMA_ASSUMPTIONS.md conventions.
module.exports = createSimpleCrudService({
  table: 'pages',
  entityName: 'Page',
  searchColumns: ['title', 'route'],
  filterColumns: ['group_name'],
  columns: [
    'title',
    'route',
    'group_name',
    'has_add',
    'has_edit',
    'has_delete',
    'isdefault',
    'page_icon',
    'url',
    'is_active',
    'top_group_name'
  ],
  requiredFields: ['title', 'route'],
  isActiveColumn: 'is_active',
  hasAduserid: false,
  hasAddtime: false,
  orderBy: 'group_name, title'
});
