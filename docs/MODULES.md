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

## Next: Module 2 - Roles & Permissions

Scope to be confirmed before implementation:

- Permission catalogue per module and role
- Permission checks in the UI (`ProtectedRoute` already accepts `requires`)
- Firestore rules driven by the same role model
- An audit trail of role and status changes
