const { createSimpleCrudService } = require('./simpleCrudFactory');

module.exports = createSimpleCrudService({
  table: 'terminal',
  entityName: 'Terminal',
  searchColumns: ['name', 'code'],
  filterColumns: ['carrier_id', 'city_id'],
  columns: [
    'carrier_id',
    'code',
    'name',
    'address_line1',
    'address_line2',
    'city_id',
    'contact_person',
    'contact_isd_code',
    'contact_phone',
    'contact_email',
    'lat',
    'long',
    'is_active',
    'ext_code',
    'city_name',
    'state_name',
    'country_name'
  ],
  requiredFields: ['name', 'code'],
  isActiveColumn: 'is_active',
  orderBy: 'name'
});
