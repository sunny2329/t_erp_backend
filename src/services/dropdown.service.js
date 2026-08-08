const { query } = require('../config/database');
const { AppError } = require('../utils/AppError');

/**
 * type_master(type_id, id, description) — composite key (type_id, id), no is_active.
 * city(id, state_id, name, zip_code, lat, long)
 * states(id, country_id, name, code)
 * country(id, code, name, isd_code, timezone, timezone_name)
 */

async function getTypes(typeId) {
  if (!typeId) {
    throw new AppError('type_id query param is required', 400);
  }

  const result = await query(
    `SELECT type_id, id, description
       FROM type_master
      WHERE type_id = $1
      ORDER BY description`,
    [typeId]
  );
  return result.rows;
}

async function getCities(search) {
  const params = [];
  let where = '';

  if (search) {
    params.push(`%${search}%`);
    where = `WHERE c.name ILIKE $${params.length}`;
  }

  const result = await query(
    `SELECT c.id, c.name AS city_name, c.state_id, c.zip_code, s.name AS state_name
       FROM city c
       LEFT JOIN states s ON s.id = c.state_id
       ${where}
      ORDER BY c.name
      LIMIT 50`,
    params
  );
  return result.rows;
}

async function getStates() {
  const result = await query(
    `SELECT s.id, s.name AS state_name, s.code, s.country_id, co.name AS country_name
       FROM states s
       LEFT JOIN country co ON co.id = s.country_id
      ORDER BY s.name`
  );
  return result.rows;
}

module.exports = { getTypes, getCities, getStates };
