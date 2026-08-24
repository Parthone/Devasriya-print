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

## Next: Module 1 - Authentication & Users

Scope to be confirmed before implementation:

- Email/password sign-in, sign-out and session restore
- A `users` collection with profile documents and an `isActive` flag
- `ProtectedRoute` redirecting unauthenticated users to `/login`
- Current-user context and a user menu in the app shell
- Firestore rules for the `users` collection
