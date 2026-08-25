-- ---------------------------------------------------------------------------
-- Devasriya Print - apply column defaults inside the creating RPCs
--
-- `jsonb_populate_record(null::t, payload)` fills every column the payload does
-- not mention with NULL. It does not apply the column's DEFAULT - nothing tells
-- it to. So `INSERT INTO jobs SELECT * FROM jsonb_populate_record(...)` wrote an
-- explicit NULL into `priority` and `status` whenever a caller left them out,
-- and the NOT NULL constraint rejected the whole insert (23502).
--
-- The application always sends both, so this never showed up in the UI - but a
-- required field silently becoming NULL rather than its default is the kind of
-- thing that surfaces later as a mystery. The defaults are now merged in first,
-- so the layering reads the way it should:
--
--   column defaults  <-  what the caller sent  <-  what the server decides
--
-- Only the middle layer is under the client's control, and the last layer still
-- overrides everything.
-- ---------------------------------------------------------------------------

create or replace function public.create_enquiry(p_payload jsonb, p_year_key text)
returns public.enquiries
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.enquiries;
begin
  insert into public.enquiries
  select * from jsonb_populate_record(
    null::public.enquiries,
    jsonb_build_object('status', 'new')
      || p_payload
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

create or replace function public.create_job(p_payload jsonb, p_year_key text)
returns public.jobs
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.jobs;
begin
  insert into public.jobs
  select * from jsonb_populate_record(
    null::public.jobs,
    jsonb_build_object('priority', 'normal', 'status', 'open')
      || p_payload
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
    jsonb_build_object('priority', 'normal', 'status', 'open')
      || p_payload
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

-- `create or replace` keeps the existing privileges, but the default EXECUTE to
-- PUBLIC is re-added for a function whose signature changed. It has not here,
-- so this is belt and braces - and cheap.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_enquiry', 'create_job', 'convert_enquiry_to_job')
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;
