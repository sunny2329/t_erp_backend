/* One-time dev seed: this database is completely empty (fresh schema, 0 rows
 * everywhere). Inserts a bootstrap admin + a small demo dataset across every
 * master module so the frontend has something to log into and display.
 * Safe to run once — aborts if carriers already has rows. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const DEMO_PASSWORD = 'Passw0rd!23';

async function main() {
  const existing = await pool.query('SELECT COUNT(*)::int AS c FROM carriers');
  if (existing.rows[0].c > 0) {
    console.log('carriers already has rows — aborting to avoid double-seeding.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Carriers ---
    const carrierRows = [
      ['Youngs Company Fleet', 1, true, 'Rachel Youngs'],
      ['Midwest Managed Carriers LLC', 1, true, 'Owen Reyes'],
      ['Summit Line Trucking', 1, false, 'Dana Cole'],
      ['Ironclad Freight LLC', 2, true, 'Marcus Webb'],
      ['Blue Horizon Transport', 2, true, 'Elena Ruiz'],
      ['Rapid Coast Logistics', 2, true, 'Jon Park'],
      ['Desert Star Carriers', 2, false, 'Nina Ahmed']
    ];
    const carrierIds = [];
    for (const [carrier_name, authority_type, is_active, contact_person] of carrierRows) {
      const r = await client.query(
        `INSERT INTO carriers (carrier_name, authority_type, is_active, contact_person, addtime)
         VALUES ($1,$2,$3,$4,NOW()) RETURNING id`,
        [carrier_name, authority_type, is_active, contact_person]
      );
      carrierIds.push(r.rows[0].id);
    }
    const [ymCarrier, mmCarrier, slCarrier, icCarrier, bhCarrier, rcCarrier, dsCarrier] = carrierIds;

    // --- carrier_users (admin + demo agents/dispatchers) ---
    // user_type is a bare nullable integer code with no backing lookup table
    // (type_master is empty and there's no FK) — left null, not guessed.
    const userRows = [
      ['Admin User', 'admin', 'admin@youngs.com', ymCarrier],
      ['Priya Sharma', 'priya.sharma', 'priya.sharma@youngs.com', ymCarrier],
      ['Mark Douglas', 'mark.douglas', 'mark.douglas@youngs.com', ymCarrier],
      ['Angela Reyes', 'angela.reyes', 'angela.reyes@youngs.com', ymCarrier],
      ['Tom Whitfield', 'tom.whitfield', 'tom.whitfield@youngs.com', ymCarrier],
      ['Sam Okafor', 'sam.okafor', 'sam.okafor@youngs.com', ymCarrier],
      ['Lena Kaur', 'lena.kaur', 'lena.kaur@youngs.com', ymCarrier]
    ];
    const userIds = [];
    for (const [full_name, user_name, user_email, carrier_id] of userRows) {
      const r = await client.query(
        `INSERT INTO carrier_users (carrier_id, full_name, user_name, user_email, password, is_active, is_blocked, addtime)
         VALUES ($1,$2,$3,$4,$5,true,false,NOW()) RETURNING id`,
        [carrier_id, full_name, user_name, user_email, passwordHash]
      );
      userIds.push(r.rows[0].id);
    }
    const [adminId, priyaId, markId, angelaId, tomId, samId] = userIds;

    // --- Customers ---
    // customers.phone_no is bigint on this schema (not varchar) — digits only.
    const customerRows = [
      ['Meridian Foods Distribution', priyaId, '2200 S Ashland Ave', 'Chicago', 'IL', '3125550142', 'ap@meridianfoods.com'],
      ['Lonestar Building Supply', markId, '900 Regal Row', 'Dallas', 'TX', '2145550198', 'billing@lonestarsupply.com'],
      ['Peachtree Retail Group', priyaId, '3350 Peachtree Rd NE', 'Atlanta', 'GA', '4045550177', 'logistics@peachtreeretail.com'],
      ['Pacific Coast Produce', markId, '1400 S Alameda St', 'Los Angeles', 'CA', '2135550163', 'ops@pacificcoastproduce.com'],
      ['Great Lakes Steel Co.', priyaId, '5800 S Torrence Ave', 'Chicago', 'IL', '7735550129', 'shipping@glsteel.com']
    ];
    const customerIds = [];
    for (const [name, sales_agent_id, address, city_name, state_name, phone_no, email] of customerRows) {
      const r = await client.query(
        `INSERT INTO customers (name, sales_agent_id, address, city_name, state_name, phone_no, email, addtime)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
        [name, sales_agent_id, address, city_name, state_name, phone_no, email]
      );
      customerIds.push(r.rows[0].id);
    }

    // --- Drivers ---
    const driverRows = [
      ['Carlos', 'Mendez', ymCarrier, 'IL-DL-88213', '(312) 555-2001', 'carlos.mendez@youngs.com', true],
      ['Denise', 'Owens', ymCarrier, 'IL-DL-77012', '(312) 555-2002', 'denise.owens@youngs.com', true],
      ['Frank', 'Bianchi', mmCarrier, 'IL-DL-55031', '(312) 555-2003', 'frank.bianchi@midwestmanaged.com', true],
      ['Grace', 'Kim', mmCarrier, 'IL-DL-42099', '(312) 555-2004', 'grace.kim@midwestmanaged.com', false],
      ['Hector', 'Salazar', slCarrier, 'TX-DL-19283', '(469) 555-2005', 'hector.salazar@summitline.com', true],
      ['Isabella', 'Ford', icCarrier, 'TX-DL-38221', '(214) 555-2006', 'isabella.ford@ironcladfreight.com', true],
      ['Jamal', 'Price', bhCarrier, 'GA-DL-71029', '(404) 555-2007', 'jamal.price@bluehorizontransport.com', true],
      ['Karen', 'Voss', rcCarrier, 'CA-DL-90312', '(213) 555-2008', 'karen.voss@rapidcoastlogistics.com', true]
    ];
    const driverIds = [];
    for (const [first_name, last_name, carrier_id, driver_license, mobile_no, email, is_active] of driverRows) {
      const r = await client.query(
        `INSERT INTO drivers (first_name, last_name, carrier_id, driver_license, mobile_no, email, is_active, addtime)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
        [first_name, last_name, carrier_id, driver_license, mobile_no, email, is_active]
      );
      driverIds.push(r.rows[0].id);
    }

    // --- Vehicles ---
    const vehicleRows = [
      ['TRK-10245', 'Freightliner', 'Cascadia 2022', ymCarrier, true],
      ['TRK-10312', 'Peterbilt', '579 2021', ymCarrier, true],
      ['TRK-20087', 'Kenworth', 'T680 2023', mmCarrier, true],
      ['TRK-20144', 'Volvo', 'VNL 2020', mmCarrier, false],
      ['TRK-30021', 'Freightliner', 'Cascadia 2019', slCarrier, true],
      ['TRK-40018', 'International', 'LT 2022', icCarrier, true],
      ['TRK-50076', 'Peterbilt', '389 2021', bhCarrier, true],
      ['TRK-60011', 'Kenworth', 'W900 2020', rcCarrier, true]
    ];
    const vehicleIds = [];
    for (const [reg_number, make, model, carrier_id, is_active] of vehicleRows) {
      const r = await client.query(
        `INSERT INTO vehicles (reg_number, make, model, carrier_id, is_active, addtime)
         VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
        [reg_number, make, model, carrier_id, is_active]
      );
      vehicleIds.push(r.rows[0].id);
    }

    // --- Trailers ---
    const trailerRows = [
      ['TRL-53001', 'Great Dane', 'Dry Van 53ft', ymCarrier, true],
      ['TRL-53002', 'Great Dane', 'Dry Van 53ft', ymCarrier, true],
      ['TRL-48011', 'Utility', 'Reefer 48ft', mmCarrier, true],
      ['TRL-48012', 'Utility', 'Reefer 48ft', mmCarrier, false],
      ['TRL-FLT01', 'Fontaine', 'Flatbed 48ft', slCarrier, true],
      ['TRL-53020', 'Wabash', 'Dry Van 53ft', icCarrier, true],
      ['TRL-48030', 'Utility', 'Reefer 48ft', bhCarrier, true],
      ['TRL-FLT02', 'Fontaine', 'Flatbed 53ft', rcCarrier, true]
    ];
    const trailerIds = [];
    for (const [name, make, model, carrier_id, is_active] of trailerRows) {
      const r = await client.query(
        `INSERT INTO trailers (name, make, model, carrier_id, is_active, addtime)
         VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
        [name, make, model, carrier_id, is_active]
      );
      trailerIds.push(r.rows[0].id);
    }

    // --- Locations ---
    const locationRows = [
      ['Meridian Foods DC - Chicago', '2200 S Ashland Ave', 'Chicago', 'IL', '(312) 555-0142'],
      ['Lonestar Supply Yard', '900 Regal Row', 'Dallas', 'TX', '(214) 555-0198'],
      ['Peachtree Retail Warehouse', '3350 Peachtree Rd NE', 'Atlanta', 'GA', '(404) 555-0177'],
      ['Pacific Coast Produce Dock', '1400 S Alameda St', 'Los Angeles', 'CA', '(213) 555-0163'],
      ['Great Lakes Steel Plant', '5800 S Torrence Ave', 'Chicago', 'IL', '(773) 555-0129'],
      ['Youngs Chicago Cross-Dock', '4500 W 47th St', 'Chicago', 'IL', '(312) 555-0100'],
      ['Dallas Regional Warehouse', '1500 Irving Blvd', 'Dallas', 'TX', '(214) 555-0210'],
      ['Phoenix Distribution Center', '2100 W Buckeye Rd', 'Phoenix', 'AZ', '(602) 555-0188']
    ];
    const locationIds = [];
    for (const [location_name, address_line1, city_name, state_name, phone] of locationRows) {
      const r = await client.query(
        `INSERT INTO locations (location_name, address_line1, city_name, state_name, phone, status, addtime)
         VALUES ($1,$2,$3,$4,$5,true,NOW()) RETURNING id`,
        [location_name, address_line1, city_name, state_name, phone]
      );
      locationIds.push(r.rows[0].id);
    }

    // --- Terminals ---
    const terminalRows = [
      ['CHI', 'Chicago Terminal', '4500 W 47th St', 'Chicago', 'IL'],
      ['DAL', 'Dallas Terminal', '1200 Regal Row', 'Dallas', 'TX'],
      ['ATL', 'Atlanta Terminal', '890 Fulton Industrial Blvd', 'Atlanta', 'GA'],
      ['LAX', 'Los Angeles Terminal', '2200 E 7th St', 'Los Angeles', 'CA']
    ];
    const terminalIds = [];
    for (const [code, name, address_line1, city_name, state_name] of terminalRows) {
      const r = await client.query(
        `INSERT INTO terminal (code, name, address_line1, city_name, state_name, is_active, addtime)
         VALUES ($1,$2,$3,$4,$5,true,NOW()) RETURNING id`,
        [code, name, address_line1, city_name, state_name]
      );
      terminalIds.push(r.rows[0].id);
    }

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log(JSON.stringify({
      carrierIds, userIds, customerIds, driverIds, vehicleIds, trailerIds, locationIds, terminalIds
    }, null, 2));
    console.log('\nLogin with: user_name=admin  password=' + DEMO_PASSWORD);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
