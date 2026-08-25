-- ---------------------------------------------------------------------------
-- Devasriya Print - cast the run status to its enum
--
-- The same defect as the previous migration, in the other direction: the CASE
-- that decides whether a run is on hold or moving is typed `text`, and
-- PostgreSQL will not coerce it into `app.run_status` (42804). Every attempt to
-- move a stage along failed at the point the run was updated.
--
-- Casting both branches, so the type is stated rather than hoped for.
-- ---------------------------------------------------------------------------

create or replace function public.advance_production_task(
  p_task_id uuid,
  p_to_status app.production_status,
  p_reason text,
  p_by_name text
) returns public.production_tasks
language plpgsql security invoker set search_path = ''
as $$
declare
  v_task   public.production_tasks;
  v_next   public.production_tasks;
  v_row    public.production_tasks;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action app.production_action;
  v_open   integer;
begin
  select * into v_task from public.production_tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'That stage is not available.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_task.run_id::text, 0));

  -- Work moves in order: a stage cannot start while anything in front of it is
  -- still open. The trigger guards the shape of the move; this guards the queue.
  if p_to_status = 'in-progress' and v_task.status = 'ready' then
    select count(*) into v_open
      from public.production_tasks
     where run_id = v_task.run_id
       and position < v_task.position
       and status not in ('completed', 'skipped');
    if v_open > 0 then
      raise exception 'An earlier stage is still open. Finish that one first.'
        using errcode = 'P0001';
    end if;
  end if;

  update public.production_tasks
     set status       = p_to_status,
         started_at   = case when p_to_status = 'in-progress' and started_at is null
                             then now() else started_at end,
         completed_at = case when p_to_status in ('completed', 'skipped')
                             then now() else completed_at end,
         hold_reason  = case when p_to_status = 'on-hold' then v_reason else hold_reason end,
         skip_reason  = case when p_to_status = 'skipped' then v_reason else skip_reason end,
         updated_by   = auth.uid()
   where id = p_task_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'You do not have permission to update this stage.' using errcode = '42501';
  end if;

  v_action := case p_to_status
                when 'in-progress' then
                  case when v_task.status = 'on-hold' then 'stage-resumed'::app.production_action
                       else 'stage-started'::app.production_action end
                when 'on-hold'   then 'stage-held'::app.production_action
                when 'completed' then 'stage-completed'::app.production_action
                when 'skipped'   then 'stage-skipped'::app.production_action
                else 'stage-unlocked'::app.production_action
              end;

  insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                        from_status, to_status, reason, at, by_id, by_name)
  values (v_row.run_id, v_row.id, v_row.job_id, v_action, v_row.stage_name,
          v_task.status, p_to_status, v_reason, now(), auth.uid(), p_by_name);

  -- Finishing a stage hands the next one to whoever is waiting for it.
  if p_to_status in ('completed', 'skipped') then
    select * into v_next
      from public.production_tasks
     where run_id = v_row.run_id and status = 'pending'
     order by position
     limit 1;

    if v_next.id is not null then
      update public.production_tasks
         set status = 'ready', updated_by = auth.uid()
       where id = v_next.id;

      insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                            from_status, to_status, at, by_id, by_name)
      values (v_row.run_id, v_next.id, v_row.job_id, 'stage-unlocked', v_next.stage_name,
              'pending', 'ready', now(), auth.uid(), p_by_name);
    end if;
  end if;

  -- Every stage settled: the run is done, and the job is ready for collection.
  select count(*) into v_open
    from public.production_tasks
   where run_id = v_row.run_id and status not in ('completed', 'skipped');

  if v_open = 0 then
    update public.production_runs
       set status = 'completed', completed_at = now(), updated_by = auth.uid()
     where id = v_row.run_id and status <> 'completed';

    insert into public.production_events (run_id, job_id, action, at, by_id, by_name)
    values (v_row.run_id, v_row.job_id, 'run-completed', now(), auth.uid(), p_by_name);
  else
    update public.production_runs
       set status = case when exists (
                           select 1 from public.production_tasks
                            where run_id = v_row.run_id and status = 'on-hold'
                         ) then 'on-hold'::app.run_status
                         else 'in-progress'::app.run_status end,
           updated_by = auth.uid()
     where id = v_row.run_id;
  end if;

  perform app.sync_job_status(v_row.job_id);
  return v_row;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'advance_production_task'
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;
