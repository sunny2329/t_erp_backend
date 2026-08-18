const { createSimpleCrudService } = require('./simpleCrudFactory');

/**
 * `status` is this table's active flag (there is no `is_active` column) —
 * ?is_active= query param maps onto it via isActiveColumn.
 */
module.exports = createSimpleCrudService({
  table: 'locations',
  entityName: 'Location',
  searchColumns: ['location_name', 'location_code'],
  filterColumns: ['carrier_id', 'city_id'],
  columns: [
    'carrier_id',
    'location_name',
    'address_line1',
    'address_line2',
    'city_id',
    'zip_code',
    'isd_code',
    'phone',
    'phone_ext',
    'fax',
    'email',
    'website',
    'contact_person',
    'notes',
    'edi_location_code',
    'location_code',
    'status',
    'is_local_terminal',
    'google_api_validated',
    'city_name',
    'state_name',
    'country_name',
    'lat',
    'long'
  ],
  requiredFields: ['location_name', 'address_line1'],
  isActiveColumn: 'status',
  orderBy: 'location_name'
});
