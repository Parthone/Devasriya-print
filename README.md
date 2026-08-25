# Devasriya Print

Job management software for a printing and advertising business: customers,
enquiries, jobs, custom measurements and pricing, estimates, design approvals,
department-wise production, billing, inventory and reports.

Built as a real commercial application - React + TypeScript on the front end,
Firebase (Authentication, Cloud Firestore, Cloud Storage, Hosting) on the back
end, with an architecture that can move to Google Cloud services later.

> **Status: Modules 0-5 complete** - foundation, authentication and employee
> accounts, role-based permissions with an audit trail, customer management,
> enquiries with conversion to jobs, and measurements with price calculation.
> See [docs/MODULES.md](docs/MODULES.md) for the roadmap.

---

## Requirements

- Node.js 20.19+ (the repo is developed on Node 24 - see `.nvmrc`)
- npm 10+
- A Firebase project (for anything beyond the local emulators)
- `firebase-tools` for emulators and deploys: `npm install -g firebase-tools`

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the Firebase values
npm run dev
```

The app runs at http://localhost:5173. Without Firebase credentials the shell
still boots - the dashboard reports the configuration as missing.

### Environment variables

All configuration comes from `.env.local`, which is git-ignored. Copy the keys
from `.env.example`; the values are in the Firebase console under
**Project settings > General > Your apps > Web app > SDK setup and
configuration**.

| Variable                            | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Firebase web API key                   |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Auth domain                            |
| `VITE_FIREBASE_PROJECT_ID`          | Project id                             |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Cloud Storage bucket                   |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender id                              |
| `VITE_FIREBASE_APP_ID`              | Web app id                             |
| `VITE_FIREBASE_MEASUREMENT_ID`      | Optional, Google Analytics             |
| `VITE_USE_FIREBASE_EMULATORS`       | `true` to use the local Emulator Suite |

### Local development against the emulators

```bash
cp .firebaserc.example .firebaserc   # set your project id
npm run emulators                    # terminal 1 - Auth, Firestore, Storage, UI
# set VITE_USE_FIREBASE_EMULATORS=true in .env.local
npm run dev                          # terminal 2
```

Emulator UI: http://localhost:4000. Ports are defined once in `firebase.json`
and mirrored in `src/lib/firebase/emulators.ts`.

## Scripts

| Script                            | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `npm run dev`                     | Start the Vite dev server                        |
| `npm run build`                   | Type-check and build for production into `dist/` |
| `npm run preview`                 | Serve the production build locally               |
| `npm run typecheck`               | TypeScript project build (no emit)               |
| `npm run lint`                    | ESLint, zero warnings allowed                    |
| `npm run lint:fix`                | ESLint with autofix                              |
| `npm run format` / `format:check` | Prettier                                         |
| `npm run test`                    | Vitest, single run                               |
| `npm run test:watch`              | Vitest in watch mode                             |
| `npm run test:coverage`           | Vitest with a V8 coverage report                 |
| `npm run emulators`               | Firebase Emulator Suite                          |
| `npm run verify`                  | typecheck + lint + format check + tests + build  |

Run `npm run verify` before every commit. `test:rules` and `test:emulator` are
run separately because they need the emulators (and therefore Java) running.

## Accounts and sign-in

Devasriya Print is staff-only software: **there is no public sign-up**. Every
account is created by an owner or administrator from **Employees**
(`/settings/users`), and each account has a Firestore profile at `users/{uid}`
keyed to its Firebase Auth UID.

Being signed in to Firebase is not enough to be signed in to the application.
A session is only accepted when the profile document exists **and** its
`isActive` flag is true; anything else is signed out immediately, on login and
on session restore alike.

### Creating the first owner

The application can only create staff once an administrator is signed in, so the
first account is created out of band with the Admin SDK.

```bash
# Real project - the service-account key is a secret, keep it outside the repo
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
npm run bootstrap:owner -- --email owner@yourbusiness.in --name "Owner Name" --mobile 9876543210 --project your-project-id
```

The script prints a password setup link for the owner. Never commit a
service-account key - keep the file outside the repository entirely.

### Creating employees

An administrator fills in name, email, mobile, designation, department and role.
The employee then receives an email to set their own password - **the
administrator never sees or types a staff password**.

Accounts are created client-side through a secondary Firebase app so that the
administrator stays signed in. One consequence to be aware of: email/password
sign-up remains enabled on the Firebase project, so an account could in
principle be created outside this flow. Such an account has no profile document,
and both the application and the Firestore rules reject it, so it grants access
to nothing. Moving provisioning to a Cloud Function with the Admin SDK (which
requires the Blaze plan) removes even that possibility - it means adding one
implementation of `UserAccountProvisioner` and swapping a single binding in
`src/features/users/services/provisioning/index.ts`.

### Deactivating an employee

Deactivation sets `isActive: false`. The employee is blocked by the application
and by the security rules, and is signed out the moment the session is
re-checked. Their Firebase Auth account still exists (the client SDK cannot
disable it), so they can still authenticate - and are then rejected with a clear
message before any data is loaded. Records are never deleted, so history stays
intact.

### Testing accounts in the emulators

```bash
npm run emulators        # terminal 1
npm run seed:emulator    # terminal 2
npm run dev              # terminal 3, with VITE_USE_FIREBASE_EMULATORS=true
```

| Email                     | Password       | What it exercises                 |
| ------------------------- | -------------- | --------------------------------- |
| `owner@devasriya.test`    | `Owner@12345`  | active owner, full access         |
| `designer@devasriya.test` | `Design@12345` | active staff, no admin area       |
| `inactive@devasriya.test` | `Inactive@123` | deactivated account               |
| `ghost@devasriya.test`    | `Ghost@12345`  | authenticates, but has no profile |

Password reset emails are not sent by the emulator - the reset link is printed
in the emulator console instead.

## Roles and permissions

Every capability is a typed `resource:action` permission listed once in
[`src/features/permissions/catalogue.ts`](src/features/permissions/catalogue.ts),
and the default role matrix lives in
[`matrix.ts`](src/features/permissions/matrix.ts). Owner and admin can see the
live matrix in the app under **Roles & Permissions**.

Two permissions are reserved for the owner: `employees:manage-admins` (handing
out owner and admin roles) and `settings:manage`. Everything else is available
to admin.

### Using permissions in code

```tsx
// Hide an action
<Can permission="employees:manage">
  <Button>Add employee</Button>
</Can>;

// Branch in a component
const canAssign = usePermission('jobs:assign');

// Guard a route
<ProtectedRoute requires={['billing:view']}>
  <BillingPage />
</ProtectedRoute>;
```

Hiding UI is presentation, never protection. Every gated action is enforced in
three places: the sidebar hides it, the route guard blocks direct URLs, and
`firestore.rules` refuses the write. The rules carry their own copy of the
matrix (`rolePermissions()`), limited to the collections that exist today; each
module extends it when it opens its own collection.

### Adding a permission

1. Add the constant to `PERMISSIONS` and a label to `PERMISSION_LABELS`.
2. Grant it in the role matrix.
3. Add it to the expected table in `matrix.test.ts` - a permission that widens
   access without a deliberate test change fails the build.
4. Mirror it in `firestore.rules` when the collection it protects exists.

### Future configurability

`resolvePermissions(role, overrides)` already applies per-role grants and
revocations, so a Settings editor can be added later without touching feature
code. No override document and no editor exist yet; the defaults are what runs.
Owner-only permissions can never be granted to another role by an override.

## Audit trail

Role changes, activation and deactivation, employee creation and detail edits
are recorded in the `auditLogs` collection and shown per employee under
**Employees > View history**.

Each entry is written in the same batch as the change it describes, so the
record and its history commit together or not at all. Entries are append-only:
`firestore.rules` refuses every update and delete, requires the actor to be the
signed-in user, and requires server timestamps so entries cannot be back-dated.

**Limitation, stated plainly:** entries are written by the browser, so the trail
is reliable against mistakes and partial failures but is **not tamper-proof**.
Somebody with direct database or service-account access could still write or
withhold entries. Making the trail authoritative requires a Cloud Function using
the Admin SDK, which needs the Blaze plan.

## Customers

The customer directory lives at `/customers`, with a detail page at
`/customers/:customerId`. Every role can view customers; owner, admin and sales
can add and edit them.

**Customers are never deleted.** Enquiries, jobs, estimates and invoices will
all point at these records, so the only way to take one out of circulation is to
archive it, which is reversible.

### Search and paging

The directory loads once (up to 1000 customers), caches the result, and then
searches and pages in the browser. That gives substring search across name,
business name, mobile, alternate mobile, email, GSTIN and city - typing "kumar"
finds "Ravi Kumar", and a number typed with spaces or +91 still matches. If a
business ever exceeds the cap the screen says so rather than quietly showing a
partial list, and search can move into Firestore behind
`src/features/customers/services/` without the UI changing.

### Duplicate mobile numbers

If another customer already uses the primary mobile number, the form shows a
warning with a link to that record and **still allows saving** - families and
small businesses genuinely share numbers.

### Preferred language

Every customer stores Hindi or English. Nothing uses it yet; it is captured now
so the future customer portal and any printed or messaged output can honour it
without a data migration.

### Reserved portal link

Each customer document carries a `portalUserId` field, always `null` today. When
the customer portal is built it can attach an auth account by writing that one
field. Module 3 never sets or edits it, and `firestore.rules` rejects any
ordinary customer edit that tries to change it.

## Demo mode (temporary)

`VITE_DEMO_MODE=true` turns the app into a self-contained UI demo for the
GitHub Pages build, where there is no Firebase project to talk to.

```bash
VITE_DEMO_MODE=true npm run dev     # or set it in .env.local
```

What changes:

- The sign-in screen shows a **Demo Mode** label and one **Enter Demo** button.
  No email, no password, nothing validated.
- Clicking it creates a local **Demo Owner** session
  (`demo@devasriya.local`, role Owner) with the full owner permission matrix,
  kept in `sessionStorage` so a refresh keeps the demo going for that tab.
- Firebase is never contacted: no session restore, no sign-in, no Firestore
  reads. The Firebase auth provider is not even mounted.
- Screens are served from small fixed datasets - six customers, five employees
  and a couple of audit entries.
- Add, edit and archive work **in memory** for the current page load, so the
  forms and dialogs can be demonstrated. A reload restores the sample data.

What does not change:

- With `VITE_DEMO_MODE` unset or `false` the application behaves exactly as
  before: Firebase sign-in, session restore, profile and active checks,
  permissions and Firestore-backed data.
- No production authentication or data-access code was removed or weakened.
- Security rules are untouched. Demo mode is a browser-side build flag; it
  cannot grant access to any real project.

Demo mode lives in `src/config/demo.ts` and `src/features/demo/`. Removing it
later means deleting that folder, the `isDemoMode()` branches in the services,
and the provider switch in `AppProviders`.

## Enquiries and jobs

The flow is: customer, enquiry, follow-ups, then conversion into a job that
later modules price, design, produce and invoice.

### Numbers

Enquiries and jobs get a human-readable number per Indian financial year, from a
transactional counter: `ENQ-2627-0001`, `JOB-2627-0001`. The sequence restarts
each April. Counters are never shown in the UI, cannot be listed, and the
security rules only accept an increase of exactly one from somebody who may
create that kind of record.

### Requirements, typed and spoken

Every enquiry has a typed requirement, and optionally a voice recording made in
the browser with `MediaRecorder` (Opus in WebM, MP4/AAC on Safari). Recordings
are capped at 3 minutes and 5 MB, can be played back before saving, and can be
replaced or removed. A direct job can carry its own recording too.

Two rules protect the trail:

- **No download URL is ever stored.** Only the storage path and metadata are on
  the document; the playable URL is resolved at play time for the signed-in
  user. A stored URL would outlive the permission check that produced it.
- **Recording paths are immutable.** Replacing a recording uploads a new file
  under a new attachment id; the document is updated only after that upload
  succeeds. A job converted from an enquiry therefore keeps playing the exact
  recording that existed at conversion time, and a superseded file is only
  deleted when nothing else can still reference it.

Storage holds nothing else: `storage.rules` allows requirement audio under
`enquiries/{id}/requirement/...` and `jobs/{id}/requirement/...` and denies
everything else. The two are kept strictly apart: reading enquiry audio needs
`enquiries:view`, reading job audio needs `jobs:view`. Converting an enquiry
**copies the bytes** to a job-owned path rather than sharing the enquiry file,
so a role such as accounts - which sees jobs but not enquiries - can play the
job recording without gaining any access to enquiry storage.

### Conversion

Converting an enquiry copies the requirement recording to a job-owned path,
then writes the job, allocates its number and stamps the enquiry as converted in
**one Firestore transaction**. The copy happens first, so a failed upload means
nothing was written at all; if the transaction then fails, the orphaned copy is
discarded. The enquiry recording is never modified or deleted, and replacing it
later cannot change what the job plays. Either all of it lands or
none of it does, so an enquiry can never be marked converted without the job it
names. A second conversion is refused, including from a stale copy of the
enquiry left open in another tab. The edit form cannot set the converted status
by hand - the service refuses it and so do the rules.

### Pickup offices

Owner-managed under **Settings, Pickup offices**. Each office has an address and
one contact person, so a customer always has somebody to ask about status,
payment or a design problem. Choosing an office on a job snapshots the office
name, contact name and contact number onto the job, so later edits to the office
never rewrite past jobs. Any active staff member can read the office list,
because anyone creating a job has to choose one.

### Who can do what

Exactly the Module 2 matrix, unchanged. Sales creates and edits enquiries and
jobs; production edits jobs; accounts sees jobs but not enquiries; only owner and
admin assign work. Assignment controls only appear for roles that already hold
the matching permission, so nobody needed extra access to the staff directory.

## Dashboard

The dashboard is the operational overview: KPI tiles, a "needs attention" panel,
the enquiry pipeline and job breakdown, upcoming deliveries, recent updates and
permission-aware quick actions.

Two things worth knowing about how it works:

- **It costs no extra reads.** Every number is derived in the browser from the
  same cached customer, enquiry and job queries the directory screens use. There
  are no counting queries and no dashboard collection. A source is only fetched
  when the signed-in role may read it, so a role such as accounts - which has no
  `enquiries:view` - never issues a request for enquiries, and sees no enquiry
  sections at all.
- **Dates are business dates.** "Today", "overdue" and "due in the next three
  days" are calendar days in Asia/Kolkata (`src/lib/business-day.ts`), so work
  does not jump to the wrong day late in the evening when UTC has already rolled
  over. Overdue and due-soon are strictly separate, so nothing is counted twice.

**Recent updates** is built from the `createdAt`, `updatedAt` and `convertedAt`
timestamps that already exist on records - it shows the latest change per
record, newest first. It is not an audit log and does not claim to be: two edits
to the same job appear as one entry. A real business-event log can come later if
it is ever needed; the employee audit trail from Module 2 is unaffected.

With no data at all, the dashboard shows a short "Get started" panel instead of
a wall of zeros - with an action only for someone who may add a customer.

## Measurements and pricing

A job can hold up to 50 priced items. Each one records what was measured, how it
was priced and what it came to, and the job carries the subtotal, an optional
adjustment and the total.

### Money is never a floating point number

Amounts are whole paise (`src/lib/money.ts`). Rates, line amounts and totals are
integers all the way through, so `Rs 99.999999` cannot happen.

The calculation itself (`src/lib/pricing.ts`) multiplies in `BigInt` over exact
integers and rounds **once per line, half away from zero**, to whole paise. The
subtotal is the exact integer sum of the stored line amounts and the total is
subtotal plus the signed adjustment, so the figure at the bottom always equals
the lines above it. The total is never allowed below zero, in the form and in
the security rules.

### Measurements are exact

Every unit converts to whole micrometres by an exact integer factor - one inch
is exactly 25400 um - so six feet is exactly 1828800 um with no drift, and
imperial and metric mix freely (`src/lib/measurement.ts`). Supported units: mm,
cm, inch, foot and metre.

Pricing methods: per square foot, per square metre, per running foot, per
running metre, per piece and flat rate. Each method asks only for the fields it
needs - a per-piece line has no width, and a flat line has no quantity.

### Rates are snapshots

Choosing an item from the rate card fills in its default rate, and the rate
stays editable for that job. What gets stored on the line is the rate **actually
used**, together with the entered dimensions, the unit, the quantity and the
calculated area or length. Nothing is ever read back from the rate card, so
changing a price tomorrow cannot move a job that was priced yesterday - there is
an end-to-end test that doubles a rate and checks the old job is untouched.

### Who can do what

- **See pricing:** `estimates:view` - owner, admin, sales, accounts, viewer.
  Designer and production see the job but not the money.
- **Change pricing:** `jobs:edit` **and** `estimates:create` - owner, admin and
  sales. Production holds `jobs:edit` so it can move a job along, and the
  security rules specifically stop that being enough to change a price.
- **Manage the rate card** (Settings, Products & rates): `settings:manage`,
  owner only. Items are deactivated, never deleted, because old jobs name them.

### Where pricing lives

Pricing is **not** on the job document. It is a separate document at
`jobPricing/{jobId}`, because Firestore has no field-level read rules: money
kept on the job would be readable by anyone who may read jobs, which includes
designer and production.

Keeping it apart lets the rules gate the money itself - reading needs
`estimates:view`, so designer and production are refused at the database, not
just in the UI. The job detail page only asks for pricing when the signed-in
user holds that permission, so no denied request is ever sent. Nothing about
money remains on `jobs/{jobId}`.

## Estimates and quotations

A quotation is made **from a priced job**, and it is a historical record. When it
is created it copies the job pricing exactly as that pricing stands: the priced
lines, the subtotal, the adjustment and the total, along with the customer's
name, business name, address and GSTIN. Nothing is linked back afterwards, so
re-pricing the job, changing a rate on the rate card or editing the customer
record cannot move a quotation that has already been given. There is an
end-to-end test that triples a rate and checks the quotation is unchanged.

Quotations are numbered `EST-2627-0001` in the Indian financial year, allocated
in the same transaction that writes the document, so two people quoting at the
same moment can never be given the same number.

### The life of a quotation

    draft  -> sent, cancelled
    sent   -> approved, rejected, expired, cancelled
    approved / rejected / expired / cancelled -> nothing further

Only a **draft** can have its wording and validity date changed. Once it has gone
out, the answer to a changed price is a new quotation from the job, not a quiet
edit to the old one. That rule is enforced three times over: the buttons that are
offered, the service, and the security rules - where each allowed move names the
exact keys it may touch, so a status change can never smuggle a rewritten price
alongside it. Nothing is ever deleted; a withdrawn quotation is cancelled.

Approval and rejection are recorded by staff on the customer's behalf until the
customer portal arrives, so the record keeps the outcome, when it was recorded,
who recorded it and whatever the customer said.

### Screens

- **Estimates** (`/estimates`) - search by quotation number, job number,
  customer, business name or mobile; filter by status; paged
- **Quotation detail** (`/estimates/{id}`) - the record, the actions the current
  role and status actually allow, and the quotation document itself
- The quotation prints straight from the browser. There is no PDF library: a
  print stylesheet drops the application shell and leaves the document.
- **Job detail** gains a "Create quotation" action and lists the quotations
  already raised against that job

### Who can do what

- **See quotations:** `estimates:view` - owner, admin, sales, accounts, viewer.
  Designer and production are refused at the database, and the UI never asks.
- **Create and edit a draft:** `estimates:create` and `estimates:edit` - owner,
  admin and sales.
- **Record what the customer decided:** `estimates:approve` - owner, admin and
  sales. The rules check the recorded name is the signed-in user's own.

### No tax here

Module 6 is deliberately tax-neutral. GST belongs to invoicing in Module 11, and
no placeholder tax fields were added to the quotation.

## Designs and approvals

A job can carry many design versions, and **every version is written once**. A
revision is a new document with the next version number and a new file in
Storage; nothing about an existing version can be edited afterwards - not the
file, not the version number, not the job or customer it belongs to. That is
what makes "version 2 was approved" a statement that stays true.

Version ids are `{jobId}-v{n}`, so two designers uploading at the same instant
collide on the create rather than both being handed version 3.

### The life of a design version

    draft                -> submitted for review, superseded
    submitted for review -> approved, rejected, changes requested, superseded
    changes requested / approved / rejected -> superseded
    superseded           -> nothing further

Marking a version superseded moves the status and nothing else: the file, the
version number and whatever the customer said about it stay exactly as they
were. A change request is still readable, word for word, long after the revision
that answered it went out.

### Approve, ask for changes, or reject

The comment box is on screen for **approval too**. "Approved, but please make the
font bigger" is one of the commonest real answers, and it is an approval and an
instruction at once - hiding the box behind a rejection would throw the
instruction away. Rejections and change requests need a comment; approvals do
not.

Every answer records how it arrived: `source: 'customer'` when the customer
answered in the portal, `source: 'staff'` when a staff member wrote down what
they said on the phone. The security rules pin both the source and the identity
to whoever is actually signed in, so staff cannot file an answer as though the
customer had typed it, and one customer cannot answer for another.

### The customer review portal

Customers are **not employees with fewer permissions**. An employee has a
`users/{uid}` profile; a customer has `customerAccounts/{uid}`, holds no role,
and appears nowhere in the permission matrix - every permission check in the
rules is false for them. One uid is never both kinds: creating either is refused
if the other already exists for that uid.

The portal lives at `/portal`, with its own shell, its own guard and its own
sign-in page. A customer who lands on a staff URL is sent back to the portal; a
staff member who lands on the portal is sent to the dashboard. A customer can
reach exactly their own orders and their own designs, and the query the portal
sends is the same condition the database enforces - anything wider is refused by
Firestore, not merely filtered in the browser.

Portal logins are created from the customer record. The account is made with a
throwaway password and the customer is emailed a link to set their own, so
nobody at the shop ever knows a customer's password. Access is revoked by
deactivating the account, never by deleting it, so the designs they approved
keep their name on them.

### Hindi and English

The customer-facing screens are fully bilingual. `src/i18n` holds one flat,
namespaced catalogue; English defines the key type, so a missing Hindi string is
a compile error rather than an English sentence appearing on a Hindi screen.

A customer opens the portal in the `preferredLanguage` recorded on their
customer record, and can switch at any time from the header - an explicit choice
wins from then on. The two buttons are labelled in their own scripts and never
translated, so somebody who opened the wrong language can read their way out.
Uploaded artwork is never translated, only the software around it.

### Design files

    designs/{jobId}/{designId}/{attachmentId}.{ext}

JPG, PNG, WEBP or PDF, up to 25 MB. Source files (AI, PSD, CDR) are production
assets rather than review artefacts and are deliberately refused - a reviewer
cannot open them.

No download URL is ever stored in Firestore. A Storage URL is a bearer token
that would outlive the permission check that produced it, and a design is
exactly the kind of thing that must not leak to another customer, so the
viewable URL is resolved at run time for whoever is signed in. Images render
inline; PDFs open in the browser's own viewer. There is no design editor and no
PDF library.

Storage refuses a second write to a path that already holds an object, and
refuses every delete under `designs/`. An upload whose Firestore write then
fails therefore leaves an unreferenced object behind - a deliberate trade: an
orphaned file costs storage, a deletable one would cost the guarantee that an
approval means something.

### Who can do what

- **See designs:** `designs:view` - everyone except accounts.
- **Upload a version and send it for approval:** `designs:upload` - owner,
  admin and designer.
- **Record what the customer said:** `designs:approve` - owner, admin and sales.
- **Customers** answer their own designs and can do nothing else at all.

### Handing artwork to production

The approved design is the version whose status is `approved`. It is
deliberately **not** copied onto the job as a pointer: a customer approving from
the portal writes one document - their own version - and is never given write
access to the job record, so there is no denormalised field that can drift out
of step with the decision that set it. Approving a version supersedes any
earlier approval, so a job never has two.

## Project structure

```
src/
  app/          Application bootstrap: providers, router, route guards
  components/
    ui/         shadcn/ui primitives (generated, vendored)
    common/     Shared application components
  config/       App constants and environment parsing
  constants/    Routes, navigation and the module roadmap
  features/
    audit/      Append-only trail of sensitive changes (Module 2)
    auth/       Sign-in, session, route guard plumbing (Module 1)
    customers/  Customer directory, detail and archiving (Module 3)
    dashboard/  Operational overview derived from the other features
    enquiries/  Enquiry intake, follow-ups, voice requirements (Module 4)
    jobs/       Jobs, conversion from enquiries, assignment (Module 4)
    locations/  Pickup offices and their contact people (Module 4)
    products/   Rate card and the Products & rates screen (Module 5)
    estimates/  Quotations made from a priced job (Module 6)
    designs/    Design versions, review and approval (Module 7)
    customer-portal/ Customer logins and the review portal (Module 7)
    demo/       Temporary demo-mode session and sample data
    permissions/ Permission catalogue, role matrix, gates (Module 2)
    users/      Employee directory and account provisioning (Module 1)
  hooks/        Shared React hooks
  layouts/      App shell and auth shell
  i18n/         Translation catalogue and language provider (Module 7)
  lib/          Framework-level helpers
    firebase/   Firebase client, emulators, converters, error mapping
  pages/        Shell-level pages (dashboard, 404, 403)
  services/     Data-access layer built on Firestore
  styles/       Tailwind entry point and design tokens
  types/        Cross-cutting types
scripts/        Admin SDK tooling: owner bootstrap, emulator seeding
docs/           Architecture and module roadmap
```

## Deployment

Firebase Hosting is configured in `firebase.json` (SPA rewrite, hashed assets
cached for a year, `index.html` never cached).

```bash
npm run build
npx firebase-tools deploy --only hosting
```

Security rules are deployed separately. Everything is denied except the `users`
collection, which Module 1 opens up:

```bash
npx firebase-tools deploy --only firestore:rules,storage:rules
```

## Conventions

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding code. The two
rules that matter most:

1. The UI never imports the Firebase SDK - all data access goes through
   `src/services`. ESLint enforces this.
2. Money is stored as integer paise (`src/lib/money.ts`), never as floating
   point rupees.
3. Route access goes through `ProtectedRoute`; a permission checked in the UI is
   always matched by a rule in `firestore.rules`.
4. Permissions come from the catalogue - never compare role strings in feature
   code.

Locale is `en-IN`, currency is INR, and all dates are rendered in
`Asia/Kolkata`.
