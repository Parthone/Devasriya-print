# Devasriya Print

Job management software for a printing and advertising business: customers,
enquiries, jobs, custom measurements and pricing, estimates, design approvals,
department-wise production, billing, inventory and reports.

Built as a real commercial application - React + TypeScript on the front end,
Firebase (Authentication, Cloud Firestore, Cloud Storage, Hosting) on the back
end, with an architecture that can move to Google Cloud services later.

> **Status: Modules 0-1 complete** - project foundation, and authentication with
> employee account management. No other business module has been implemented
> yet. See [docs/MODULES.md](docs/MODULES.md) for the roadmap.

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
    auth/       Sign-in, session, route guard plumbing (Module 1)
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
3. Route access goes through `ProtectedRoute`; a role check in the UI is always
   matched by a rule in `firestore.rules`.

Locale is `en-IN`, currency is INR, and all dates are rendered in
`Asia/Kolkata`.
