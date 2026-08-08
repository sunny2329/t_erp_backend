# Verified schema notes

Unlike a typical build, this backend was connected to the real Supabase Postgres
database and every column/FK/constraint referenced in `src/services/*.js` was
pulled from `information_schema` and cross-checked with a live end-to-end test
(login → auth/me → dropdowns → full CRUD on every module, including nested
child tables) before being handed off. The notes below are the load-bearing
facts about this schema, not guesses — read them before changing column lists.

## Audit columns
Every master/child table has **`aduserid`** (int) + **`addtime`** (timestamp) —
and nothing else. There is **no edit-tracking column anywhere** (no `eduserid`,
`editdate`, `updated_at`, etc.). Per the task spec ("aduserid from JWT on
create/update"), `aduserid` is overwritten on both insert and update; `addtime`
is set once, on insert only. This is implemented centrally in
`src/utils/sqlBuilders.js` (`insertRow`/`updateRow`) and reused everywhere.
`carrier_cargo_insurance` is the one exception — it has **no audit columns at
all** (`hasAduserid: false, hasAddtime: false` in `carriers.service.js`).

## "Active" flag varies per table — don't assume `is_active`
| Table | Active-flag column | Notes |
|---|---|---|
| carriers | `is_active` | boolean |
| drivers | `is_active` | boolean, plus separate `terminated` |
| vehicles | `is_active` | boolean |
| trailers | `is_active` | boolean |
| terminal | `is_active` | boolean |
| carrier_users | `is_active` | boolean, plus `is_blocked`, `force_logout` |
| carrier_settlement | `is_active` | boolean |
| **locations** | **`status`** | boolean — no `is_active` column exists; the API still accepts `?is_active=` and maps it onto `status` |
| **customers** | **none** | has `status_id` (an int lookup, presumably against `type_master`), not a boolean — `POST /customers/delete/:id` intentionally returns 400 rather than guessing a hard delete or misusing `status_id` as a boolean |
| all `carrier_*`/`customer_*`/`driver_*` **child** tables | none | replace-on-save arrays only; not independently listed/deleted via the API |

## Non-obvious column names
- `customers.name` (not `customer_name`), `customers.carrier_id` is a real
  tenant-scoping FK (in addition to `trans_carrier_id`), and
  `customers.sales_agent_id` → `carrier_users.id` (not a separate agents table).
- `customer_contacts.customer` — the FK column is literally named `customer`,
  not `customer_id` (unlike `customer_billing.customer_id`, which is normal).
  See `CHILD_TABLES.contacts.fkColumn` in `customers.service.js`.
- `carrier_users.user_name` / `user_email` / `password` (not `login_id` /
  `email` / `password_hash`). `user_name` has a DB-level UNIQUE constraint.
- `carrier_users` has **no `role_id`**. Permissions are a per-user,
  per-page matrix in `user_roles(userid, page_id, allow_add, allow_edit,
  allow_delete)` joined against `pages`. `GET /users/:id` and `GET /auth/me`
  both return this as a `permissions` array; `POST /users/create` and
  `/users/update/:id` accept a `permissions: [{page_id, allow_add, ...}]`
  array using the same replace-on-save pattern as other child sections.
- `drivers.user_pwd` is intentionally **not implemented**. It's `varchar(50)`,
  which is too short to hold a bcrypt hash (60 chars) safely, and driver-app
  login is out of scope for this masters API. `stripSecret()` in
  `drivers.service.js` also guarantees the raw column is never read back out
  even if something else in your stack writes to it.
- `city.name` / `states.name` / `country.name` (not `city_name` /
  `state_name` / `country_name` — those denormalized columns exist as
  *cached* fields on several other tables like `carrier_contacts`,
  `customers`, `locations`, presumably kept in sync by application logic
  elsewhere, not by this API).
- `type_master` has a composite primary key `(type_id, id)` and a
  `description` column — no `type_name`, no `is_active`. `type_id` is the
  category code you pass to `GET /dropdown/types?type_id=`.
- `trailers.name` (not `trailer_number`), `trailers.make_year` (not `year`).
- `terminal.code` and `terminal.name` are both `NOT NULL` — both are required
  on create.

## carrier_details / carrier_settlement / carrier_certification
These three are wide, heavily denormalized tables (60+, 18, and 9 writable
columns respectively) — feature-flag toggles, a full "quick pay"/"freeze pay"
sub-block on `carrier_details` (its `dtl_*` prefixed columns look like a
carrier-identity mirror, e.g. `dtl_mc_number` duplicating `carriers.mc_number`),
and one literally double-prefixed column (`dtl_dtl_is_freeze_pay` — copied
verbatim from the live schema, not a typo introduced here). The full writable
column list for each is in `CHILD_TABLES` in `carriers.service.js`.

## Foreign keys enforced at the DB level
`carrier_contacts/dispatch/details/liability/cargo_insurance/certification/
settlement/users.carrier_id`, `customers.carrier_id/trans_carrier_id`,
`customers.sales_agent_id → carrier_users.id`, `customer_billing.customer_id`,
`customer_contacts.customer`, `drivers.carrier_id/state_id/terminal_id`,
`driver_contact.driver_id/city_id`, `driver_rate_card.driver_id`,
`vehicles/trailers/locations/terminal.carrier_id`, `city.state_id`,
`states.country_id`, `user_roles.userid/page_id` are all real FK constraints.
Invalid references surface as a clean `409` via the generic Postgres error
handler in `src/middleware/error.middleware.js` (no manual pre-check queries
needed — the DB is authoritative). `NOT NULL` violations (e.g.
`carrier_liability.company_id`, `carrier_settlement.pay_method_type_id`,
`carrier_users.full_name`) surface as `400`.

## `load_assignments.erate_status_id` (added, not original schema)
Every other column on this table was verified against the live schema as
described below. `erate_status_id` (nullable `integer`) was added afterward
via `ALTER TABLE load_assignments ADD COLUMN erate_status_id integer` to
support the public rate-con accept/reject link — see the "Load PDFs" section
of `README.md`. `null` = pending, `2` = accepted, `-1` = rejected.

## `loads.token`
Auto-generated by the DB itself (`DEFAULT encode(gen_random_bytes(16),
'hex')`), not written by any Node code — every `loads` row already has one.
It's the sole credential for the public rate-con link
(`GET/PUT /loads/erate/:token`); nothing else in this API currently reads it.

## `driver_vehicle_mapping` (added, not original schema)
Didn't exist in the live schema — created via `CREATE TABLE` (mirroring the
reference Loadx-Youngs-Backend's standing "who currently drives this truck"
concept) to back the driver↔vehicle+trailer auto-fill/history feature. Columns:
`id, carrier_id, driver_id, vehicle_id, trailer_id, is_active, deactive_dt,
aduserid, addtime`. `trailer_id` is nullable (a driver can be mapped to a
vehicle with no trailer yet); `driver_id`/`vehicle_id`/`carrier_id` are
`NOT NULL` FKs. Written only by `loadAssignments.service.js` on a **company**
dispatch create/update (never for broker/external legs, which have no real
`vehicle_id`/`driver_id` FKs to map). See
`driverVehicleMapping.service.js.syncMapping` for the exact is_active
toggling rule.

## How this was verified
Connected directly to the Supabase instance, ran
`information_schema.columns` / `table_constraints` / `key_column_usage`
queries against every table this API touches, then round-tripped every module
through the real HTTP API against the live database (seeded a country → state
→ city → carrier → user, logged in, hit every endpoint including nested
carrier child sections, users + permissions, drivers, vehicles, trailers,
locations, terminal), and deleted the seed rows afterward. Two real bugs were
caught and fixed this way: `insertRow` was forcing `NULL` into columns with
DB defaults (e.g. `carriers.track_1099`) instead of omitting them, and
`drivers.user_pwd` can't hold a bcrypt hash (column too short).
