-- ---------------------------------------------------------------------------
-- Devasriya Print - atomic operations
--
-- Every one of these replaces a Firebase client transaction or batch. They are
-- all SECURITY INVOKER, deliberately: they run as the caller, so row level
-- security is evaluated on every statement inside them. A SECURITY DEFINER RPC
-- would be a hole punched straight through the policy model, and the whole
-- point of this system is that hidden UI is never the control.
--
-- The single exception is next_document_number, which has to touch a counter
-- table no client may see. It is small enough to audit at a glance.
-- ---------------------------------------------------------------------------

/*
 * The next ENQ / JOB / EST number for an Indian financial year.
 *
 * INSERT ... ON CONFLICT DO UPDATE takes a row lock that is held until the
 * caller's transaction commits, so two people creating a record at the same
 * moment cannot be handed the same number - and a rolled back insert gives its
 * number back. The series stays gapless, which is what statutory invoice
 * numbering will need in Module 11.
 *
 * The year key is worked out in the browser, in Asia/Kolkata, and passed in:
 * the database server's timezone is not the business's timezone.
 */
create or replace function app.next_document_number(
  p_scope app.counter_scope,
  p_year_key text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_next integer;
  v_prefix text;
begin
  if not app.is_active_staff() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
  if p_year_key !~ '^[0-9]{4}$' then
    raise exception 'Invalid financial year key.' using errcode = 'P0001';
  end if;

  insert into public.document_counters (scope, year_key, last_value)
  values (p_scope, p_year_key, 1)
  on conflict (scope, year_key)
    do update set last_value = public.document_counters.last_value + 1
  returning last_value into v_next;

  v_prefix := case p_scope
                when 'enquiries' then 'ENQ'
                when 'jobs'      then 'JOB'
                when 'estimates' then 'EST'
              end;

  return v_prefix || '-' || p_year_key || '-' || lpad(v_next::text, 4, '0');
end $$;

revoke all on function app.next_document_number(app.counter_scope, text) from public, anon;
grant execute on function app.next_document_number(app.counter_scope, text) to authenticated;

-- ── Enquiries ──────────────────────────────────────────────────────────────

create or replace function public.create_enquiry(p_payload jsonb, p_year_key text)
returns public.enquiries
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.enquiries;
begin
  insert into public.enquiries
  select * from jsonb_populate_record(
    null::public.enquiries,
    p_payload
      || jsonb_build_object(
           'id', coalesce(p_payload->>'id', gen_random_uuid()::text),
           'enquiry_number', app.next_document_number('enquiries', p_year_key),
           'created_at', now(), 'updated_at', now(),
           'created_by', auth.uid(), 'updated_by', auth.uid()
         )
  )
  returning * into v_row;    -- the INSERT policy is evaluated here
  return v_row;
end $$;

/*
 * Records a follow-up and moves the enquiry on, together.
 *
 * The note and the new status have to land as one write: an enquiry that says
 * "contacted" with no record of the contact is worse than either half alone.
 */
create or replace function public.add_enquiry_follow_up(
  p_enquiry_id uuid,
  p_note text,
  p_by_name text,
  p_status app.enquiry_status default null,
  p_next_follow_up_at timestamptz default null
) returns public.enquiries
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.enquiries;
begin
  insert into public.enquiry_follow_ups (enquiry_id, at, by_id, by_name, note)
  values (p_enquiry_id, now(), auth.uid(), p_by_name, p_note);

  update public.enquiries
     set status            = coalesce(p_status, status),
         next_follow_up_at = p_next_follow_up_at,
         updated_by        = auth.uid()
   where id = p_enquiry_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That enquiry no longer exists.' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

-- ── Jobs ───────────────────────────────────────────────────────────────────

create or replace function public.create_job(p_payload jsonb, p_year_key text)
returns public.jobs
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.jobs;
begin
  insert into public.jobs
  select * from jsonb_populate_record(
    null::public.jobs,
    p_payload
      || jsonb_build_object(
           'id', coalesce(p_payload->>'id', gen_random_uuid()::text),
           'job_number', app.next_document_number('jobs', p_year_key),
           'created_at', now(), 'updated_at', now(),
           'created_by', auth.uid(), 'updated_by', auth.uid()
         )
  )
  returning * into v_row;
  return v_row;
end $$;

/*
 * Enquiry becomes a job.
 *
 * The job is written and the enquiry is stamped in one transaction, so the two
 * can never disagree about whether a conversion happened. The audio is copied
 * to a job owned Storage path by the caller before this runs, and its metadata
 * is passed in - seeing jobs must never grant sight of enquiry storage.
 */
create or replace function public.convert_enquiry_to_job(
  p_enquiry_id uuid,
  p_payload jsonb,
  p_year_key text
) returns public.jobs
language plpgsql security invoker set search_path = ''
as $$
declare
  v_enquiry public.enquiries;
  v_job public.jobs;
begin
  select * into v_enquiry from public.enquiries where id = p_enquiry_id for update;

  if v_enquiry.id is null then
    raise exception 'That enquiry no longer exists.' using errcode = 'P0001';
  end if;
  if v_enquiry.status = 'converted' then
    raise exception 'This enquiry has already been converted to a job.' using errcode = 'P0001';
  end if;

  insert into public.jobs
  select * from jsonb_populate_record(
    null::public.jobs,
    p_payload
      || jsonb_build_object(
           'id', coalesce(p_payload->>'id', gen_random_uuid()::text),
           'job_number', app.next_document_number('jobs', p_year_key),
           'enquiry_id', p_enquiry_id,
           'enquiry_number', v_enquiry.enquiry_number,
           'created_at', now(), 'updated_at', now(),
           'created_by', auth.uid(), 'updated_by', auth.uid()
         )
  )
  returning * into v_job;

  update public.enquiries
     set status = 'converted', converted_job_id = v_job.id, converted_at = now(),
         next_follow_up_at = null, updated_by = auth.uid()
   where id = p_enquiry_id;

  return v_job;
end $$;

-- ── Job pricing ────────────────────────────────────────────────────────────

/*
 * Replaces a job's pricing wholesale.
 *
 * Lines are deleted and rewritten inside one transaction, so a half-saved
 * price list can never be read. Every line keeps the rate that was actually
 * used, not a reference to the rate card, so changing a rate tomorrow cannot
 * move a job priced yesterday.
 */
create or replace function public.save_job_pricing(p_job_id uuid, p_pricing jsonb)
returns public.job_pricing
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row public.job_pricing;
  v_line jsonb;
  v_index integer := 0;
begin
  insert into public.job_pricing (
    job_id, subtotal_paise, adjustment_paise, adjustment_reason, total_paise,
    created_at, created_by, updated_at, updated_by
  ) values (
    p_job_id,
    (p_pricing->>'subtotal_paise')::bigint,
    nullif(p_pricing->>'adjustment_paise', '')::bigint,
    nullif(p_pricing->>'adjustment_reason', ''),
    (p_pricing->>'total_paise')::bigint,
    now(), auth.uid(), now(), auth.uid()
  )
  on conflict (job_id) do update set
    subtotal_paise    = excluded.subtotal_paise,
    adjustment_paise  = excluded.adjustment_paise,
    adjustment_reason = excluded.adjustment_reason,
    total_paise       = excluded.total_paise,
    updated_by        = auth.uid()
  returning * into v_row;

  delete from public.job_pricing_lines where job_id = p_job_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_pricing->'lines', '[]'::jsonb))
  loop
    insert into public.job_pricing_lines
    select * from jsonb_populate_record(
      null::public.job_pricing_lines,
      v_line || jsonb_build_object('id', gen_random_uuid()::text,
                                   'job_id', p_job_id::text,
                                   'position', v_index)
    );
    v_index := v_index + 1;
  end loop;

  return v_row;
end $$;

-- ── Estimates ──────────────────────────────────────────────────────────────

/*
 * Turns the current job pricing into a quotation.
 *
 * The lines are copied here, in SQL, straight from job_pricing_lines - the
 * client never gets to say what the prices were. That is what makes a quotation
 * a true record: no rate is looked up again and nothing is recomputed, so it
 * keeps saying what it said on the day it was given.
 */
create or replace function public.create_estimate(
  p_job_id uuid,
  p_valid_until timestamptz,
  p_notes text,
  p_terms text,
  p_year_key text
) returns public.estimates
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.jobs;
  v_pricing public.job_pricing;
  v_customer public.customers;
  v_row public.estimates;
  v_lines integer;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'That job no longer exists.' using errcode = 'P0001';
  end if;

  -- Reading pricing needs estimates:view; this select is policy checked.
  select * into v_pricing from public.job_pricing where job_id = p_job_id;
  select count(*) into v_lines from public.job_pricing_lines where job_id = p_job_id;
  if v_pricing.job_id is null or v_lines = 0 then
    raise exception 'Price the job before making a quotation for it.' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = v_job.customer_id;

  insert into public.estimates (
    estimate_number, job_id, job_number, job_title,
    customer_id, customer_name, customer_mobile,
    customer_business_name, customer_address, customer_gstin,
    estimate_date, valid_until,
    subtotal_paise, adjustment_paise, adjustment_reason, total_paise,
    notes, terms, status,
    created_at, created_by, updated_at, updated_by
  ) values (
    app.next_document_number('estimates', p_year_key),
    v_job.id, v_job.job_number, v_job.title,
    v_job.customer_id, v_job.customer_name, v_job.customer_mobile,
    nullif(v_customer.business_name, ''),
    case when v_customer.id is null then null
         else v_customer.address || ', ' || v_customer.city || ' ' || v_customer.pincode end,
    nullif(v_customer.gstin, ''),
    now(), p_valid_until,
    v_pricing.subtotal_paise, v_pricing.adjustment_paise, v_pricing.adjustment_reason,
    v_pricing.total_paise,
    nullif(p_notes, ''), nullif(p_terms, ''), 'draft',
    now(), auth.uid(), now(), auth.uid()
  )
  returning * into v_row;

  insert into public.estimate_lines (
    estimate_id, position, product_id, product_name, pricing_method, measurement_unit,
    width, height, length, quantity, rate_paise, rate_unit,
    calculated_area, calculated_length, line_amount_paise, notes
  )
  select v_row.id, l.position, l.product_id, l.product_name, l.pricing_method,
         l.measurement_unit, l.width, l.height, l.length, l.quantity, l.rate_paise,
         l.rate_unit, l.calculated_area, l.calculated_length, l.line_amount_paise, l.notes
    from public.job_pricing_lines l
   where l.job_id = p_job_id
   order by l.position;

  return v_row;
end $$;

-- ── Designs ────────────────────────────────────────────────────────────────

/*
 * Adds a version to a job.
 *
 * The advisory lock serialises uploads for one job, so the version number is
 * allocated cleanly rather than relying on two designers not pressing the
 * button in the same second. The unique (job_id, version) index is still there
 * as the backstop.
 *
 * Versions the customer has not answered are marked superseded in the same
 * transaction: the moment the revision exists, exactly one version is under
 * review. A version they have answered keeps its status and its comment.
 */
create or replace function public.create_design_version(
  p_job_id uuid,
  p_payload jsonb,
  p_submit_now boolean
) returns public.designs
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.jobs;
  v_version integer;
  v_row public.designs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));

  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'That job no longer exists.' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.designs where job_id = p_job_id;

  update public.designs
     set status = 'superseded', superseded_at = now(), updated_by = auth.uid()
   where job_id = p_job_id
     and status in ('draft', 'submitted-for-review');

  insert into public.designs
  select * from jsonb_populate_record(
    null::public.designs,
    p_payload
      || jsonb_build_object(
           'id', coalesce(p_payload->>'id', gen_random_uuid()::text),
           'job_id', p_job_id::text,
           'job_number', v_job.job_number,
           'job_title', v_job.title,
           'customer_id', v_job.customer_id::text,
           'customer_name', v_job.customer_name,
           'version', v_version,
           'status', case when p_submit_now then 'submitted-for-review' else 'draft' end,
           'submitted_at', case when p_submit_now then to_jsonb(now()) else 'null'::jsonb end,
           'uploaded_at', to_jsonb(now()),
           'uploaded_by_id', auth.uid(),
           'file_uploaded_by', auth.uid(),
           'created_at', to_jsonb(now()), 'updated_at', to_jsonb(now()),
           'created_by', auth.uid(), 'updated_by', auth.uid()
         )
  )
  returning * into v_row;

  return v_row;
end $$;

/*
 * Records the answer to one version.
 *
 * A comment is kept whatever the outcome. "Approved, but make the font bigger"
 * is an approval and an instruction at the same time, and throwing away the
 * second half because the first half was a yes would lose the only place that
 * instruction was ever written down.
 *
 * An earlier approved version steps aside in the same transaction, so a job
 * never has two. The partial unique index would refuse it anyway; doing it here
 * means the caller does not have to think about it.
 */
create or replace function public.record_design_decision(
  p_design_id uuid,
  p_outcome app.decision_outcome,
  p_comment text,
  p_source app.decision_source,
  p_by_name text,
  p_language app.language_code default null
) returns public.designs
language plpgsql security invoker set search_path = ''
as $$
declare
  v_design public.designs;
  v_row public.designs;
begin
  select * into v_design from public.designs where id = p_design_id;
  if v_design.id is null then
    raise exception 'That design is not available.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_design.job_id::text, 0));

  if p_outcome <> 'approved' and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Say what needs to change, or why it was rejected.' using errcode = 'P0001';
  end if;

  if p_outcome = 'approved' then
    update public.designs
       set status = 'superseded', superseded_at = now(), updated_by = auth.uid()
     where job_id = v_design.job_id
       and id <> p_design_id
       and status = 'approved';
  end if;

  update public.designs
     set status            = p_outcome::text::app.design_status,
         decision_outcome  = p_outcome,
         decision_comment  = coalesce(btrim(p_comment), ''),
         decision_at       = now(),
         decision_source   = p_source,
         decision_by_id    = auth.uid(),
         decision_by_name  = p_by_name,
         decision_language = p_language,
         updated_by        = auth.uid()
   where id = p_design_id
  returning * into v_row;

  return v_row;
end $$;

-- ── Employees and the audit trail ──────────────────────────────────────────

/*
 * Writes a staff profile change and the audit entry describing it, together.
 *
 * They commit or they do not: an audit trail with a hole in it is worse than no
 * audit trail, because it looks complete.
 */
create or replace function public.save_staff_profile(
  p_id uuid,
  p_payload jsonb,
  p_is_new boolean,
  p_audit jsonb default '[]'::jsonb
) returns public.staff_profiles
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.staff_profiles;
begin
  if p_is_new then
    insert into public.staff_profiles
    select * from jsonb_populate_record(
      null::public.staff_profiles,
      p_payload || jsonb_build_object(
        'id', p_id::text,
        'created_at', to_jsonb(now()), 'updated_at', to_jsonb(now()),
        'created_by', auth.uid(), 'updated_by', auth.uid())
    )
    returning * into v_row;
  else
    update public.staff_profiles
       set name        = coalesce(p_payload->>'name', name),
           mobile      = coalesce(p_payload->>'mobile', mobile),
           designation = coalesce(p_payload->>'designation', designation),
           department  = coalesce(p_payload->>'department', department),
           role        = coalesce((p_payload->>'role')::app.staff_role, role),
           is_active   = coalesce((p_payload->>'is_active')::boolean, is_active),
           updated_by  = auth.uid()
     where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'That employee no longer exists.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_events (action, target_user_id, target_name,
                                   actor_id, actor_name, before, after,
                                   created_at, created_by)
  select (e->>'action')::app.audit_action,
         (e->>'target_user_id')::uuid,
         e->>'target_name',
         auth.uid(),
         e->>'actor_name',
         coalesce(e->>'before', ''),
         coalesce(e->>'after', ''),
         now(), auth.uid()
    from jsonb_array_elements(coalesce(p_audit, '[]'::jsonb)) as e;

  return v_row;
end $$;

revoke all on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;

-- ── Exposed helpers ────────────────────────────────────────────────────────
-- PostgREST only serves functions from the exposed schemas, so the permission
-- check the provisioning Edge Function needs gets a thin wrapper in `public`.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security invoker set search_path = ''
as $$ select app.has_permission(p_permission); $$;

create or replace function public.my_customer_id()
returns uuid
language sql stable security invoker set search_path = ''
as $$ select app.my_customer_id(); $$;

revoke all on function public.has_permission(text) from anon;
revoke all on function public.my_customer_id() from anon;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_customer_id() to authenticated;
