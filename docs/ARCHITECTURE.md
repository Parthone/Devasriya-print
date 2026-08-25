# Architecture

This document is the contract for how code is written in this repository. It is
short on purpose - every rule here exists because breaking it would cost real
money later.

## 1. Technology

| Concern      | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| UI           | React 19 + TypeScript (strict)                                    |
| Build        | Vite 6                                                            |
| Styling      | Tailwind CSS v4 + shadcn/ui (new-york, slate)                     |
| Routing      | React Router v7 (data router)                                     |
| Server state | TanStack Query v5                                                 |
| Validation   | Zod                                                               |
| Backend      | Firebase: Authentication, Cloud Firestore, Cloud Storage, Hosting |
| Tests        | Vitest + React Testing Library                                    |

## 2. Layers

```
pages / features (UI)
        |
        v
  React Query hooks          <- caching, retries, invalidation
        |
        v
  feature services           <- business rules, validation, mapping
        |
        v
  FirestoreRepository        <- src/services/base/repository.ts
        |
        v
  Firebase SDK               <- src/lib/firebase/*
```

**Rule: the UI never imports `firebase/firestore` or `firebase/storage`.**
ESLint enforces it (`no-restricted-imports`); only `src/lib/firebase/**` and
`src/services/**` are exempt.

Why: the data-access seam is what makes it possible to move logic into Cloud
Functions, or to put a Cloud Run API in front of Firestore, without rewriting
screens. Pricing, invoicing and stock deduction will eventually need
server-side authority - that migration must stay a service-layer change.

## 3. Folder rules

- `src/features/<module>/` owns everything for one business module and exposes a
  public surface through `index.ts`. A feature never reaches into the internals
  of another feature.
- `src/components/ui/` is vendored shadcn/ui output. Regenerate with the shadcn
  CLI; do not hand-edit beyond styling tokens.
- `src/components/common/` is shared application UI.
- `src/lib/` is framework-level and free of business rules.
- `src/services/base/collections.ts` is the only place Firestore collection
  paths are written down.

## 4. Data model conventions

- Every document carries audit fields: `createdAt`, `createdBy`, `updatedAt`,
  `updatedBy` (see `src/types/common.ts`). The repository writes them.
- Business records are **soft-deleted** (`isDeleted`), never removed, so history
  and reports stay correct.
- Dates are `Date` in the domain and `Timestamp` in Firestore. The conversion is
  handled by `createConverter` in `src/lib/firebase/converters.ts` - features do
  not convert timestamps themselves.
- Each collection should pass a validator (a zod parse) to `createConverter` so
  malformed documents fail at the boundary rather than in the UI.
- Money is an integer number of paise (`src/lib/money.ts`). Never store or add
  floating point rupees. Display with `formatMoney` from `src/lib/format.ts`.
- Measurements normalise to exact integer micrometres (`src/lib/measurement.ts`),
  and money calculations run in BigInt and round once, half away from zero
  (`src/lib/pricing.ts`). A stored total is always the exact sum of its parts.
- Phone numbers are ten digits without the country code
  (`src/lib/phone.ts`); normalise on the way in, format on the way out.
- A record that other modules will link to (customers, enquiries, jobs) is
  archived or closed, never deleted.
- Human-readable document numbers come from `src/services/base/counters.ts`,
  allocated inside the transaction that creates the record.
- Snapshots (customer name on an enquiry, pickup office on a job) exist for
  history and search. The id stays the authoritative relationship.
- Files live at immutable paths under an attachment id, and no Storage download
  URL is ever persisted - resolve one at play time through the storage service.
- Firestore rules are per document, never per field. Data that only some roles
  may read lives in its own collection - `jobPricing/{jobId}` rather than a
  field on the job - so the rule can actually enforce it.
- Dates are displayed in `Asia/Kolkata` via `src/lib/format.ts`. Do not call
  `toLocaleDateString` directly in components.

## 5. Errors

Anything thrown by Firebase is normalised into `AppError` by
`src/lib/firebase/errors.ts`, which carries a stable `code` and a user-safe
message. Query retries key off that code. `ErrorBoundary` is the last line of
defence; feature-level boundaries can be nested inside it.

## 6. Routing and access control

- Paths live in `src/constants/routes.ts`. Never hard-code a path string.
- `src/app/router/ProtectedRoute.tsx` is the guard seam. In Module 0 it is a
  pass-through; Module 1 adds the authentication redirect and Module 2 adds the
  permission check. The route table does not change when they land.
- As features grow, register their routes with the React Router route-level
  `lazy` option so each module is code-split.

## 6a. Authentication and sessions (Module 1)

- `AuthProvider` owns the session and is the only place that decides who is let
  in. `resolveSession` in `src/features/auth/session.ts` is the pure function
  that makes that call, so the rule is unit tested directly: an account needs a
  profile document, and that profile must be active.
- Rejected sessions are signed out immediately and the reason is kept, so the
  sign-in screen can explain what happened.
- `useAuth` gives the session; `useAuthenticatedUser` is for code that only runs
  inside a protected route.
- Staff accounts are created through `UserAccountProvisioner`. The shipped
  implementation uses a secondary Firebase app so the administrator session is
  untouched; a Cloud Function implementation can replace it without changing the
  user-management UI.
- Passwords are never entered or seen by administrators - new employees get a
  password setup email.

## 6b. Permissions (Module 2)

- Every capability is a typed `resource:action` constant in
  `src/features/permissions/catalogue.ts`; `Permission` is a union, so a typo
  fails the build.
- `matrix.ts` holds the default role matrix as data, and `resolvePermissions`
  turns a role into effective permissions. It already accepts overrides so a
  Settings editor can be added later without touching feature code; nothing
  produces overrides yet.
- Feature code never compares role strings. Use `usePermission`,
  `usePermissions`, or the `<Can permission="...">` gate; guard routes with
  `ProtectedRoute requires={[...]}`.
- Three layers enforce the same rule: the sidebar hides what a user cannot open,
  the route guard blocks direct URLs, and `firestore.rules` refuses the write.
  Hidden UI is never the control.
- `firestore.rules` carries its own `rolePermissions()` map covering the
  collections that exist. Each module extends it when it opens a collection, and
  the module is not done until the rules match the matrix.
- Sensitive changes are recorded in `auditLogs`, written in the same batch as
  the change. Entries are append-only and use server timestamps. The trail is
  browser-written, so it is honest but not tamper-proof - see docs/MODULES.md.

## 7. Security rules

`storage.rules` is deny-all, and `firestore.rules` denies everything except the
collections a delivered module has opened up (currently `users`). A collection is
opened only together with the role model it depends on. Rules are part
of the definition of done for a module - not an afterthought. A blanket allow is
never acceptable, including in development (use the emulators instead).

## 8. Definition of done for a module

1. Types and zod schemas for its documents.
2. Service built on `FirestoreRepository`, with query keys and hooks.
3. UI using shadcn/ui primitives, responsive, keyboard accessible.
4. Firestore and Storage security rules, plus any composite indexes.
5. Tests for the business rules it introduces.
6. Roadmap entry in `src/constants/modules.ts` flipped to `done`, nav item
   enabled, `docs/MODULES.md` updated.
7. `npm run verify` passes.
