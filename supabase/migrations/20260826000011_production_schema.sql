-- ---------------------------------------------------------------------------
-- Devasriya Print - Module 8: department workflow
--
-- A job that has been approved goes through the shop: printing, finishing,
-- installation. Which stages exist is configurable, because no two print shops
-- have the same ones, and the shape changes as a business grows.
--
-- The invariants this schema is built around:
--   * Stages run in order. A stage cannot start before the one in front of it
--     has finished or been skipped.
--   * Holding or skipping a stage always says why. A job that stopped for a
--     reason nobody wrote down is the thing this is here to prevent.
--   * The history is append-only. What happened, when, and who did it, is not
--     editable by anybody.
--   * The artwork a run was started against is snapshotted, so "what did we
--     print" stays answerable after a later revision.
-- ---------------------------------------------------------------------------

create type app.production_status as enum (
  'pending', 'ready', 'in-progress', 'on-hold', 'completed', 'skipped'
);

create type app.run_status as enum ('in-progress', 'on-hold', 'completed', 'cancelled');

create type app.production_action as enum (
  'run-started', 'stage-unlocked', 'stage-started', 'stage-held', 'stage-resumed',
  'stage-completed', 'stage-skipped', 'stage-assigned', 'run-completed'
);

-- ── Configurable stages ────────────────────────────────────────────────────
-- The shop's own list, in the order work moves through it. Stages are
-- deactivated rather than deleted: a task made last month names the stage it
-- was made from, and that name has to keep meaning something.
create table public.workflow_stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  department  text not null,
  position    integer not null check (position >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid not null
);
create index workflow_stages_order_idx on public.workflow_stages (position, name);

-- ── One production run per job ─────────────────────────────────────────────
create table public.production_runs (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid not null unique references public.jobs (id) on delete restrict,
  job_number             text not null,
  job_title              text not null,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_name          text not null,
  status                 app.run_status not null default 'in-progress',
  -- The artwork this run was started against. Kept even after a later revision
  -- supersedes it, so "what did we actually print" stays answerable.
  approved_design_id     uuid references public.designs (id) on delete restrict,
  approved_design_version integer,
  started_at             timestamptz not null default now(),
  started_by_id          uuid not null,
  started_by_name        text not null,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  created_by             uuid not null,
  updated_at             timestamptz not null default now(),
  updated_by             uuid not null
);
create index production_runs_status_idx on public.production_runs (status);

-- ── One task per stage, per run ────────────────────────────────────────────
create table public.production_tasks (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.production_runs (id) on delete restrict,
  job_id           uuid not null references public.jobs (id) on delete restrict,
  -- The stage this came from, and a snapshot of what it was called at the time.
  -- Renaming a stage later does not rewrite what the shop floor was told.
  stage_id         uuid references public.workflow_stages (id) on delete set null,
  stage_name       text not null,
  department       text not null,
  position         integer not null check (position >= 0),
  status           app.production_status not null default 'pending',
  assigned_to_id   uuid references public.staff_profiles (id) on delete set null,
  assigned_to_name text,
  started_at       timestamptz,
  completed_at     timestamptz,
  hold_reason      text,
  skip_reason      text,
  notes            text check (char_length(coalesce(notes, '')) <= 1000),
  created_at       timestamptz not null default now(),
  created_by       uuid not null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid not null,
  unique (run_id, position),
  -- A stage that stopped or was passed over always says why.
  constraint hold_needs_reason check (
    status <> 'on-hold' or char_length(coalesce(hold_reason, '')) > 0
  ),
  constraint skip_needs_reason check (
    status <> 'skipped' or char_length(coalesce(skip_reason, '')) > 0
  )
);
create index production_tasks_run_idx on public.production_tasks (run_id, position);
create index production_tasks_job_idx on public.production_tasks (job_id);
create index production_tasks_status_idx on public.production_tasks (status);

-- ── The history ────────────────────────────────────────────────────────────
-- Append-only: no update grant and no delete grant, for anybody. What happened
-- on the shop floor is not something that gets tidied up afterwards.
create table public.production_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.production_runs (id) on delete restrict,
  task_id     uuid references public.production_tasks (id) on delete restrict,
  job_id      uuid not null references public.jobs (id) on delete restrict,
  action      app.production_action not null,
  stage_name  text,
  from_status app.production_status,
  to_status   app.production_status,
  reason      text,
  at          timestamptz not null default now(),
  by_id       uuid not null,
  by_name     text not null
);
create index production_events_run_idx on public.production_events (run_id, at desc);
create index production_events_job_idx on public.production_events (job_id, at desc);

-- ── The state machine, as data ─────────────────────────────────────────────
create table public.production_transitions (
  from_status app.production_status not null,
  to_status   app.production_status not null,
  primary key (from_status, to_status)
);
insert into public.production_transitions (from_status, to_status) values
  ('pending', 'ready'), ('pending', 'skipped'),
  ('ready', 'in-progress'), ('ready', 'skipped'),
  ('in-progress', 'on-hold'), ('in-progress', 'completed'), ('in-progress', 'skipped'),
  ('on-hold', 'in-progress'), ('on-hold', 'skipped');
