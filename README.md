# Devasriya Print

Job management software for a printing and advertising business: customers,
enquiries, jobs, custom measurements and pricing, estimates, design approvals,
department-wise production, billing, inventory and reports.

Built as a real commercial application - React + TypeScript on the front end,
Firebase (Authentication, Cloud Firestore, Cloud Storage, Hosting) on the back
end, with an architecture that can move to Google Cloud services later.

> **Status: Module 0 (Project Foundation) complete.** No business module has
> been implemented yet. See [docs/MODULES.md](docs/MODULES.md) for the roadmap.

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

Run `npm run verify` before every commit.

## Project structure

```
src/
  app/          Application bootstrap: providers, router, route guards
  components/
    ui/         shadcn/ui primitives (generated, vendored)
    common/     Shared application components
  config/       App constants and environment parsing
  constants/    Routes, navigation and the module roadmap
  features/     One folder per business module (empty until Module 3)
  hooks/        Shared React hooks
  layouts/      App shell and auth shell
  lib/          Framework-level helpers
    firebase/   Firebase client, emulators, converters, error mapping
  pages/        Shell-level pages (dashboard, sign-in, 404, 403)
  services/     Data-access layer built on Firestore
  styles/       Tailwind entry point and design tokens
  types/        Cross-cutting types
docs/           Architecture and module roadmap
```

## Deployment

Firebase Hosting is configured in `firebase.json` (SPA rewrite, hashed assets
cached for a year, `index.html` never cached).

```bash
npm run build
npx firebase-tools deploy --only hosting
```

Security rules are deployed separately and are currently **deny-all** by design:

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

Locale is `en-IN`, currency is INR, and all dates are rendered in
`Asia/Kolkata`.
