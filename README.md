# t-erp-backend — Master Pages API

Node.js + Express 5 API exposing **master-data CRUD** for a freight TMS
(carriers, customers, drivers, vehicles, trailers, locations, terminals, users)
plus minimal auth and dropdown helpers, and **load entry/editing** (`loads` +
`load_stops`, matching the legacy `ss_save_loads_v1` field set). Dispatch
assignment, tracking, settlement, invoicing, and accounting are explicitly out
of scope for this service — see below.

## Stack
- Node.js / Express 5
- PostgreSQL via `pg` (`Pool`)
- JWT auth (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`)
- `helmet`, `cors`, `cookie-parser`, `dotenv`

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your DB credentials and a real JWT_SECRET
npm run dev      # auto-restarts on file change (node --watch)
# or
npm start
```

Server listens on `PORT` (default `4000`). All API routes are mounted under
`API_PREFIX` (default `/dispatch_api/v1`).

## Auth

Every route requires a JWT **except** `POST /auth/login` and `GET /health`.
Send the token either as `Authorization: Bearer <token>` or rely on the
httpOnly cookie (`COOKIE_NAME`, default `token`) that `/auth/login` sets.

```
POST /dispatch_api/v1/auth/login   { loginId, password }   # loginId = user_name or user_email
POST /dispatch_api/v1/auth/logout
GET  /dispatch_api/v1/auth/me
```

`GET /auth/me` returns the current user plus a `permissions` array — this schema
has no single `role`; access control is a per-user, per-page matrix
(`user_roles`: `page_id`, `allow_add`, `allow_edit`, `allow_delete`, joined
against `pages`).

## Dropdown helpers

```
GET /dispatch_api/v1/dropdown/types?type_id=<n>
GET /dispatch_api/v1/dropdown/cities?q=<search>
GET /dispatch_api/v1/dropdown/states
```

## Master modules

Every module below follows the same shape:

```
GET  /<module>              list (page, pageSize, search, is_active, + module filters)
GET  /<module>/:id          get by id (includes related child rows where applicable)
POST /<module>/create       create
POST /<module>/update/:id   update  (POST /<module>/update with { id } in body also works)
POST /<module>/delete/:id   soft delete (is_active = false)
```

| Module      | Base path      | Extra list filters                          | Related rows on GET /:id                                                     |
|-------------|----------------|-----------------------------------------------|--------------------------------------------------------------------------------|
| Carriers    | `/carriers`    | `authority_type` (1/2)                       | contacts, dispatch, details, insurance (liability + cargo), certification, settlement |
| Customers   | `/customers`   | `carrier_id`, `customer_type_id`, `status_id` | contacts, billing                                                              |
| Drivers     | `/drivers`     | `carrier_id`                                  | contact, rateCard                                                              |
| Vehicles    | `/vehicles`    | `carrier_id`, `terminal_id`, `vehicle_type_id`| —                                                                               |
| Trailers    | `/trailers`    | `carrier_id`, `terminal_id`, `trailer_type_id`| —                                                                               |
| Locations   | `/locations`   | `carrier_id`, `city_id`                       | —                                                                               |
| Terminals   | `/terminal`    | `carrier_id`, `city_id`                       | —                                                                               |
| Users       | `/users`       | `carrier_id`                                  | permissions (via `user_roles` + `pages`); password is never returned           |

`pageSize=-1` returns all rows (unpaginated), useful for populating dropdowns.

**`is_active` filtering is table-dependent** — see `SCHEMA_ASSUMPTIONS.md` for
the full breakdown. In short: `carriers`/`drivers`/`vehicles`/`trailers`/
`terminal`/`users` all have a real `is_active` boolean (default `true`-only;
`is_active=all` includes inactive; `is_active=false` shows only inactive).
`locations` has no `is_active` column — it has `status` instead, and the API
maps `?is_active=` onto it transparently. `customers` has neither; it uses
`status_id` (an int lookup) instead, so `POST /customers/delete/:id` returns a
400 explaining that rather than guessing — update `status_id` directly via
`POST /customers/update/:id` to change a customer's status.

For `carriers`, `customers`, `drivers`, and `users`, related child sections are
**replace-on-save**: send the full array for a section (e.g. `contacts: [...]`)
on create/update and it fully replaces that record's rows in the child table.
Omit the key entirely to leave existing child rows untouched.

## Response shape

```json
// success
{ "success": true, "message": "...", "data": { ... } }
// error
{ "success": false, "message": "..." }
```

List endpoints return `data: { rows: [...], meta: { page, pageSize, totalCount, totalPages } }`.

## Project structure

```
src/
  app.js                          # express app, middleware wiring
  server.js                       # entrypoint, graceful shutdown
  config/database.js              # pg Pool + query()/withTransaction() helpers
  middleware/auth.middleware.js   # JWT verification
  middleware/error.middleware.js  # 404 + centralized error handler
  routes/                         # one file per module, mounted in routes/index.js
  controllers/                    # HTTP layer only (req/res)
  services/                       # DB logic, no req/res
  utils/                          # response helpers, pagination, JWT, AppError
```

`vehicles`, `trailers`, `locations`, and `terminal` share an identical CRUD shape
(no child tables), so they're built from `services/simpleCrudFactory.js` and
`controllers/simpleCrudControllerFactory.js` instead of duplicating the same
~150 lines four times. `carriers`, `customers`, `drivers`, `users`, and `auth`
have custom services because they involve child tables, transactions, or
password hashing.

## Schema notes

This API was built and verified directly against your Supabase database —
column names, foreign keys, and constraints in `src/services/*.js` were pulled
from `information_schema` and confirmed with a live end-to-end test of every
module (not guessed). A handful of things in the real schema are genuinely
non-obvious (audit columns are `aduserid`/`addtime` only with no edit-tracking
column anywhere; `is_active` doesn't exist on every table; `carrier_users` has
no `role_id`, permissions are a `user_roles` matrix; `customer_contacts`' FK
column is literally named `customer`). See
[`SCHEMA_ASSUMPTIONS.md`](./SCHEMA_ASSUMPTIONS.md) for the full list before
changing any column names.

## Load documents & notes

```
GET  /loads/:loadId/documents            list
POST /loads/:loadId/documents/upload     multipart upload (field: file) -> { url }
POST /loads/:loadId/documents            create row { doc_name, doc_type_id, doc_url, exp_date }
POST /loads/:loadId/documents/:id/delete delete row (+ removes the Storage object if it was served by this API)

GET  /loads/:loadId/notes                list (newest-last, includes added_by)
POST /loads/:loadId/notes                create { notes }
POST /loads/:loadId/notes/:id            update { notes }
POST /loads/:loadId/notes/:id/delete     delete
```

Both `documents` and `notes` are generic tables keyed by `(ref_type_id, ref_id,
carrier_id)` — `ref_type_id = 6` is hardcoded to "Loads" everywhere in this API
(confirmed against `type_master(type_id=13)`, the entity-type directory, where
`id=6` is literally "Loads"). `doc_type_id` on documents looks up
`type_master(type_id=23)` (BOL, POD, Invoice, ...). Files are stored in
Supabase Storage (same Supabase project as the DB) under
`loads/<loadId>/<yyyymm>/` in a public bucket, keyed off `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` — not local disk,
since Render's free-tier filesystem is wiped on every redeploy/spin-down.

## Load PDFs (Customer Confirmation / Load Confirmation / BOL) + Rate Con email

```
GET  /loads/:loadId/pdf/customer-confirmation                 stream PDF (whole load)
GET  /loads/:loadId/pdf/load-confirmation[/:assignmentId]      stream PDF (one dispatched leg, or whole load)
GET  /loads/:loadId/pdf/bol[/:assignmentId]                    stream PDF (one dispatched leg, or whole load)
                                                                 all three: ?view_only=true skips saving a documents row
POST /loads/:loadId/rate-con/send                              { assignmentId, to, cc?, subject?, message? }
                                                                 regenerates+saves the Load Confirmation PDF for that
                                                                 leg, emails a link-only "please review" message

GET  /loads/erate/:token                        PUBLIC, no auth — { loadId, loadNumber, assignments: [...] }
PUT  /loads/erate/:token                        PUBLIC, no auth — { assignmentId, status: 'accept'|'reject',
                                                 driverName, driverPhone, vehicleNo, trailerNo }
```

PDFs are generated in-process with `jsPDF` (no Puppeteer/HTML templates —
programmatic vector drawing, `src/utils/pdf/*.js`), then persisted the same
way as manual document uploads: saved to Supabase Storage under
`loads/...` and a
`documents` row created with `doc_type_id` 1 (BOL) or 4 (Confirmation — both
Customer and Load Confirmation use 4, distinguished by `doc_name`, matching
the reference project's own numbering).

The public rate-con link (`/loads/erate/:token`) reuses `loads.token`
(already auto-generated by the DB: `encode(gen_random_bytes(16),'hex')`) as
the sole credential — same as the reference Loadx-Youngs project, and just as
permanent/non-expiring. Per-leg acceptance state lives on
`load_assignments.erate_status_id` (added via migration: `null` = pending,
`2` = accepted, `-1` = rejected — same vocabulary as the reference's
`erate_type_id`), and driver/equipment fields reuse the columns the dispatch
modals already write (`driver_name`/`driver_phone`/`vehicle_no`/`trailer_no`).
Matching "the latest Load Confirmation PDF for this specific leg" is done by
embedding `_AID_<assignmentId>` in `doc_name` (mirrors the reference's
`_DID_<dispatch_master_id>` trick) rather than adding a dedicated FK column.

Email is sent via `nodemailer` (`src/services/mailer.service.js`) using a
single global SMTP config — `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/
`SMTP_FROM`/`SMTP_SECURE` in `.env` — unlike the reference project's
per-carrier `carrier_smtp_settings` table, which this schema doesn't have.
Leaving those blank in dev is fine: the mailer logs a warning at first use
and send attempts fail with a clear error instead of crashing the app.
`FRONTEND_URL` in `.env` controls what host the emailed public link points
at (the React app, not this API).

## Load history

```
GET /loads/:loadId/history   full audit trail for one load, newest first
```

Backed by the `events` table (`ref_type_id=6`, same convention as documents/
notes), written from `src/services/events.service.js`. This is a
**from-scratch, Node-native design, not a port** of the reference
Loadx-Youngs-Backend's history feature — that system generates most of its
audit trail inside opaque Postgres stored functions with at least two dead
(declared, never written) event types and an inconsistent `old_value`/
`new_value` shape per event type. Since this backend has no stored-function
layer, every mutation already funnels through one canonical service
function, so event logging happens there, in the open:

- **Every** load mutation is covered: create/edit (`loads.service.js`,
  including a nested per-stop added/removed/modified diff), dispatch create/
  update/remove (`loadAssignments.service.js`), document upload/delete
  (`documents.controller.js` — distinct from PDF generation, which is logged
  separately in `pdf.service.js` so "uploaded a BOL" and "generated a BOL"
  don't collide), note add/update/delete (`notes.controller.js`), and rate-con
  send/accept/reject (`rateConSend.controller.js`, `erate.service.js`).
- **One consistent envelope** for every event, computed by the shared
  `diffObjects()` utility: create → `newValue: { snapshot }`, delete →
  `oldValue: { snapshot }`, update → `newValue: { changes: [{field, label,
  ref, oldValue, newValue}] } ` (plus `stopChanges` for Load Edited). No
  event type stores a raw full-row dump for the frontend to diff itself.
- **No backend joins for display names.** Each changed field carries a `ref`
  hint (`customer`/`carrier`/`driver`/`vehicle`/`trailer`/`user`/`terminal`/
  `location`/`type:<type_id>`/`date`/`datetime`/`currency`/`boolean`/...) —
  the frontend resolves it against master data it already has loaded via
  `DataContext` (see `t_erp_frontend/src/components/loads/LoadHistoryModal.jsx`),
  the same way every other page in the app already displays these
  relationships. Raw ids are stored as-is; nothing goes stale if a driver is
  renamed later — the diff still shows the id that was true at the time,
  resolved against current names (same tradeoff the rest of this API makes).
- Read-only — shown on the Load Edit drawer as a view-only timeline modal
  ("History" button), no edit/undo affordance.

## Out of scope (do not implement here)

dispatch assignment (driver_id/vehicle_id/trailer_id/dispatcher_id — a
separate legacy save-dispatch function), trip/tracking status transitions,
settlement batches, accounting, fuel, maintenance, claims, invoicing.

`loads`/`load_stops` themselves ARE in scope (see `src/services/loads.service.js`)
but only for the create/edit field set from `ss_save_loads_v1` — the ~35 other
`loads` columns (dispatch/tracking/settlement/invoicing) are intentionally
untouched by that service.
