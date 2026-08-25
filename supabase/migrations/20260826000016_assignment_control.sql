-- ---------------------------------------------------------------------------
-- Devasriya Print - Module 9: assignment control
--
-- Two things the previous version of this function did not do:
--
--   1. Check that the person being given the work still works here. A stage
--      assigned to a deactivated employee is work nobody is doing, and it looks
--      exactly like work somebody is doing.
--   2. Say what actually changed. "Assigned" on its own is not a history: a
--      reassignment has to record who it was taken from as well as who it went
--      to, or the trail cannot answer why a job sat still for two days.
--
-- Who may assign is unchanged and still enforced by the trigger on the table:
-- `jobs:assign`, which doing the work (`production:update`) does not include.
-- ---------------------------------------------------------------------------

create or replace function public.assign_production_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_assignee_name text,
  p_by_name text
) returns public.production_tasks
language plpgsql security invoker set search_path = ''
as $$
declare
  v_before public.production_tasks;
  v_row    public.production_tasks;
  v_name   text;
  v_note   text;
begin
  select * into v_before from public.production_tasks where id = p_task_id;
  if v_before.id is null then
    raise exception 'That stage is not available.' using errcode = 'P0001';
  end if;

  if p_assignee_id is not null then
    -- The name is read from the employee record rather than trusted from the
    -- caller, so the history cannot be made to say somebody else did the work.
    select name into v_name
      from public.staff_profiles
     where id = p_assignee_id and is_active;

    if v_name is null then
      raise exception 'That employee is not active, so work cannot be assigned to them.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.production_tasks
     set assigned_to_id   = p_assignee_id,
         assigned_to_name = v_name,
         updated_by       = auth.uid()
   where id = p_task_id
  returning * into v_row;

  v_note := case
    when v_name is null then 'Unassigned from ' || coalesce(v_before.assigned_to_name, 'nobody')
    when v_before.assigned_to_name is null then 'Assigned to ' || v_name
    when v_before.assigned_to_id = p_assignee_id then 'Still assigned to ' || v_name
    else 'Reassigned from ' || v_before.assigned_to_name || ' to ' || v_name
  end;

  insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                        reason, at, by_id, by_name)
  values (v_row.run_id, v_row.id, v_row.job_id, 'stage-assigned', v_row.stage_name,
          v_note, now(), auth.uid(), p_by_name);

  return v_row;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'assign_production_task'
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;

-- The board filters on "assigned to me" and "nobody yet", so both are indexed.
create index if not exists production_tasks_assignee_idx
  on public.production_tasks (assigned_to_id)
  where status not in ('completed', 'skipped');
