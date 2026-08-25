-- ---------------------------------------------------------------------------
-- Devasriya Print - cast the opening stage status to its enum
--
-- `case when v_index = 0 then 'ready' else 'pending' end` is typed `text`, and
-- PostgreSQL will not coerce an untyped CASE result into an enum column on
-- INSERT (42804). Every attempt to send a job to production failed on the first
-- task. Casting the branches makes the intent explicit rather than relying on
-- an inference that does not happen.
-- ---------------------------------------------------------------------------

create or replace function public.start_production_run(p_job_id uuid, p_by_name text)
returns public.production_runs
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job     public.jobs;
  v_design  public.designs;
  v_run     public.production_runs;
  v_stage   record;
  v_task_id uuid;
  v_index   integer := 0;
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
    'in-progress'::app.run_status, v_design.id, v_design.version,
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
      case when v_index = 0 then 'ready'::app.production_status
           else 'pending'::app.production_status end,
      now(), auth.uid(), now(), auth.uid()
    )
    returning id into v_task_id;

    if v_index = 0 then
      insert into public.production_events (run_id, task_id, job_id, action, stage_name,
                                            to_status, at, by_id, by_name)
      values (v_run.id, v_task_id, v_job.id, 'stage-unlocked', v_stage.name,
              'ready'::app.production_status, now(), auth.uid(), p_by_name);
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

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'start_production_run'
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;
