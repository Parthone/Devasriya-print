-- ---------------------------------------------------------------------------
-- Devasriya Print - fixes for defects found against the live project
--
-- Additive only. The first six migrations are already applied to production and
-- are never edited: everything here is a `create or replace` or a grant change.
-- ---------------------------------------------------------------------------

-- ── 1. save_staff_profile could never insert ───────────────────────────────
--
-- `staff_profiles.kind` is GENERATED ALWAYS AS ... STORED, and
-- `INSERT INTO t SELECT * FROM jsonb_populate_record(...)` sends a value for
-- every column including the generated one, which PostgreSQL refuses outright
-- (SQLSTATE 428C9, "cannot insert a non-DEFAULT value into column"). So every
-- attempt to create an employee failed.
--
-- Rewritten with an explicit column list. That is the right shape here anyway:
-- naming the columns is what stops a caller smuggling a value into a column
-- this function was never meant to write.
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
    insert into public.staff_profiles (
      id, name, email, mobile, designation, department, role, is_active,
      created_at, created_by, updated_at, updated_by
    ) values (
      p_id,
      p_payload->>'name',
      p_payload->>'email',
      p_payload->>'mobile',
      p_payload->>'designation',
      p_payload->>'department',
      (p_payload->>'role')::app.staff_role,
      coalesce((p_payload->>'is_active')::boolean, true),
      now(), auth.uid(), now(), auth.uid()
    )
    returning * into v_row;   -- the INSERT policy is evaluated here
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

-- ── 2. Every function was executable by anon ───────────────────────────────
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, and `anon`
-- inherits PUBLIC. `REVOKE ... FROM anon` does not remove that, so the earlier
-- revokes were no-ops: an unauthenticated caller could reach every RPC.
--
-- Nothing leaked - the functions are SECURITY INVOKER, so anon still hit
-- "permission denied for table ..." on the first statement, and the two
-- read-only helpers simply answered false and null. But the door was open, and
-- an RPC added later without this care would have been a real hole.
--
-- Revoking from PUBLIC by signature, so an added or changed overload cannot
-- quietly slip back to being world-executable.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'create_enquiry', 'add_enquiry_follow_up', 'create_job',
         'convert_enquiry_to_job', 'save_job_pricing', 'create_estimate',
         'create_design_version', 'record_design_decision',
         'save_staff_profile', 'has_permission', 'my_customer_id'
       )
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role',
                   fn.signature);
  end loop;
end $$;

-- The helpers in `app` are reached only through the policies, which run as the
-- table owner, so no client role needs EXECUTE on them at all.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role',
                   fn.signature);
  end loop;
end $$;
