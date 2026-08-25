-- ---------------------------------------------------------------------------
-- Devasriya Print - row level security
--
-- Baseline is deny-all: Supabase grants broad table privileges to `anon` and
-- `authenticated` by default, so the first thing this file does is take them
-- away and hand back only what each table actually needs.
--
-- Two mechanisms work together, and the split matters:
--
--   * GRANT UPDATE (col, ...) decides WHICH COLUMNS may ever move. This is the
--     declarative replacement for the hand-rolled `touchesOnly([...])` helper
--     the Firestore rules used. A column that is not granted cannot be written
--     by any policy, any statement, any client.
--   * POLICY decides WHICH ROWS, and what the new values may be.
--
-- One PostgreSQL subtlety this file is careful about: with several permissive
-- policies on the same command, USING clauses are OR-ed together and WITH CHECK
-- clauses are OR-ed together, INDEPENDENTLY. A row therefore passes if any
-- USING matches AND any WITH CHECK matches - not necessarily the same policy's.
-- So every WITH CHECK below re-asserts who the caller is, rather than trusting
-- that the matching USING already did. Skipping that would let a staff member
-- pass USING as staff and WITH CHECK as a customer, and file an answer as
-- though the customer had typed it.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;

alter table public.principals            enable row level security;
alter table public.staff_profiles        enable row level security;
alter table public.customer_accounts     enable row level security;
alter table public.customers             enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.locations             enable row level security;
alter table public.products              enable row level security;
alter table public.document_counters     enable row level security;
alter table public.enquiries             enable row level security;
alter table public.enquiry_follow_ups    enable row level security;
alter table public.jobs                  enable row level security;
alter table public.job_pricing           enable row level security;
alter table public.job_pricing_lines     enable row level security;
alter table public.estimates             enable row level security;
alter table public.estimate_lines        enable row level security;
alter table public.designs               enable row level security;
alter table public.audit_events          enable row level security;
alter table public.estimate_transitions  enable row level security;
alter table public.design_transitions    enable row level security;

-- ── Identity ───────────────────────────────────────────────────────────────
-- principals is written only by the account provisioning Edge Function, which
-- holds the service role and bypasses RLS. No client may write it, so no client
-- can decide what kind of principal a uid is.
grant select on public.principals to authenticated;
create policy principals_self on public.principals for select to authenticated
  using (id = auth.uid());

grant select on public.staff_profiles to authenticated;
grant insert on public.staff_profiles to authenticated;
grant update (name, mobile, designation, department, role, is_active, updated_at, updated_by)
  on public.staff_profiles to authenticated;

-- A signed-in user may always read their own profile: the application needs it
-- to tell "deactivated" apart from "no profile at all".
create policy staff_read on public.staff_profiles for select to authenticated
  using (id = auth.uid() or app.has_permission('employees:view'));

create policy staff_insert on public.staff_profiles for insert to authenticated
  with check (
    app.has_permission('employees:manage')
    and created_by = auth.uid()
    and updated_by = auth.uid()
    -- Handing out owner or admin is reserved for the owner.
    and (role not in ('owner','admin') or app.has_permission('employees:manage-admins'))
  );

create policy staff_update on public.staff_profiles for update to authenticated
  using (
    app.has_permission('employees:manage')
    -- An administrator may not edit an owner or another administrator.
    and (role not in ('owner','admin') or app.has_permission('employees:manage-admins'))
  )
  with check (
    app.has_permission('employees:manage')
    and updated_by = auth.uid()
    and (role not in ('owner','admin') or app.has_permission('employees:manage-admins'))
  );
-- No delete grant: staff are deactivated, never removed, because their name is
-- on jobs, estimates and designs.

grant select on public.customer_accounts to authenticated;
grant insert on public.customer_accounts to authenticated;
grant update (customer_name, preferred_language, is_active, updated_at, updated_by)
  on public.customer_accounts to authenticated;

create policy customer_accounts_read on public.customer_accounts for select to authenticated
  using (id = auth.uid() or app.has_permission('customers:view'));

create policy customer_accounts_insert on public.customer_accounts for insert to authenticated
  with check (
    app.has_permission('customers:edit')
    and is_active
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

-- customer_id is deliberately not grantable: repointing a live login at a
-- different customer would hand somebody another customer's designs.
create policy customer_accounts_update on public.customer_accounts for update to authenticated
  using (app.has_permission('customers:edit'))
  with check (app.has_permission('customers:edit') and updated_by = auth.uid());

-- ── The permission matrix ──────────────────────────────────────────────────
grant select on public.role_permissions to authenticated;
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (app.is_active_staff());
-- Only the owner holds settings:manage, so only the owner can change who can
-- do what. No write grant is issued at all today; the matrix is seeded by
-- migration and a future Settings screen will add the grant with the policy.

grant select on public.estimate_transitions, public.design_transitions to authenticated;
create policy estimate_transitions_read on public.estimate_transitions for select to authenticated
  using (app.is_active_staff() or app.is_active_customer());
create policy design_transitions_read on public.design_transitions for select to authenticated
  using (app.is_active_staff() or app.is_active_customer());

-- ── Customers ──────────────────────────────────────────────────────────────
grant select, insert on public.customers to authenticated;
grant update (name, business_name, type, mobile, alternate_mobile, email, address, city,
              state, pincode, gstin, preferred_language, notes, is_archived,
              updated_at, updated_by)
  on public.customers to authenticated;

create policy customers_read on public.customers for select to authenticated
  using (app.has_permission('customers:view'));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.has_permission('customers:create')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy customers_update on public.customers for update to authenticated
  using (app.has_permission('customers:edit'))
  with check (app.has_permission('customers:edit') and updated_by = auth.uid());
-- No delete: enquiries, jobs and estimates all point here. Archiving is the
-- only way out.

-- ── Pickup offices and the rate card ───────────────────────────────────────
grant select, insert on public.locations to authenticated;
grant update (name, address, phone, contact_user_id, contact_name, contact_mobile,
              is_active, updated_at, updated_by)
  on public.locations to authenticated;

create policy locations_read on public.locations for select to authenticated
  using (app.is_active_staff());
create policy locations_write on public.locations for insert to authenticated
  with check (app.has_permission('settings:manage')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy locations_update on public.locations for update to authenticated
  using (app.has_permission('settings:manage'))
  with check (app.has_permission('settings:manage') and updated_by = auth.uid());

grant select, insert on public.products to authenticated;
grant update (name, category, pricing_method, default_rate_paise, default_rate_unit,
              description, is_active, updated_at, updated_by)
  on public.products to authenticated;

-- Anybody who may price work needs to read the rate card. Only the owner may
-- change it, and items are deactivated rather than deleted because old jobs
-- name them.
create policy products_read on public.products for select to authenticated
  using (app.is_active_staff());
create policy products_insert on public.products for insert to authenticated
  with check (app.has_permission('settings:manage')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy products_update on public.products for update to authenticated
  using (app.has_permission('settings:manage'))
  with check (app.has_permission('settings:manage') and updated_by = auth.uid());

-- ── Document counters ──────────────────────────────────────────────────────
-- Never read or written directly by a client. app.next_document_number() is
-- SECURITY DEFINER and is the only way in, so a number cannot be skipped,
-- reused or reset from the browser.
-- (no grants, no policies: deny all)

-- ── Enquiries ──────────────────────────────────────────────────────────────
grant select, insert on public.enquiries to authenticated;
grant update (customer_id, customer_name, customer_mobile, enquiry_date, source,
              requirement_text, requirement_audio_id, requirement_audio_path,
              requirement_audio_mime, requirement_audio_duration_s,
              requirement_audio_size_bytes, requirement_audio_recorded_at,
              requirement_audio_uploaded_by, requirement_audio_source,
              notes, assigned_to_id, assigned_to_name, next_follow_up_at,
              status, lost_reason, converted_job_id, converted_at,
              updated_at, updated_by)
  on public.enquiries to authenticated;

create policy enquiries_read on public.enquiries for select to authenticated
  using (app.has_permission('enquiries:view'));
create policy enquiries_insert on public.enquiries for insert to authenticated
  with check (app.has_permission('enquiries:create')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy enquiries_update on public.enquiries for update to authenticated
  using (app.has_permission('enquiries:edit'))
  with check (app.has_permission('enquiries:edit') and updated_by = auth.uid());

grant select, insert on public.enquiry_follow_ups to authenticated;
-- Append only: no update grant, no delete grant. A follow-up is a thing that
-- happened, and the record of it does not get to change afterwards.
create policy follow_ups_read on public.enquiry_follow_ups for select to authenticated
  using (app.has_permission('enquiries:view'));
create policy follow_ups_insert on public.enquiry_follow_ups for insert to authenticated
  with check (app.has_permission('enquiries:edit') and by_id = auth.uid());

-- ── Jobs ───────────────────────────────────────────────────────────────────
grant select, insert on public.jobs to authenticated;
grant update (customer_id, customer_name, customer_mobile, job_date, title,
              requirement_text, requirement_audio_id, requirement_audio_path,
              requirement_audio_mime, requirement_audio_duration_s,
              requirement_audio_size_bytes, requirement_audio_recorded_at,
              requirement_audio_uploaded_by, requirement_audio_source,
              priority, expected_delivery_date, internal_notes,
              pickup_location_id, pickup_location_name, contact_person_id,
              contact_person_name, contact_person_mobile,
              assigned_to_id, assigned_to_name, status, updated_at, updated_by)
  on public.jobs to authenticated;

-- Staff by permission; a customer only for their own orders, which is what the
-- design review screen needs to show them the requirement they gave us. There
-- is no money on this row - pricing lives in its own table - so nothing here is
-- hidden from the customer whose order it is.
create policy jobs_read on public.jobs for select to authenticated
  using (
    app.has_permission('jobs:view')
    or (app.is_active_customer() and customer_id = app.my_customer_id())
  );
create policy jobs_insert on public.jobs for insert to authenticated
  with check (app.has_permission('jobs:create')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy jobs_update on public.jobs for update to authenticated
  using (app.has_permission('jobs:edit'))
  with check (app.has_permission('jobs:edit') and updated_by = auth.uid());

-- ── Pricing: the money boundary ────────────────────────────────────────────
-- Pricing is a table of its own precisely so this can be enforced. Reading what
-- work costs needs estimates:view, which designer and production do not hold;
-- changing it needs jobs:edit AND estimates:create, so production - which holds
-- jobs:edit and moves jobs along - still cannot change a price.
grant select, insert on public.job_pricing to authenticated;
grant update (subtotal_paise, adjustment_paise, adjustment_reason, total_paise,
              updated_at, updated_by)
  on public.job_pricing to authenticated;

create policy pricing_read on public.job_pricing for select to authenticated
  using (app.has_permission('estimates:view'));
create policy pricing_insert on public.job_pricing for insert to authenticated
  with check (app.has_permission('jobs:edit') and app.has_permission('estimates:create')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy pricing_update on public.job_pricing for update to authenticated
  using (app.has_permission('jobs:edit') and app.has_permission('estimates:create'))
  with check (app.has_permission('jobs:edit') and app.has_permission('estimates:create')
              and updated_by = auth.uid());

grant select, insert, delete on public.job_pricing_lines to authenticated;
-- Lines are replaced wholesale when a job is re-priced, so delete is granted
-- here and nowhere else in the schema. The rows it removes are live working
-- figures, never history: history is the estimate snapshot.
create policy pricing_lines_read on public.job_pricing_lines for select to authenticated
  using (app.has_permission('estimates:view'));
create policy pricing_lines_write on public.job_pricing_lines for insert to authenticated
  with check (app.has_permission('jobs:edit') and app.has_permission('estimates:create'));
create policy pricing_lines_delete on public.job_pricing_lines for delete to authenticated
  using (app.has_permission('jobs:edit') and app.has_permission('estimates:create'));

-- ── Estimates: the historical record ───────────────────────────────────────
-- The priced lines, the totals and the customer details are a snapshot. None of
-- those columns is grantable, so no policy, statement or client can move them -
-- and a status change can never smuggle a rewritten price alongside it.
grant select, insert on public.estimates to authenticated;
grant update (valid_until, notes, terms, status, sent_at, decision_outcome,
              decision_at, decision_by_id, decision_by_name, decision_note,
              cancelled_at, updated_at, updated_by)
  on public.estimates to authenticated;

create policy estimates_read on public.estimates for select to authenticated
  using (app.has_permission('estimates:view'));
create policy estimates_insert on public.estimates for insert to authenticated
  with check (
    app.has_permission('estimates:create')
    and status = 'draft'
    and decision_outcome is null and sent_at is null and cancelled_at is null
    and created_by = auth.uid() and updated_by = auth.uid()
  );

-- Wording and validity, on a draft only. The trigger refuses it on anything
-- else; this policy decides who may try.
create policy estimates_edit on public.estimates for update to authenticated
  using (app.has_permission('estimates:edit') and status = 'draft')
  with check (app.has_permission('estimates:edit') and updated_by = auth.uid()
              and decision_outcome is null);

-- Sent, expired or cancelled: a move that carries no decision with it.
create policy estimates_move on public.estimates for update to authenticated
  using (app.has_permission('estimates:edit'))
  with check (
    app.has_permission('estimates:edit')
    and updated_by = auth.uid()
    and status in ('sent','expired','cancelled')
    and decision_outcome is null
  );

-- What the customer decided. Reserved for estimates:approve, and recorded
-- against the name of whoever is signed in.
create policy estimates_decide on public.estimates for update to authenticated
  using (app.has_permission('estimates:approve') and status = 'sent')
  with check (
    app.has_permission('estimates:approve')
    and updated_by = auth.uid()
    and status in ('approved','rejected')
    and decision_by_id = auth.uid()
    and decision_at is not null
  );
-- No delete: a quotation given to a customer stays on record.

grant select, insert on public.estimate_lines to authenticated;
-- No update grant and no delete grant anywhere: a quoted line is a fact about
-- a day, and days do not get edited.
create policy estimate_lines_read on public.estimate_lines for select to authenticated
  using (app.has_permission('estimates:view'));
create policy estimate_lines_insert on public.estimate_lines for insert to authenticated
  with check (app.has_permission('estimates:create'));

-- ── Designs ────────────────────────────────────────────────────────────────
-- Both principals write here, and which of the two answered is pinned by these
-- policies. The artwork columns - file_*, preview_*, version, job_id,
-- customer_id, uploaded_* - are simply not in the UPDATE grant, so a version is
-- written once and the file behind an approval can never be swapped.
grant select, insert on public.designs to authenticated;
grant update (status, submitted_at, superseded_at, decision_outcome, decision_comment,
              decision_at, decision_source, decision_by_id, decision_by_name,
              decision_language, updated_at, updated_by)
  on public.designs to authenticated;

create policy designs_read on public.designs for select to authenticated
  using (
    app.has_permission('designs:view')
    or (app.is_active_customer() and customer_id = app.my_customer_id())
  );

-- A version always starts on our side of the conversation: it can never be
-- created already answered, or answered by the person who uploaded it.
create policy designs_insert on public.designs for insert to authenticated
  with check (
    app.has_permission('designs:upload')
    and status in ('draft','submitted-for-review')
    and decision_outcome is null
    and superseded_at is null
    and uploaded_by_id = auth.uid()
    and file_uploaded_by = auth.uid()
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

-- Staff send a draft to the customer.
create policy designs_submit on public.designs for update to authenticated
  using (app.has_permission('designs:upload') and status = 'draft')
  with check (
    app.has_permission('designs:upload')
    and status = 'submitted-for-review'
    and submitted_at is not null
    and decision_outcome is null
    and updated_by = auth.uid()
  );

-- The customer answers for themselves. Note that this WITH CHECK repeats the
-- "is the customer whose design this is" test: permissive policies OR their
-- checks together, so a staff member must not be able to pass a customer's
-- check by simply writing decision_source = 'customer'.
create policy designs_customer_decides on public.designs for update to authenticated
  using (
    app.is_active_customer()
    and customer_id = app.my_customer_id()
    and status = 'submitted-for-review'
  )
  with check (
    app.is_active_customer()
    and customer_id = app.my_customer_id()
    and status::text = decision_outcome::text
    and decision_source = 'customer'
    and decision_by_id = auth.uid()
    and decision_at is not null
    and updated_by = auth.uid()
  );

-- Staff write down an answer the customer gave them by phone or in person.
-- Recorded as staff, never as the customer.
create policy designs_staff_decides on public.designs for update to authenticated
  using (app.has_permission('designs:approve') and status = 'submitted-for-review')
  with check (
    app.has_permission('designs:approve')
    and status::text = decision_outcome::text
    and decision_source = 'staff'
    and decision_by_id = auth.uid()
    and decision_at is not null
    and updated_by = auth.uid()
  );

-- A newer version takes over. Staff do this as part of uploading a revision; a
-- customer does it only when their own approval replaces an earlier approval of
-- theirs. The trigger guarantees the decision and its comment are untouched.
create policy designs_supersede on public.designs for update to authenticated
  using (
    (app.has_permission('designs:upload')
     or (app.is_active_customer() and customer_id = app.my_customer_id()))
    and status <> 'superseded'
  )
  with check (
    (app.has_permission('designs:upload')
     or (app.is_active_customer() and customer_id = app.my_customer_id()))
    and status = 'superseded'
    and superseded_at is not null
    and updated_by = auth.uid()
  );
-- No delete: design history is never destroyed, by either side.

-- ── Audit trail ────────────────────────────────────────────────────────────
-- Append only. No update grant, no delete grant, for anybody.
grant select, insert on public.audit_events to authenticated;
create policy audit_read on public.audit_events for select to authenticated
  using (app.has_permission('employees:manage'));
create policy audit_insert on public.audit_events for insert to authenticated
  with check (
    app.has_permission('employees:manage')
    and actor_id = auth.uid()
    and created_by = auth.uid()
  );
