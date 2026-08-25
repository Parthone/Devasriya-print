# Devasriya Print

Job management software for a printing and advertising business: customers,
enquiries, jobs, custom measurements and pricing, estimates, design approvals,
department-wise production, billing, inventory and reports.

Built as a real commercial application - React + TypeScript on the front end,
Firebase (Authentication, Cloud Firestore, Cloud Storage, Hosting) on the back
end, with an architecture that can move to Google Cloud services later.

> **Status: Modules 0-3 complete** - project foundation, authentication and
> employee accounts, role-based permissions with an audit trail, and customer
> management. See [docs/MODULES.md](docs/MODULES.md) for the roadmap.

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
    permissions/ Permission catalogue, role matrix, gates (Module 2)
    users/      Employee directory and account provisioning (Module 1)
  hooks/        Shared React hooks
  layouts/      App shell and auth shell
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
