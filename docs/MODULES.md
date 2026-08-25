# Module roadmap

Modules are built one at a time and approved before implementation starts. The
machine-readable copy of this list lives in `src/constants/modules.ts` and drives
the dashboard roadmap card and the placeholder pages - update both together.

| #   | Module                           | Status        | Notes                                         |
| --- | -------------------------------- | ------------- | --------------------------------------------- |
| 0   | Project Foundation               | **Delivered** | Tooling, shell, Firebase layer, design system |
| 1   | Authentication & Users           | Planned       | Firebase Auth, profiles, protected routes     |
| 2   | Roles & Permissions              | Planned       | RBAC in the UI and in security rules          |
| 3   | Customer Management              | Planned       | Customer directory, contacts, GSTIN           |
| 4   | Enquiries & Jobs                 | Planned       | Enquiry intake, conversion to jobs            |
| 5   | Measurements & Price Calculation | Planned       | Rate cards, area pricing, taxes               |
| 6   | Estimates & Quotations           | Planned       | Quotation builder, revisions, approval        |
| 7   | Design Uploads & Approvals       | Planned       | Storage uploads, proofs, approval trail       |
| 8   | Department Workflow              | Planned       | Production stages and job movement            |
| 9   | Employee Assignment              | Planned       | Assignment and workload                       |
| 10  | Deadlines & Pending Work         | Planned       | Due dates, queues, escalation                 |
| 11  | Billing & Payments               | Planned       | Invoices, advances, outstanding               |
| 12  | Inventory & Materials            | Planned       | Stock, consumption, reorder levels            |
| 13  | Dashboard & Reports              | Planned       | Business summary and reports                  |

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

**Firebase integration**

- Lazily-initialised Auth, Firestore (multi-tab offline persistence) and Storage
  clients
- Emulator Suite wiring behind `VITE_USE_FIREBASE_EMULATORS`
- Deny-all `firestore.rules` and `storage.rules`, plus an empty index file
- Hosting configuration with SPA rewrite and asset caching headers
- Firebase errors normalised into `AppError`

**Shared foundations**

- `FirestoreRepository`: typed CRUD, cursor pagination, live subscriptions,
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

- Firebase email/password sign-in with `browserLocalPersistence`, so a refresh
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
- `scripts/seed-emulator.mjs` seeds emulator accounts for manual testing
- `npm run test:rules` and `npm run test:emulator` run the emulator suites

**Known limitation**

Client-side provisioning means email/password sign-up stays enabled on the
Firebase project, and deactivation cannot disable the Auth account itself. Such
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
- `firestore.rules` carries a `rolePermissions()` map mirroring the matrix for
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
- Composite index for `targetUserId` + `createdAt` in `firestore.indexes.json`

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

- `customers` collection; the UI never touches Firestore directly
- Rules mirror the matrix exactly: all seven roles may read; owner, admin and
  sales may create and edit; **no role may delete**
- Field validation in rules: mobile and PIN patterns, known type and language,
  `nameLower` must match the name, no unexpected fields
- `createdAt` / `createdBy` immutable; every write attributed to the signed-in user
- No new composite index: the only query is `orderBy(nameLower)`, which
  Firestore indexes automatically

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

- One Firestore transaction: allocate the job number, write the job, stamp the
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

Design approval (Module 7), production stages (8), advanced assignment (9),
billing (11).

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
  holds `jobs:edit`, cannot change a price; enforced in firestore.rules
- Manage the rate card: `settings:manage`

**Where pricing is stored**

In its own collection, `jobPricing/{jobId}`, not on the job. Firestore has no
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
that has already been given. Proven end to end against the emulators.

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
three places: the buttons offered, the service, and firestore.rules - where each
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

## Next: Module 7 - Design Uploads & Approvals

Scope to be confirmed before implementation.
