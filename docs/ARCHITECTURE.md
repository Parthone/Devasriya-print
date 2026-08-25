# Architecture

This document is the contract for how code is written in this repository. It is
short on purpose - every rule here exists because breaking it would cost real
money later.

## 1. Technology

| Concern      | Choice                                                  |
| ------------ | ------------------------------------------------------- |
| UI           | React 19 + TypeScript (strict)                          |
| Build        | Vite 6                                                  |
| Styling      | Tailwind CSS v4 + shadcn/ui (new-york, slate)           |
| Routing      | React Router v7 (data router)                           |
| Server state | TanStack Query v5                                       |
| Validation   | Zod                                                     |
| Backend      | Supabase: Auth, PostgreSQL, Storage, row level security |
| Hosting      | Firebase Hosting (static frontend only)                 |
| Tests        | Vitest + React Testing Library                          |

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
  row mappers + RPCs         <- src/features/*/services/*.rows.ts
        |
        v
  Supabase client            <- src/lib/supabase/*
        |
        v
  PostgreSQL + RLS           <- supabase/migrations/*
```

**Rule: the UI never imports `@supabase/supabase-js` or `@/lib/supabase/*`.**
ESLint enforces it (`no-restricted-imports`); only `src/lib/supabase/**`,
`src/services/**` and each feature's `services/` folder are exempt.

Why: that seam is what made replacing the entire backend a change to 13 service
modules rather than a rewrite. Not one component, page, hook or domain type
changed when Firestore became PostgreSQL. Keep it that way.

## 3. Folder rules

- `src/features/<module>/` owns everything for one business module and exposes a
  public surface through `index.ts`. A feature never reaches into the internals
  of another feature.
- `src/components/ui/` is vendored shadcn/ui output. Regenerate with the shadcn
  CLI; do not hand-edit beyond styling tokens.
- `src/components/common/` is shared application UI.
- `src/lib/` is framework-level and free of business rules.
- `src/services/base/tables.ts` is the only place PostgreSQL table
  paths are written down.

## 4. Data model conventions

- Every document carries audit fields: `createdAt`, `createdBy`, `updatedAt`,
  `updatedBy` (see `src/types/common.ts`). The repository writes them.
- Business records are **soft-deleted** (`isDeleted`), never removed, so history
  and reports stay correct.
- Dates are `Date` in the domain and `timestamptz` in the database. The
  conversion is handled by `src/lib/supabase/rows.ts` - features do
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
- Human-readable document numbers come from `app.next_document_number()`,
  allocated inside the transaction that creates the record, so the series is
  gapless.
- Snapshots (customer name on an enquiry, pickup office on a job) exist for
  history and search. The id stays the authoritative relationship.
- There are two kinds of principal, not one with a dial. An employee has
  `users/{uid}`; a customer has `customerAccounts/{uid}`, no role and no entry
  in the permission matrix, so every permission check is false for them and each
  door they may pass is opened explicitly by their own customer id. A uid is
  never both - each create refuses if the other exists. The session type has a
  separate `customer` variant for the same reason: there is no shape a staff
  check can accidentally succeed against.
- User-facing text on a customer-facing screen comes from `src/i18n`, never from
  a literal in a component. English defines the key type, so a language with a
  missing string does not compile.
- Documents given to a customer are full snapshots, not views. A quotation
  copies the priced lines, totals and customer details at creation and is never
  recomputed, so later changes to the job, the pricing or the rate card cannot
  move what was already quoted. The rules keep those fields immutable by naming,
  per allowed transition, exactly which columns a write may touch.
- Files live at immutable paths under an attachment id in private buckets, and
  no permanent URL is ever persisted - a signed URL is minted at play time
  through the storage service and expires shortly after.
- Data that only some roles may read lives in its own table - `job_pricing`
  rather than columns on the job - so a policy can gate it as a whole. Which
  columns may ever change is a `GRANT UPDATE (col, ...)`, not a hand-written
  comparison: a column that is not granted cannot be written by any statement.
- Dates are displayed in `Asia/Kolkata` via `src/lib/format.ts`. Do not call
  `toLocaleDateString` directly in components.

## 5. Errors

Anything thrown by Supabase is normalised into `AppError` by
`src/lib/supabase/errors.ts`, which carries a stable `code` and a user-safe
message. A rule the database raises itself (SQLSTATE `P0001`) already carries
wording written for a person, and is passed through verbatim. Query retries key off that code. `ErrorBoundary` is the last line of
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
- Staff and customer accounts are created through `UserAccountProvisioner`. The
  shipped implementation calls the `provision-account` Edge Function, because
  creating an auth user needs the service role key and that key bypasses every
  policy in the database. Demo mode substitutes a local stand-in; the
  user-management UI knows about neither.
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
  the route guard blocks direct URLs, and a row level security policy refuses
  the write.
  Hidden UI is never the control.
- `public.role_permissions` carries the same matrix as data, seeded from
  `matrix.ts` by migration. A test asserts the two copies are identical, so
  drift is a failing build rather than a security incident.
- Sensitive changes are recorded in `auditLogs`, written in the same batch as
  the change. Entries are append-only and use server timestamps. The trail is
  browser-written, so it is honest but not tamper-proof - see docs/MODULES.md.

## 7. Security rules

Every table has row level security enabled, and the broad grants Supabase hands
to `anon` and `authenticated` by default are revoked before anything is granted
back. A table is opened only together with the role model it depends on.
Policies are part of the definition of done for a module - not an afterthought.
A blanket allow is never acceptable, including in development (use the local
stack instead).

RPCs are `SECURITY INVOKER` so that policies still apply inside them. The one
`SECURITY DEFINER` function, `app.next_document_number`, is short enough to read
in one screen and touches nothing but the counter table.

## 8. Definition of done for a module

1. Types and zod schemas for its documents.
2. Service built on the Supabase client, with row mappers, query keys and hooks.
3. UI using shadcn/ui primitives, responsive, keyboard accessible.
4. SQL migration with policies, grants and any indexes the queries need.
5. Tests for the business rules it introduces.
6. Roadmap entry in `src/constants/modules.ts` flipped to `done`, nav item
   enabled, `docs/MODULES.md` updated.
7. `npm run verify` passes.
