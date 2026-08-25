-- ---------------------------------------------------------------------------
-- Devasriya Print - production operations
--
-- All SECURITY INVOKER: they run as the caller, so every policy above still
-- applies to every statement inside them. They exist for atomicity, not to get
-- around the rules.
-- ---------------------------------------------------------------------------

/*
 * Puts a job into production.
 *
 * The run, one task per active stage, the opening history entry and the job's
 * new status all land together. The first stage is ready and the rest are
 * pending: work moves in order, and nothing downstream can be started early.
 *
 * The approved artwork is snapshotted here rather than looked up later. A
 * revision approved next week must not silently change the answer to "what did
 * we print".
 */
create or replace function public.start_production_run(p_job_id uuid, p_by_name text)
returns public.production_runs
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job      public.jobs;
  v_design   public.designs;
  v_run      public.production_runs;
  v_stage    record;
  v_task_id  uuid;
  v_index    integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));

  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'That job no longer exists.' using errcode = 'P0001';
  end if;
  if v_job.status in ('delivered', 'cancelled') then
    raise exception 'A % job cannot be sent to production.', v_job.status
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.production_runs where job_id = p_job_id) then
    raise exception 'This job is already in production.' using errcode = 'P0001';
  end if;

  -- The approved version, if there is one. A job with no design at all is a
  -- legitimate thing to print, so this is recorded rather than required.
  select * into v_design
    from public.designs
   where job_id = p_job_id and status = 'approved'
   limit 1;

  insert into public.production_runs (
    job_id, job_number, job_title, customer_id, customer_name, status,
    approved_design_id, approved_design_version,
    started_at, started_by_id, started_by_name,
    created_at, created_by, updated_at, updated_by
  ) values (
    v_job.id, v_job.job_number, v_job.title, v_job.customer_id, v_job.customer_name,
    'in-progress', v_design.id, v_design.version,
    now(), auth.uid(), p_by_name,
    now(), auth.uid(), now(), auth.uid()
  )
  returning * into v_run;

  for v_stage in
    select id, name, department
      from public.workflow_stages
     where is_active
     order by position, name
  loop
    insert into public.production_tasks (
      run_id, job_id, stage_id, stage_name, department, position, status,
      created_at, created_by, updated_at, updated_by
    ) values (
      v_run.id, v_job.id, v_stage.id, v_stage.name, v_stage.department, v_index,
      case when v_index = 0 then 'ready' else 'pending' end,
      now(), auth.uid(), now(), auth.uid()
    )
    returning id into v_task_id;

    if v_index = 0 then
      insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                            to_status, at, by_id, by_name)
      values (v_run.id, v_task_id, v_job.id, 'stage-unlocked', v_stage.name,
              'ready', now(), auth.uid(), p_by_name);
    end if;

    v_index := v_index + 1;
  end loop;

  if v_index = 0 then
    raise exception 'No production stages are set up yet. Add them in Settings first.'
      using errcode = 'P0001';
  end if;

  insert into public.production_events (run_id, job_id, action, at, by_id, by_name)
  values (v_run.id, v_job.id, 'run-started', now(), auth.uid(), p_by_name);

  perform app.sync_job_status(p_job_id);
  return v_run;
end $$;

/*
 * Moves one stage along.
 *
 * Completing or skipping a stage unlocks the next one in the same transaction,
 * so there is never a moment where the shop floor has nothing to pick up. The
 * transition table, the reason requirement and the assignment rule are all
 * enforced by the trigger on the table, which means they hold whether the move
 * comes through here or through a direct update.
 */
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
                         ) then 'on-hold' else 'in-progress' end,
           updated_by = auth.uid()
     where id = v_row.run_id;
  end if;

  perform app.sync_job_status(v_row.job_id);
  return v_row;
end $$;

/*
 * Puts somebody's name against a stage.
 *
 * Assigning work is `jobs:assign`, which is a different thing from being able
 * to do the work - the trigger on the table refuses this for anybody else,
 * however the update arrives.
 */
create or replace function public.assign_production_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_assignee_name text,
  p_by_name text
) returns public.production_tasks
language plpgsql security invoker set search_path = ''
as $$
declare v_row public.production_tasks;
begin
  update public.production_tasks
     set assigned_to_id   = p_assignee_id,
         assigned_to_name = nullif(btrim(coalesce(p_assignee_name, '')), ''),
         updated_by       = auth.uid()
   where id = p_task_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That stage is not available.' using errcode = 'P0001';
  end if;

  insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                        reason, at, by_id, by_name)
  values (v_row.run_id, v_row.id, v_row.job_id, 'stage-assigned', v_row.stage_name,
          v_row.assigned_to_name, now(), auth.uid(), p_by_name);

  return v_row;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('start_production_run', 'advance_production_task',
                         'assign_production_task')
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;

revoke all on function app.sync_job_status(uuid) from public, anon;
grant execute on function app.sync_job_status(uuid) to authenticated, service_role;
