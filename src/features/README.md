# Features

One folder per business module, e.g. `customers/`, `enquiries/`, `jobs/`.

Recommended layout inside a feature:

```
customers/
  components/    # UI specific to this feature
  hooks/         # React Query hooks wrapping the feature service
  services/      # data access, built on FirestoreRepository
  types.ts       # domain types and zod schemas
  pages/         # route components
  index.ts       # public surface - other features import only from here
```

Rules:

- A feature never imports internals of another feature; use its `index.ts`.
- A feature never imports the Firebase SDK directly - go through its service.
- Shared UI belongs in `src/components`, shared logic in `src/lib`.

This folder is intentionally empty in Module 0.
