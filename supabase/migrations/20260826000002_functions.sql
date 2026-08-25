-- ---------------------------------------------------------------------------
-- Devasriya Print - security helpers, state machines and triggers
--
-- Everything a row level security policy needs to ask about the caller lives
-- here. All of it is row independent, so PostgreSQL evaluates each helper once
-- per statement rather than once per row.
--
-- The helpers are SECURITY DEFINER because they read staff_profiles and
-- customer_accounts, which are themselves protected by policies that call these
-- helpers. Without it the recursion would deadlock the whole model.
-- ---------------------------------------------------------------------------

-- ── Who is asking ──────────────────────────────────────────────────────────

create or replace function app.my_kind()
returns app.principal_kind
language sql stable security definer set search_path = ''
as $$ select kind from public.principals where id = auth.uid(); $$;

create or replace function app.is_active_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and is_active
  );
$$;

create or replace function app.my_role()
returns app.staff_role
language sql stable security definer set search_path = ''
as $$
  select role from public.staff_profiles where id = auth.uid() and is_active;
$$;

/*
 * The permission check every staff policy is built on.
 *
 * Authentication alone grants nothing: the profile must exist and be active,
 * and the role must actually hold the permission. This is the SQL half of
 * src/features/permissions/matrix.ts - the browser hides what a user cannot do,
 * and this refuses it.
 */
create or replace function app.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles s
    join public.role_permissions rp on rp.role = s.role
    where s.id = auth.uid()
      and s.is_active
      and rp.permission = p_permission
  );
$$;

-- ── The other kind of principal ────────────────────────────────────────────
-- A customer holds no role and appears nowhere in role_permissions, so
-- has_permission() is false for them everywhere. Every door they may pass is
-- opened explicitly, by their own customer id.

create or replace function app.is_active_customer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.customer_accounts
    where id = auth.uid() and is_active
  );
$$;

create or replace function app.my_customer_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select customer_id from public.customer_accounts
  where id = auth.uid() and is_active;
$$;

create or replace function app.owns_customer(p_customer_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_customer_id is not null and p_customer_id = app.my_customer_id();
$$;

grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

-- ── State machines, as data ────────────────────────────────────────────────
-- The same tables that exist in TypeScript (ESTIMATE_TRANSITIONS,
-- DESIGN_TRANSITIONS), so a move refused in the browser is refused here too and
-- for the same reason.

create table public.estimate_transitions (
  from_status app.estimate_status not null,
  to_status   app.estimate_status not null,
  primary key (from_status, to_status)
);
insert into public.estimate_transitions (from_status, to_status) values
  ('draft','sent'), ('draft','cancelled'),
  ('sent','approved'), ('sent','rejected'), ('sent','expired'), ('sent','cancelled');

create table public.design_transitions (
  from_status app.design_status not null,
  to_status   app.design_status not null,
  primary key (from_status, to_status)
);
insert into public.design_transitions (from_status, to_status) values
  ('draft','submitted-for-review'), ('draft','superseded'),
  ('submitted-for-review','approved'), ('submitted-for-review','rejected'),
  ('submitted-for-review','changes-requested'), ('submitted-for-review','superseded'),
  ('changes-requested','superseded'),
  ('approved','superseded'),
  ('rejected','superseded');

-- ── Triggers ───────────────────────────────────────────────────────────────

/* The clock belongs to the database, not to whoever is calling it. */
create or replace function app.tg_touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.tg_estimate_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.estimate_transitions
      where from_status = old.status and to_status = new.status
    ) then
      raise exception
        'A % quotation cannot become %.', replace(old.status::text, '-', ' '),
        replace(new.status::text, '-', ' ')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function app.tg_design_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.design_transitions
      where from_status = old.status and to_status = new.status
    ) then
      raise exception
        'A design that is % cannot become %.', replace(old.status::text, '-', ' '),
        replace(new.status::text, '-', ' ')
        using errcode = 'P0001';
    end if;
  end if;

  -- Superseding moves the status alone. The file, the version and whatever the
  -- customer said about it stay exactly as they were - a change request has to
  -- stay readable long after the revision that answered it went out.
  if new.status = 'superseded' and old.status <> 'superseded' then
    if new.decision_outcome is distinct from old.decision_outcome
       or new.decision_comment is distinct from old.decision_comment
       or new.decision_at is distinct from old.decision_at
       or new.decision_source is distinct from old.decision_source
       or new.decision_by_id is distinct from old.decision_by_id then
      raise exception 'Replacing a design version cannot change what was said about it.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

/* A quotation that has left the office can no longer have its wording changed. */
create or replace function app.tg_estimate_wording_locked()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.valid_until is distinct from old.valid_until
          or new.notes is distinct from old.notes
          or new.terms is distinct from old.terms) then
    raise exception
      'This quotation is %, so its wording can no longer be changed. Create a new one from the job instead.',
      replace(old.status::text, '-', ' ')
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger touch_updated_at before update on public.staff_profiles
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.customer_accounts
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.customers
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.locations
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.products
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.enquiries
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.jobs
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.job_pricing
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.estimates
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.designs
  for each row execute function app.tg_touch_updated_at();

create trigger estimate_transition before update on public.estimates
  for each row execute function app.tg_estimate_transition();
create trigger estimate_wording_locked before update on public.estimates
  for each row execute function app.tg_estimate_wording_locked();
create trigger design_transition before update on public.designs
  for each row execute function app.tg_design_transition();
