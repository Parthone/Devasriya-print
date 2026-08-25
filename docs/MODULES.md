# Module roadmap

Modules are built one at a time and approved before implementation starts. The
machine-readable copy of this list lives in `src/constants/modules.ts` and drives
the dashboard roadmap card and the placeholder pages - update both together.

| #   | Module                           | Status        | Notes                                        |
| --- | -------------------------------- | ------------- | -------------------------------------------- |
| 0   | Project Foundation               | **Delivered** | Tooling, shell, backend layer, design system |
| 1   | Authentication & Users           | **Delivered** | Supabase Auth, profiles, protected routes    |
| 2   | Roles & Permissions              | Planned       | RBAC in the UI and in security rules         |
| 3   | Customer Management              | Planned       | Customer directory, contacts, GSTIN          |
| 4   | Enquiries & Jobs                 | Planned       | Enquiry intake, conversion to jobs           |
| 5   | Measurements & Price Calculation | Planned       | Rate cards, area pricing, taxes              |
| 6   | Estimates & Quotations           | Planned       | Quotation builder, revisions, approval       |
| 7   | Design Uploads & Approvals       | Planned       | Storage uploads, proofs, approval trail      |
| 8   | Department Workflow              | Planned       | Production stages and job movement           |
| 9   | Employee Assignment              | Planned       | Assignment and workload                      |
| 10  | Deadlines & Pending Work         | Planned       | Due dates, queues, escalation                |
| 11  | Billing & Payments               | Planned       | Invoices, advances, outstanding              |
| 12  | Inventory & Materials            | Planned       | Stock, consumption, reorder levels           |
| 13  | Dashboard & Reports              | Planned       | Business summary and reports                 |

## Module 0 - Project Foundation (delivered)

**Tooling**

- Vite 6, React 19, TypeScript strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`)
- ESLint 9 flat config with type-aware rules, Prettier with the Tailwind plugin
- Vitest + React Testing Library on jsdom
- `npm run verify` runs typecheck, lint, format check, tests and build

**Application shell**

- React Router v7 route table with an app shell (sidebar and top bar), an auth
  shell, and 403 / 404 pages
- Providers: error boundary, theme (light / dark / system), TanStack Query,
  toasts
- Navigation lists every planned module, disabled until its module ships

**Backend integration**

- Lazily-initialised Supabase client for Auth, PostgreSQL and Storage
  clients
- Local stack via the Supabase CLI (`npm run db:start`)
- Row level security enabled on every table, with the default grants revoked
- Hosting configuration with SPA rewrite and asset caching headers
- PostgREST and Auth errors normalised into `AppError`

**Shared foundations**

- Typed row mappers per table, plus atomic RPCs for multi-write operations,
  audit fields, soft delete
- Timestamp / Date converters and a collection path registry
- Money as integer paise with INR formatting; `en-IN` and `Asia/Kolkata` date
  formatting
- Shared types: entities, audit fields, pagination, `Result`, and the role and
  permission vocabulary

**Deliberately excluded**

Every business module, real authentication logic, real security rules, CI/CD and
deployment automation.

## Module 1 - Authentication & Users (delivered)

**Authentication**

- Supabase email/password sign-in with a persisted session, so a refresh
  or a browser restart keeps the user signed in
- Session restore gated behind a loader, so a signed-in user is never bounced to
  the sign-in screen on refresh
- Sign-out from the account menu in the app shell
- Forgot-password flow that never reveals whether an address is registered

**Who is allowed in**

- `resolveSession` accepts a user only when a `users/{uid}` profile exists and
  `isActive` is true; every other case is signed out with a clear reason
- `ProtectedRoute` redirects unauthenticated users to `/login` (remembering where
  they were headed) and non-administrators away from admin-only routes
- Admin-only navigation is hidden from staff as well as blocked

**Employee management** (`/settings/users`, owner and admin only)

- Directory with search, showing designation, department, role and status
- Add employee: name, email, mobile, designation, department, role
- Edit employee; the sign-in email is immutable
- Activate and deactivate, with confirmation; administrators cannot deactivate
  or demote themselves
- Resend the password setup email

**Provisioning**

- `UserAccountProvisioner` interface with a secondary-app implementation, so the
  administrator session is never disturbed and staff passwords are never known
  to anyone but the employee
- Designed for a later Cloud Function + Admin SDK implementation without
  touching the UI

**Security rules**

- `users` is readable by its owner, and by administrators for the directory
- Only active administrators may create or update profiles, with field-level
  validation (mobile pattern, known roles, no extra fields)
- The sign-in email and creation audit fields are immutable
- Administrators cannot change their own role or status
- Profiles can never be deleted; every other collection stays denied

**Tooling**

- `scripts/bootstrap-owner.mjs` creates the first owner with the Admin SDK
- `scripts/seed-supabase.mjs` seeds local accounts for manual testing
- `npm run test:integration` runs the row level security and workflow suites

**Known limitation**

Client-side provisioning means email/password sign-up stays enabled on the
project, and deactivation does not disable the auth account itself. Such
accounts have no profile and are rejected by both the application and the rules,
so they grant no access. A Cloud Function implementation (Blaze plan) closes it.

## Module 2 - Roles & Permissions (delivered)

**Permission model**

- 31 typed permissions across every business area, defined once in
  `src/features/permissions/catalogue.ts`
- Default role matrix as data in `matrix.ts`; `resolvePermissions(role,
overrides)` is the only way permissions are derived
- Owner always holds every permission; `employees:manage-admins` and
  `settings:manage` are owner-only and cannot be granted by an override
- Job assignment stays with owner and admin - a future override can grant
  `jobs:assign` to a production supervisor without any code change

**Enforcement**

- `ProtectedRoute requires={[...]}` guards every route, including the
  placeholders for modules that do not exist yet
- Sidebar renders only what the user may open
- `<Can>` / `PermissionGate`, `usePermission`, `usePermissions`,
  `hasPermission` / `hasAllPermissions` / `hasAnyPermission`
- `public.role_permissions` carries the same matrix as data, seeded from
  the collections that exist, plus privileged-role rules: only the owner may
  create, edit or promote owner and admin records

**Roles & Permissions screen** (`/settings/roles`, `settings:view`)

- Renders the live matrix, so the reference can never drift from what is
  enforced

**Audit trail**

- `auditLogs` collection: employee created, role changed, status changed,
  details updated - with actor, target, before and after
- Written in the same batch as the change; server timestamps only
- Append-only: rules refuse every update and delete
- Visible per employee under Employees > View history
- Index on `(target_user_id, created_at desc)` for the per-employee trail

**Known limitation**

The audit trail is written by the browser. It is reliable against mistakes and
partial failures, but not tamper-proof: someone with direct database or
service-account access could write or withhold entries. A Cloud Function with
the Admin SDK (Blaze plan) is required to make it authoritative. The same
applies to the account-provisioning limitation from Module 1.

## Module 3 - Customer Management (delivered)

**Directory** (`/customers`, `customers:view`)

- Substring search across name, business name, mobile, alternate mobile, email,
  GSTIN and city; numbers match whether typed with spaces, a leading zero or +91
- Active / archived / all filter, 25 per page
- Responsive: table on wide screens, cards on phones
- Empty, loading, error and cap-reached states

**Record**

- Name, business name, type, primary and alternate mobile, email, address, city,
  state (fixed list of states and union territories), PIN code, GSTIN, preferred
  language (Hindi or English), notes, archived flag
- GSTIN is format-validated (15 characters, no checksum) and stored uppercase
- Duplicate primary mobile numbers warn and link to the existing customer, but
  are allowed

**Detail page** (`/customers/:customerId`)

- Full record with edit and archive/restore for `customers:edit`
- No jobs, estimates or billing panels yet - those arrive with their modules

**Data and security**

- `customers` table; the UI never touches the database directly
- Rules mirror the matrix exactly: all seven roles may read; owner, admin and
  sales may create and edit; **no role may delete**
- Field validation in rules: mobile and PIN patterns, known type and language,
  `nameLower` must match the name, no unexpected fields
- `createdAt` / `createdBy` immutable; every write attributed to the signed-in user
- No new composite index: the only query is `orderBy(nameLower)`, which
  database indexes automatically

**Deliberately excluded**

Customer login (portal module), design or text requests (enquiries and jobs),
pickup office and assigned contact person (job modules), credit terms and
outstanding balances (billing).

**Reserved for later**

`portalUserId` is stored as `null` on every customer so the future portal can
attach an auth account by writing one field. The UI never exposes it and the
rules forbid ordinary edits from changing it.

## Module 4 - Enquiries & Jobs (delivered)

**Enquiries** (`/enquiries`, `enquiries:view`)

- Numbered per financial year from a transactional counter: `ENQ-2627-0001`
- Linked to a customer, with name and mobile snapshots for list and search
- Typed requirement plus an optional browser voice recording
- Inline follow-up history (capped at 50) and a top-level `nextFollowUpAt` for
  the future deadline module
- Statuses: new, contacted, follow-up, quotation required, converted, lost
  (with a reason), closed. `converted` is only ever set by conversion

**Jobs** (`/jobs`, `jobs:view`)

- Numbered `JOB-2627-0001`, stable forever, from its own counter
- Created by converting an enquiry, or directly for a walk-in repeat order
- Carries the requirement, the exact recording, priority, expected delivery,
  pickup office snapshot and coarse status
- Assignment is a separate action behind `jobs:assign`

**Conversion**

- One database transaction: allocate the job number, write the job, stamp the
  enquiry as converted with its job id
- Duplicate conversion refused in the service, in the transaction and in the
  rules, including from a stale copy of the enquiry
- A failed conversion leaves no job and no converted flag

**Voice requirements**

- `MediaRecorder`, Opus/WebM with an MP4 fallback, 3 minutes and 5 MB caps
- Playback before saving, replace and remove
- Metadata only on the document - no download URL is ever persisted
- Immutable, write-once paths: replacing a recording writes a new attachment id
- Conversion copies the bytes to a job-owned path, so enquiry audio stays behind
  `enquiries:view` and job audio behind `jobs:view`; the copy is taken at the
  moment of conversion and never changes afterwards
- A copy whose conversion then fails is discarded; the enquiry recording is
  never modified or deleted by the job side
- Superseded files are deleted only when nothing else references them

**Pickup offices** (`/settings/locations`, `settings:manage`)

- Owner-managed offices with one contact person each
- Jobs snapshot office name, contact name and contact mobile

**Security**

- `enquiries`, `jobs`, `locations` and `counters` collections opened, with field
  validation and immutable numbers and creation audit fields
- `storage.rules` opened for the first time, for requirement audio only, with
  size and content-type limits and write-once paths
- Counters accept only a plus-one increment from a permitted creator, cannot be
  listed, reset or deleted
- No deletes anywhere in this module

**Deliberately excluded**

Production stages (Module 8), advanced assignment (9), billing (11).

## Module 5 - Measurements & Pricing (delivered)

**The calculation engine** (`src/lib/measurement.ts`, `src/lib/pricing.ts`)

- Units normalise to exact integer micrometres (one inch is exactly 25400 um),
  so mm, cm, inch, foot and metre mix without drift
- Six pricing methods: per square foot, per square metre, per running foot, per
  running metre, per piece, flat rate - each asking only for the fields it needs
- Arithmetic in BigInt over exact integers, rounded once per line, half away from
  zero, to whole paise
- Subtotal is the exact integer sum of stored line amounts; total is subtotal
  plus the signed adjustment and can never be negative
- Pure and standalone, so Modules 6, 11 and 13 can reuse or snapshot it

**Job pricing**

- Up to 50 lines stored on the job document, written atomically with the totals
- Every line keeps its own snapshot: entered dimensions, unit, quantity, method,
  product id and name, the rate actually used, the calculated area or length and
  the amount
- One signed adjustment with a mandatory reason
- The card shows the working: `6 x 4 foot x 2 @ Rs 25.00/sq ft = Rs 1,200.00`

**Rate card** (`/settings/products`, `settings:manage`)

- Products with a category, pricing method, default rate and active flag
- Selecting one prefills the rate; the rate stays editable per job
- Deactivated, never deleted
- Changing a rate never re-prices existing jobs - proven end to end

**Permissions** (no new permissions invented)

- See pricing: `estimates:view` - so designer and production do not see money
- Change pricing: `jobs:edit` **and** `estimates:create` - so production, which
  holds `jobs:edit`, cannot change a price; enforced by the policies
- Manage the rate card: `settings:manage`

**Where pricing is stored**

In its own table, `job_pricing`, not on the job. Columns have no
field-level read rules, so money on the job document would have been readable by
anyone holding `jobs:view` - designer and production included. As a separate
document it is gated properly: reading needs `estimates:view` and writing needs
`jobs:edit` and `estimates:create`. The job document holds no amounts at all,
and the UI only requests pricing for a user who may read it.

**Deliberately excluded**

GST and tax (Modules 6 and 11), quotation documents (6), inventory (12). No
placeholder tax fields were added.

## Module 6 - Estimates & Quotations (delivered)

**A quotation is a historical record**

An estimate is created from the job pricing snapshot and copies it verbatim: the
priced lines, the subtotal, the adjustment and the total, together with the
customer name, business name, address and GSTIN as they read that day. Nothing
is linked back to the job, `jobPricing/{jobId}` or the rate card, so re-pricing
the job, changing a product rate or editing the customer cannot move a quotation
that has already been given. Proven end to end against a real database.

**The document** (`estimates/{estimateId}`)

- `EST-2627-0001`, allocated in the same transaction that writes the quotation,
  from the Indian financial-year counter used by enquiries and jobs
- Job id, job number and job title; customer id, name, mobile, business name,
  address and GSTIN - all snapshots
- Quotation date and a validity date (15 days by default)
- Priced lines, subtotal, one signed adjustment with its reason, and the total
- Notes and terms, the only wording a person types
- Status, `sentAt`, the customer's decision and `cancelledAt`

**The states it can be in**

    draft  -> sent, cancelled
    sent   -> approved, rejected, expired, cancelled
    approved / rejected / expired / cancelled -> nothing

Only a draft may have its wording or validity changed; once a quotation has gone
out, the answer is a new quotation from the job, not a quiet edit. Refused in
three places: the buttons offered, the service, and the policies - where each
allowed move names exactly the keys it may touch, so no write can carry a
rewritten price along with a status change.

**Recording the customer's answer**

Staff record approval or rejection on the customer's behalf until the customer
portal (Module 7) exists, so the record keeps the outcome, the timestamp, who
entered it and any comment the customer gave. `estimates:approve` is required,
and the rules check that the recorded name is the signed-in user's own.

**Screens**

- `/estimates` - directory with search across quotation number, job number,
  customer, business name and mobile, an open/all/status filter, and paging
- `/estimates/{id}` - the record, the actions this role and status allow, and
  the quotation document itself
- The quotation view prints cleanly from the browser (no PDF library): the
  application shell is dropped by a print stylesheet
- Job detail carries a "Create quotation" action and lists the quotations
  already raised against that job

**Permissions** (no change to the Module 2 matrix)

- View: `estimates:view` - owner, admin, sales, accounts, viewer
- Create: `estimates:create`; edit a draft: `estimates:edit`
- Record a decision: `estimates:approve` - owner, admin, sales
- Designer and production are denied at rule level, and the UI never asks

**Deliberately excluded**

GST and tax - Module 6 is tax-neutral, and taxation belongs to invoicing in
Module 11. No invoice, payment or PDF-library work was added.

## Module 7 - Design Uploads & Approvals (delivered)

**One version, one document, one file**

A design version is written once and never rewritten. A revision is a new
document with the next version number and a new object in Storage, so "this
artwork was approved" stays a true statement about a specific file. PostgreSQL
refuses every change to the file, the version, the job or the customer on an
existing version, and Storage refuses a second write to a path that already
holds an object - and refuses every delete.

Version ids are `{jobId}-v{n}`, which makes them unique by construction: two
designers uploading at the same instant collide on the create rather than both
being handed version 3.

**The states a version can be in**

    draft                -> submitted-for-review, superseded
    submitted-for-review -> approved, rejected, changes-requested, superseded
    changes-requested / approved / rejected -> superseded
    superseded           -> nothing further

`superseded` moves the status alone. The decision and its comment stay exactly
as written - a change request is still readable, word for word, long after the
revision that answered it went out.

**Approve, ask for changes, or reject - always with room to speak**

The comment box is on screen for approval too. "Approved, but please make the
font bigger" is one of the most common real answers, and it is an approval and
an instruction at the same time; hiding the box behind a rejection would throw
the instruction away. Rejections and change requests require a comment,
approvals do not.

Every decision records who gave it and how: `source: 'customer'` when the
customer answered in the portal, `source: 'staff'` when somebody wrote down what
they said on the phone. The rules pin `source` and `byId` to whoever is actually
signed in, so staff cannot post an answer as though the customer had typed it.

**Two kinds of principal**

Customers are not employees with fewer permissions. An employee has
`users/{uid}`; a customer has `customerAccounts/{uid}`, no role, and no entry
anywhere in the permission matrix - `can(...)` is false for them everywhere in
the rules. One uid is never both: each create refuses if the other exists.

The portal has its own shell, its own route guard and its own sign-in page.
A customer who lands on a staff URL is sent to the portal; a staff member who
lands on a portal URL is sent to the dashboard.

Access is granted from the customer record ("Design review portal"), which
creates the login with a throwaway password and emails the customer a link to
set their own - nobody at the shop ever knows a customer password. Access is
revoked by deactivating the account, never by deleting it, so the designs they
approved keep their name on them.

**Hindi and English**

`src/i18n` holds a flat, namespaced catalogue. English defines the key type, so
a missing Hindi string is a compile error, and the tests additionally check that
every customer-facing key is genuinely translated rather than copied. A customer
opens the portal in the `preferredLanguage` on their Module 3 record; the toggle
is on every screen and an explicit choice wins from then on. The two buttons are
labelled in their own scripts, never translated, so somebody who opened the
wrong language can read their way out.

**Files**

`designs/{jobId}/{designId}/{attachmentId}.{ext}`, JPG, PNG, WEBP or PDF up to
25 MB. No download URL is ever persisted: the viewable URL is resolved at run
time for whoever is signed in, so a link cannot be lifted out of the database and
used by somebody the rules would refuse. Images render inline; PDFs get an open
action into the browser's own viewer. There is no design editor and no PDF
library.

**Production handoff**

The approved artwork is the design whose status is `approved`, exposed as
`approvedDesign(designs)`. It is deliberately _not_ copied onto the job as a
pointer: a customer approving from the portal writes one document - their own
version - and is never given write access to the job record, so there is no
denormalised field that can drift out of step with the decision that set it.
Approving supersedes any earlier approval, so a job never has two.

**Deliberately excluded**

Department workflow (Module 8). Nothing here schedules or assigns production
work; it only makes the approved artwork easy to find.

## Next: Module 8 - Department Workflow

Scope to be confirmed before implementation.

## Module 8 - Supabase Backend Migration (delivered)

The backend moved from Firebase to Supabase in one module. Firebase Hosting
stays; Firestore, Firebase Auth and Cloud Storage are gone.

**What made it a 13-file change rather than a rewrite**

The layering rule from Module 0. ESLint forbade the UI from importing the
Firebase SDK, so the only code that knew what the backend was lived in
`src/lib/firebase/**`, `src/services/**` and each feature's `services/` folder -
4,871 of 38,400 lines. Not one component, page, hook, domain type or business
rule changed. The 500-odd UI and domain tests that mock at the service boundary
passed without edits, which is how each module was checked as it moved.

**What replaced what**

| Firebase                         | Supabase                                          |
| -------------------------------- | ------------------------------------------------- |
| Firestore collection             | PostgreSQL table                                  |
| Embedded array capped at 50      | Child table (`enquiry_follow_ups`, `*_lines`)     |
| `firestore.rules` `can(...)`     | `app.has_permission(...)` in a policy             |
| `touchesOnly([...])`             | `GRANT UPDATE (col, ...)`                         |
| `allow delete: if false`         | No delete grant, no delete policy                 |
| Status transition table in rules | `BEFORE UPDATE` trigger + transition table        |
| `runTransaction` / `writeBatch`  | `SECURITY INVOKER` PL/pgSQL function              |
| Counter document                 | `document_counters` row + `ON CONFLICT DO UPDATE` |
| `getDownloadURL()`               | `createSignedUrl(path, 300)`                      |
| Secondary-app account creation   | `provision-account` Edge Function                 |
| Emulator rules tests             | Integration tests against a real database         |

**Three things that got better**

- **Signed URLs expire.** A Firebase download URL is effectively a permanent
  bearer token. The old code worked hard never to persist one; the new one has a
  five-minute window even if somebody slips.
- **Column grants are declarative.** `GRANT UPDATE (status, decision_*, ...)`
  replaces the hand-written `touchesOnly([...])` comparisons that were repeated
  across the designs and estimates rule blocks. A column that is not granted
  cannot be written by any statement, any policy, any client.
- **Public sign-up is off.** The old provisioner needed email/password sign-up
  enabled on the project - a hole the code documented and could not close.
  Creating accounts now needs the service role key, which only the Edge Function
  has, so sign-up is disabled outright.

**One PostgreSQL subtlety worth knowing**

With several permissive policies on one command, `USING` clauses are OR-ed and
`WITH CHECK` clauses are OR-ed **independently** - a row passes if any `USING`
matches and any `WITH CHECK` matches, not necessarily the same policy's. So
every `WITH CHECK` re-asserts who the caller is. Without that, a staff member
could pass `USING` as staff and `WITH CHECK` as a customer, and file a design
decision as though the customer had typed it. There is a test for exactly that.

**One behavioural difference**

Firestore _rejects_ a query that its rules cannot satisfy; PostgreSQL _filters_
it. A customer asking for another customer's designs now gets an empty list
rather than an error. The security outcome is identical and the tests say so
explicitly.

**Deliberately excluded**

No data migration tooling. The Firebase data was fictional emulator data;
`npm run seed:supabase` recreates a richer version in seconds.

## Module 8 - Department Workflow (delivered)

Approved work goes to the shop floor. Which stages exist is the shop's own
decision, so it is data the owner edits rather than a sequence baked into the
software.

**The four invariants**

- **Work moves in order.** A stage cannot start until the one in front of it is
  finished or skipped. Enforced in the RPC, and the UI does not offer a Start
  button the database would refuse.
- **Stopping always says why.** Holding or skipping a stage requires a reason.
  The rule lives on the table as a CHECK constraint and a trigger, so going
  around the RPC with a direct update does not get past it - there is a test
  that tries exactly that.
- **The history is append-only.** `production_events` has no update grant and no
  delete grant for anybody. What happened on the shop floor is not something
  that gets tidied up afterwards.
- **The artwork is snapshotted.** A run records the approved design and version
  it was started against, so a revision approved next week cannot change the
  answer to "what did we print".

**The state machine**

    pending      -> ready, skipped
    ready        -> in-progress, skipped
    in-progress  -> on-hold, completed, skipped
    on-hold      -> in-progress, skipped
    completed / skipped -> nothing further

Skipping ahead is deliberately allowed from `pending`: knowing up front that a
job needs no lamination is a normal way to work.

**Job status follows the shop floor**

`app.sync_job_status` derives the job's status from its stages: anything running
makes the job in-progress, anything held makes it on-hold, everything settled
makes it ready. Handing the work over stays a separate decision - a delivered or
cancelled job is never touched by production.

That function is the only `SECURITY DEFINER` in the module, and deliberately so:
a designer holds `production:update` but not `jobs:edit`, and should still be
able to complete a stage. The job's status is a derived value, so the database
derives it rather than the shop floor being granted the right to write job
records directly.

**Permissions** (no change to the Module 2 matrix)

- See the board: `production:view` - everyone except accounts
- Move work along: `production:update` - owner, admin, designer, production
- Put a name against a stage: `jobs:assign` - owner and admin. Column grants
  cannot express "these columns need a different permission from those ones",
  because permissive policies OR their checks together, so the assignment rule
  is a trigger instead.
- Configure the stages: `settings:manage` - owner only

**Deliberately excluded**

Workload and capacity assignment - that is Module 9. This module records who is
doing a stage; it does not decide who should be.

## Module 9 - Operations Control (delivered)

Module 8 answered "what happens next". This answers "who is doing it, and what
is late".

**Assignment**

Only `jobs:assign` can hand work out - doing the work (`production:update`) does
not include deciding who does it. That rule is a trigger on the table rather
than a column grant, because permissive policies OR their `WITH CHECK` clauses
together and a grant alone could not express it.

Only active employees can be given work. A stage assigned to somebody who has
left is work nobody is doing that looks exactly like work somebody is doing, so
the RPC refuses it and the picker never offers them.

The assignee's name is read from the employee record rather than trusted from
the caller, so the history cannot be made to say somebody else did the work.

**Reassignment history**

Every assignment writes a `stage-assigned` event saying what actually changed:
`Assigned to X`, `Reassigned from X to Y`, or `Unassigned from X`. "Assigned"
on its own is not a history - it cannot answer why a job sat still for two days.

**The board** (`/production`)

Scope (all / my work / unassigned), stage status, delivery date, department and
employee, plus open-work counts per person. Everything a supervisor asks in a
morning, on one screen.

**Deadlines** (`/scheduling`)

Overdue, due today, due soon - each showing the current stage, who holds it and
the delivery date, with urgent jobs marked. Delivery dates are read live from
the job rather than snapshotted onto the run: rescheduling a delivery has to
move the board.

A run whose every stage is finished is never called late. It is waiting to be
collected, which is a different problem.

**Dashboard**

Two lightweight alerts gated on `production:view`: overdue in production, and
stopped work with the count of unassigned stages.

**Deliberately excluded**

Attendance, payroll, shifts, capacity planning and notifications. This module
records who is doing a stage; it does not decide who should be.
