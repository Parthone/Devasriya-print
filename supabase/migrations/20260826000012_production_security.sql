-- ---------------------------------------------------------------------------
-- Devasriya Print - production triggers, policies and grants
-- ---------------------------------------------------------------------------

/*
 * Keeps the job's own status in step with the shop floor.
 *
 * SECURITY DEFINER on purpose, and the only place in this module that has it.
 * A job's status here is a derived value, not a user edit: a designer holds
 * production:update but not jobs:edit, and should still be able to complete a
 * stage. So the derivation is done by the database rather than by granting the
 * shop floor the right to write job records directly.
 *
 * It only ever moves a job between the states production owns, and refuses to
 * touch a job that has been delivered or cancelled - those are decisions made
 * elsewhere and production does not get to undo them.
 */
create or replace function app.sync_job_status(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_current app.job_status;
  v_next    app.job_status;
  v_total   integer;
  v_settled integer;
  v_held    integer;
  v_active  integer;
begin
  select status into v_current from public.jobs where id = p_job_id;
  if v_current is null or v_current in ('delivered', 'cancelled') then
    return;
  end if;

  select count(*),
         count(*) filter (where status in ('completed', 'skipped')),
         count(*) filter (where status = 'on-hold'),
         count(*) filter (where status = 'in-progress')
    into v_total, v_settled, v_held, v_active
    from public.production_tasks
   where job_id = p_job_id;

  if v_total = 0 then
    return;
  elsif v_settled = v_total then
    v_next := 'ready';          -- every stage finished; waiting on collection
  elsif v_held > 0 then
    v_next := 'on-hold';        -- anything stopped stops the job
  elsif v_active > 0 then
    v_next := 'in-progress';
  else
    v_next := 'in-progress';    -- a run exists, so the job is under way
  end if;

  if v_next is distinct from v_current then
    update public.jobs
       set status = v_next, updated_at = now()
     where id = p_job_id;
  end if;
end $$;

/*
 * Guards every change to a task.
 *
 * Three separate rules, deliberately kept together so the whole story of what a
 * task may do is readable in one place:
 *   1. the move has to be in the transition table
 *   2. holding or skipping has to say why
 *   3. reassigning work needs jobs:assign, which production:update alone is not
 */
create or replace function app.tg_production_task_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.production_transitions
       where from_status = old.status and to_status = new.status
    ) then
      raise exception 'A stage that is % cannot become %.',
        replace(old.status::text, '-', ' '), replace(new.status::text, '-', ' ')
        using errcode = 'P0001';
    end if;

    if new.status = 'on-hold' and coalesce(btrim(new.hold_reason), '') = '' then
      raise exception 'Say why this stage is being put on hold.' using errcode = 'P0001';
    end if;

    if new.status = 'skipped' and coalesce(btrim(new.skip_reason), '') = '' then
      raise exception 'Say why this stage is being skipped.' using errcode = 'P0001';
    end if;
  end if;

  -- Assignment is a different permission from doing the work. Column grants
  -- cannot express that on their own, because permissive policies OR their
  -- checks together, so it is stated here instead.
  if (new.assigned_to_id is distinct from old.assigned_to_id
      or new.assigned_to_name is distinct from old.assigned_to_name)
     and not app.has_permission('jobs:assign') then
    raise exception 'You do not have permission to assign work.' using errcode = '42501';
  end if;

  return new;
end $$;

create trigger touch_updated_at before update on public.workflow_stages
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.production_runs
  for each row execute function app.tg_touch_updated_at();
create trigger touch_updated_at before update on public.production_tasks
  for each row execute function app.tg_touch_updated_at();
create trigger production_task_guard before update on public.production_tasks
  for each row execute function app.tg_production_task_guard();

-- ── Row level security ─────────────────────────────────────────────────────

alter table public.workflow_stages        enable row level security;
alter table public.production_runs        enable row level security;
alter table public.production_tasks       enable row level security;
alter table public.production_events      enable row level security;
alter table public.production_transitions enable row level security;

revoke all on public.workflow_stages, public.production_runs, public.production_tasks,
              public.production_events, public.production_transitions
  from anon, authenticated;

-- Stages: anyone on the shop floor needs to see the list; only the owner may
-- change what it is, the same rule the rate card and the pickup offices follow.
grant select, insert on public.workflow_stages to authenticated;
grant update (name, department, position, is_active, updated_at, updated_by)
  on public.workflow_stages to authenticated;

create policy stages_read on public.workflow_stages for select to authenticated
  using (app.is_active_staff());
create policy stages_insert on public.workflow_stages for insert to authenticated
  with check (app.has_permission('settings:manage')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy stages_update on public.workflow_stages for update to authenticated
  using (app.has_permission('settings:manage'))
  with check (app.has_permission('settings:manage') and updated_by = auth.uid());
-- Deactivated, never deleted: tasks name the stage they came from.

grant select, insert on public.production_runs to authenticated;
grant update (status, completed_at, updated_at, updated_by)
  on public.production_runs to authenticated;

create policy runs_read on public.production_runs for select to authenticated
  using (app.has_permission('production:view'));
create policy runs_insert on public.production_runs for insert to authenticated
  with check (app.has_permission('production:update')
              and started_by_id = auth.uid()
              and created_by = auth.uid() and updated_by = auth.uid());
create policy runs_update on public.production_runs for update to authenticated
  using (app.has_permission('production:update'))
  with check (app.has_permission('production:update') and updated_by = auth.uid());
-- No delete: a run is history the moment it exists.

-- The artwork snapshot, the stage a task came from, its position in the order
-- and which run it belongs to are all outside the UPDATE grant, so no statement
-- can reorder a run or repoint a task at a different job.
grant select, insert on public.production_tasks to authenticated;
grant update (status, started_at, completed_at, hold_reason, skip_reason, notes,
              assigned_to_id, assigned_to_name, updated_at, updated_by)
  on public.production_tasks to authenticated;

create policy tasks_read on public.production_tasks for select to authenticated
  using (app.has_permission('production:view'));
create policy tasks_insert on public.production_tasks for insert to authenticated
  with check (app.has_permission('production:update')
              and created_by = auth.uid() and updated_by = auth.uid());
create policy tasks_update on public.production_tasks for update to authenticated
  using (app.has_permission('production:update'))
  with check (app.has_permission('production:update') and updated_by = auth.uid());
-- No delete: a stage that happened stays on the run.

grant select, insert on public.production_events to authenticated;
create policy events_read on public.production_events for select to authenticated
  using (app.has_permission('production:view'));
create policy events_insert on public.production_events for insert to authenticated
  with check (app.has_permission('production:update') and by_id = auth.uid());
-- No update grant and no delete grant, for anybody. The trail is the record.

grant select on public.production_transitions to authenticated;
create policy production_transitions_read on public.production_transitions
  for select to authenticated using (app.is_active_staff());

grant all on public.workflow_stages, public.production_runs, public.production_tasks,
             public.production_events, public.production_transitions
  to service_role;
