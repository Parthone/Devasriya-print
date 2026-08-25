-- ---------------------------------------------------------------------------
-- Devasriya Print - core schema
--
-- Conventions used throughout:
--   * Money is an integer number of paise (bigint). Never numeric, never float:
--     floating point rupees cannot represent 0.1 exactly, which silently
--     corrupts totals on an invoice.
--   * Snapshot columns (customer_name on a job, product_name on a priced line,
--     job_number on an estimate) are deliberate history, not duplication. They
--     are never recomputed from the record they were copied from.
--   * Every business table carries created_at/by and updated_at/by. Nothing is
--     hard deleted; records are archived, cancelled or superseded.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;

-- ── Vocabulary ─────────────────────────────────────────────────────────────
-- Each enum mirrors a `as const` array in the TypeScript domain exactly.

create type app.principal_kind   as enum ('staff', 'customer');
create type app.staff_role       as enum ('owner','admin','sales','designer','production','accounts','viewer');
create type app.language_code    as enum ('hi','en');
create type app.customer_type    as enum ('individual','business');

create type app.enquiry_source   as enum ('walk-in','phone','whatsapp','referral','repeat','online','other');
create type app.enquiry_status   as enum ('new','contacted','follow-up','quotation-required','converted','lost','closed');

create type app.job_status       as enum ('open','in-progress','ready','delivered','on-hold','cancelled');
create type app.job_priority     as enum ('normal','urgent');

create type app.product_category as enum ('printing','signage','branding','stationery','fabrication','other');
create type app.pricing_method   as enum ('per-square-foot','per-square-meter','per-running-foot','per-running-meter','per-piece','flat-rate');
create type app.measurement_unit as enum ('mm','cm','inch','foot','meter');
create type app.rate_unit        as enum ('sq-ft','sq-m','running-ft','running-m','piece','flat');

create type app.estimate_status  as enum ('draft','sent','approved','rejected','expired','cancelled');
create type app.estimate_outcome as enum ('approved','rejected');

create type app.design_status    as enum ('draft','submitted-for-review','changes-requested','approved','rejected','superseded');
create type app.decision_outcome as enum ('approved','rejected','changes-requested');
create type app.decision_source  as enum ('customer','staff');

create type app.audio_source     as enum ('staff','customer');
create type app.audit_action     as enum ('employee-created','role-changed','status-changed','profile-updated');
create type app.counter_scope    as enum ('enquiries','jobs','estimates');

-- ── Identity ───────────────────────────────────────────────────────────────
-- One row per auth user, fixing which kind of principal it is.
--
-- A customer is not an employee with fewer permissions: they are a different
-- kind of principal, with no role and no entry in the permission matrix. The
-- composite foreign keys below turn "a uid is never both" into a database
-- guarantee rather than an application check that can race.

create table public.principals (
  id   uuid primary key references auth.users (id) on delete restrict,
  kind app.principal_kind not null,
  unique (id, kind)
);

create table public.staff_profiles (
  id          uuid primary key,
  kind        app.principal_kind generated always as ('staff'::app.principal_kind) stored,
  name        text not null check (char_length(name) between 2 and 120),
  email       citext not null unique,
  mobile      text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  designation text not null,
  department  text not null,
  role        app.staff_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid not null,
  foreign key (id, kind) references public.principals (id, kind) on delete restrict
);
create index staff_profiles_name_idx on public.staff_profiles (lower(name));

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 120),
  name_lower         text generated always as (lower(name)) stored,
  business_name      text,
  type               app.customer_type not null,
  mobile             text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  alternate_mobile   text check (alternate_mobile is null or alternate_mobile ~ '^[6-9][0-9]{9}$'),
  email              citext,
  address            text not null check (char_length(address) between 1 and 400),
  city               text not null,
  state              text not null,
  pincode            text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  gstin              text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  preferred_language app.language_code not null default 'hi',
  notes              text,
  is_archived        boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid not null
);
create index customers_name_lower_idx on public.customers (name_lower);
create unique index customers_active_mobile_idx on public.customers (mobile) where not is_archived;

-- A customer's login for the review portal. The document id is the auth uid,
-- exactly as it is for staff, and that link is what every policy is built on.
create table public.customer_accounts (
  id                 uuid primary key,
  kind               app.principal_kind generated always as ('customer'::app.principal_kind) stored,
  customer_id        uuid not null unique references public.customers (id) on delete restrict,
  customer_name      text not null,
  email              citext not null,
  preferred_language app.language_code not null default 'hi',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid not null,
  foreign key (id, kind) references public.principals (id, kind) on delete restrict
);

-- ── The permission matrix, as data ─────────────────────────────────────────
-- Mirrors src/features/permissions/matrix.ts. Kept as rows rather than baked
-- into policy bodies so a future Settings screen can edit it without a
-- migration, and so a test can assert the two copies have not drifted.
create table public.role_permissions (
  role       app.staff_role not null,
  permission text not null check (permission ~ '^[a-z-]+:[a-z-]+$'),
  primary key (role, permission)
);

-- ── Reference data ─────────────────────────────────────────────────────────

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 120),
  address         text not null,
  phone           text,
  contact_user_id uuid references public.staff_profiles (id) on delete set null,
  contact_name    text,
  contact_mobile  text check (contact_mobile is null or contact_mobile ~ '^[6-9][0-9]{9}$'),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null
);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 120),
  category           app.product_category not null,
  pricing_method     app.pricing_method not null,
  default_rate_paise bigint not null check (default_rate_paise >= 0),
  default_rate_unit  app.rate_unit not null,
  description        text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid not null
);

-- ── Document numbering ─────────────────────────────────────────────────────
-- One row per scope per Indian financial year. Allocation takes a row lock
-- held until commit, so a rolled back insert returns its number - the series
-- stays gapless, which statutory invoice numbering will require in Module 11.
create table public.document_counters (
  scope      app.counter_scope not null,
  year_key   text not null check (year_key ~ '^[0-9]{4}$'),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (scope, year_key)
);

-- ── Enquiries ──────────────────────────────────────────────────────────────

create table public.enquiries (
  id                            uuid primary key default gen_random_uuid(),
  enquiry_number                text not null unique check (enquiry_number ~ '^ENQ-[0-9]{4}-[0-9]{4}$'),
  customer_id                   uuid not null references public.customers (id) on delete restrict,
  customer_name                 text not null,
  customer_mobile               text not null,
  enquiry_date                  timestamptz not null,
  source                        app.enquiry_source not null,
  requirement_text              text not null check (char_length(requirement_text) between 1 and 2000),
  requirement_audio_id          uuid,
  requirement_audio_path        text,
  requirement_audio_mime        text,
  requirement_audio_duration_s  integer,
  requirement_audio_size_bytes  integer,
  requirement_audio_recorded_at timestamptz,
  requirement_audio_uploaded_by uuid,
  requirement_audio_source      app.audio_source,
  notes                         text,
  assigned_to_id                uuid references public.staff_profiles (id) on delete set null,
  assigned_to_name              text,
  next_follow_up_at             timestamptz,
  status                        app.enquiry_status not null default 'new',
  lost_reason                   text,
  converted_job_id              uuid,
  converted_at                  timestamptz,
  created_at                    timestamptz not null default now(),
  created_by                    uuid not null,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid not null,
  -- Either the whole recording is there or none of it is.
  constraint enquiry_audio_complete check (
    (requirement_audio_id is null and requirement_audio_path is null)
    or (requirement_audio_id is not null and requirement_audio_path is not null
        and requirement_audio_mime is not null and requirement_audio_recorded_at is not null)
  )
);
create index enquiries_date_idx on public.enquiries (enquiry_date desc);
create index enquiries_customer_idx on public.enquiries (customer_id);
create index enquiries_follow_up_idx on public.enquiries (next_follow_up_at)
  where next_follow_up_at is not null;

-- Was an array embedded on the enquiry document, capped at 50 because Firestore
-- had to be. Append only: a follow-up is a thing that happened.
create table public.enquiry_follow_ups (
  id         uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete restrict,
  at         timestamptz not null default now(),
  by_id      uuid not null,
  by_name    text not null,
  note       text not null check (char_length(note) between 1 and 1000)
);
create index enquiry_follow_ups_enquiry_idx on public.enquiry_follow_ups (enquiry_id, at desc);

-- ── Jobs ───────────────────────────────────────────────────────────────────

create table public.jobs (
  id                            uuid primary key default gen_random_uuid(),
  job_number                    text not null unique check (job_number ~ '^JOB-[0-9]{4}-[0-9]{4}$'),
  customer_id                   uuid not null references public.customers (id) on delete restrict,
  customer_name                 text not null,
  customer_mobile               text not null,
  enquiry_id                    uuid references public.enquiries (id) on delete set null,
  enquiry_number                text,
  job_date                      timestamptz not null,
  title                         text not null check (char_length(title) between 1 and 160),
  requirement_text              text not null check (char_length(requirement_text) <= 2000),
  requirement_audio_id          uuid,
  requirement_audio_path        text,
  requirement_audio_mime        text,
  requirement_audio_duration_s  integer,
  requirement_audio_size_bytes  integer,
  requirement_audio_recorded_at timestamptz,
  requirement_audio_uploaded_by uuid,
  requirement_audio_source      app.audio_source,
  priority                      app.job_priority not null default 'normal',
  expected_delivery_date        timestamptz,
  internal_notes                text,
  pickup_location_id            uuid references public.locations (id) on delete set null,
  pickup_location_name          text,
  contact_person_id             uuid,
  contact_person_name           text,
  contact_person_mobile         text,
  assigned_to_id                uuid references public.staff_profiles (id) on delete set null,
  assigned_to_name              text,
  status                        app.job_status not null default 'open',
  created_at                    timestamptz not null default now(),
  created_by                    uuid not null,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid not null,
  constraint job_audio_complete check (
    (requirement_audio_id is null and requirement_audio_path is null)
    or (requirement_audio_id is not null and requirement_audio_path is not null
        and requirement_audio_mime is not null and requirement_audio_recorded_at is not null)
  )
);
create index jobs_date_idx on public.jobs (job_date desc);
create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_delivery_idx on public.jobs (expected_delivery_date)
  where status not in ('delivered','cancelled');

alter table public.enquiries
  add constraint enquiries_converted_job_fkey
  foreign key (converted_job_id) references public.jobs (id) on delete set null;

-- ── Pricing ────────────────────────────────────────────────────────────────
-- Its own table, not columns on the job, for exactly the reason it was its own
-- collection in Firestore: reading what work costs is gated on estimates:view,
-- which designer and production do not hold. Money on the job row would be
-- readable by anyone who may read a job.

create table public.job_pricing (
  job_id            uuid primary key references public.jobs (id) on delete restrict,
  subtotal_paise    bigint not null,
  adjustment_paise  bigint,
  adjustment_reason text,
  total_paise       bigint not null check (total_paise >= 0),
  created_at        timestamptz not null default now(),
  created_by        uuid not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid not null,
  -- A signed adjustment always says why. A discount with no reason is a
  -- mistake waiting to be argued about.
  constraint adjustment_needs_reason check (
    (adjustment_paise is null and adjustment_reason is null)
    or (adjustment_paise is not null and char_length(coalesce(adjustment_reason, '')) > 0)
  )
);

create table public.job_pricing_lines (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.job_pricing (job_id) on delete cascade,
  position          integer not null check (position between 0 and 49),
  product_id        uuid references public.products (id) on delete set null,
  product_name      text not null,
  pricing_method    app.pricing_method not null,
  measurement_unit  app.measurement_unit,
  width             numeric(12, 4),
  height            numeric(12, 4),
  length            numeric(12, 4),
  quantity          numeric(12, 4) not null check (quantity > 0),
  rate_paise        bigint not null check (rate_paise >= 0),
  rate_unit         app.rate_unit not null,
  calculated_area   numeric(16, 6),
  calculated_length numeric(16, 6),
  line_amount_paise bigint not null,
  notes             text,
  unique (job_id, position)
);
create index job_pricing_lines_job_idx on public.job_pricing_lines (job_id, position);

-- ── Estimates ──────────────────────────────────────────────────────────────
-- A quotation is a historical record. Every priced line and every customer
-- detail on it is copied at creation and never read back from the job, the job
-- pricing or the rate card, so re-pricing a job cannot move a quotation that
-- has already gone out.

create table public.estimates (
  id                     uuid primary key default gen_random_uuid(),
  estimate_number        text not null unique check (estimate_number ~ '^EST-[0-9]{4}-[0-9]{4}$'),
  job_id                 uuid not null references public.jobs (id) on delete restrict,
  job_number             text not null,
  job_title              text not null,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_name          text not null,
  customer_mobile        text not null,
  customer_business_name text,
  customer_address       text,
  customer_gstin         text,
  estimate_date          timestamptz not null,
  valid_until            timestamptz not null,
  subtotal_paise         bigint not null,
  adjustment_paise       bigint,
  adjustment_reason      text,
  total_paise            bigint not null check (total_paise >= 0),
  notes                  text check (char_length(coalesce(notes, '')) <= 1000),
  terms                  text check (char_length(coalesce(terms, '')) <= 2000),
  status                 app.estimate_status not null default 'draft',
  sent_at                timestamptz,
  decision_outcome       app.estimate_outcome,
  decision_at            timestamptz,
  decision_by_id         uuid,
  decision_by_name       text,
  decision_note          text,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  created_by             uuid not null,
  updated_at             timestamptz not null default now(),
  updated_by             uuid not null,
  constraint estimate_adjustment_needs_reason check (
    (adjustment_paise is null and adjustment_reason is null)
    or (adjustment_paise is not null and char_length(coalesce(adjustment_reason, '')) > 0)
  ),
  -- A decision is whole or absent, and it agrees with the status it set.
  constraint estimate_decision_complete check (
    (decision_outcome is null and decision_at is null and decision_by_id is null)
    or (decision_outcome is not null and decision_at is not null and decision_by_id is not null
        and status::text = decision_outcome::text)
  )
);
create index estimates_date_idx on public.estimates (estimate_date desc);
create index estimates_job_idx on public.estimates (job_id);

-- Copied verbatim from job_pricing_lines at creation. There is no update or
-- delete grant on this table anywhere: a quoted price is a fact about a day.
create table public.estimate_lines (
  id                uuid primary key default gen_random_uuid(),
  estimate_id       uuid not null references public.estimates (id) on delete restrict,
  position          integer not null check (position between 0 and 49),
  product_id        uuid,
  product_name      text not null,
  pricing_method    app.pricing_method not null,
  measurement_unit  app.measurement_unit,
  width             numeric(12, 4),
  height            numeric(12, 4),
  length            numeric(12, 4),
  quantity          numeric(12, 4) not null,
  rate_paise        bigint not null,
  rate_unit         app.rate_unit not null,
  calculated_area   numeric(16, 6),
  calculated_length numeric(16, 6),
  line_amount_paise bigint not null,
  notes             text,
  unique (estimate_id, position)
);
create index estimate_lines_estimate_idx on public.estimate_lines (estimate_id, position);

-- ── Designs ────────────────────────────────────────────────────────────────
-- One row per version, written once. A revision is a new row with the next
-- version number and a new object in Storage, so "version 2 was approved"
-- stays a true statement about a specific file.

create table public.designs (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs (id) on delete restrict,
  job_number         text not null,
  job_title          text not null,
  customer_id        uuid not null references public.customers (id) on delete restrict,
  customer_name      text not null,
  version            integer not null check (version between 1 and 50),
  file_id            uuid not null,
  file_path          text not null,
  file_mime          text not null check (file_mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size_bytes    bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  file_original_name text not null,
  file_uploaded_at   timestamptz not null,
  file_uploaded_by   uuid not null,
  preview_kind       text not null check (preview_kind in ('image','pdf')),
  preview_width      integer,
  preview_height     integer,
  uploaded_by_id     uuid not null,
  uploaded_by_name   text not null,
  uploaded_at        timestamptz not null default now(),
  status             app.design_status not null default 'draft',
  designer_note      text check (char_length(coalesce(designer_note, '')) <= 1000),
  decision_outcome   app.decision_outcome,
  decision_comment   text check (char_length(coalesce(decision_comment, '')) <= 2000),
  decision_at        timestamptz,
  decision_source    app.decision_source,
  decision_by_id     uuid,
  decision_by_name   text,
  decision_language  app.language_code,
  submitted_at       timestamptz,
  superseded_at      timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid not null,
  -- Replaces the deterministic `{jobId}-v{n}` document id: two designers
  -- uploading at the same instant collide here instead of both taking v3.
  unique (job_id, version),
  constraint design_decision_complete check (
    (decision_outcome is null and decision_at is null and decision_source is null
     and decision_by_id is null)
    or (decision_outcome is not null and decision_at is not null
        and decision_source is not null and decision_by_id is not null
        and decision_comment is not null)
  )
);
-- A job never has two approved versions. Enforced, not merely intended.
create unique index designs_one_approved_per_job on public.designs (job_id)
  where status = 'approved';
create index designs_customer_idx on public.designs (customer_id, uploaded_at desc);
create index designs_job_idx on public.designs (job_id, version desc);
create index designs_status_idx on public.designs (status);

-- ── Audit trail ────────────────────────────────────────────────────────────
-- Append only. There is no update or delete grant on this table.
create table public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  action         app.audit_action not null,
  target_user_id uuid not null,
  target_name    text not null,
  actor_id       uuid not null,
  actor_name     text not null,
  before         text not null default '',
  after          text not null,
  created_at     timestamptz not null default now(),
  created_by     uuid not null
);
create index audit_events_target_idx on public.audit_events (target_user_id, created_at desc);
create index audit_events_created_idx on public.audit_events (created_at desc);
