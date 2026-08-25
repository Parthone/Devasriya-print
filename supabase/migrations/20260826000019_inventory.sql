-- ---------------------------------------------------------------------------
-- Devasriya Print - Module 10b: materials and stock
--
-- current_stock is not a field anybody types into. It carries no update grant,
-- and the only thing that moves it is the trigger below, which refuses to take
-- it under zero. So "the stock figure agrees with its transaction history" is
-- a property of the schema rather than a habit of the application.
--
-- inventory_transactions has select and insert grants and nothing else: a
-- correction is another movement with a reason, never an edit or a deletion.
-- ---------------------------------------------------------------------------

create type app.material_category as enum
  ('media', 'ink', 'laminate', 'hardware', 'consumable', 'other');

create type app.stock_unit as enum
  ('sq-ft', 'sq-m', 'running-ft', 'running-m', 'piece', 'sheet', 'roll', 'litre', 'kg');

create type app.stock_direction as enum ('in', 'out');

create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  category      app.material_category not null,
  unit          app.stock_unit not null,
  current_stock numeric(14, 3) not null default 0 check (current_stock >= 0),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  notes         text check (char_length(coalesce(notes, '')) <= 500),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid not null
);
create unique index inventory_items_name_idx on public.inventory_items (lower(btrim(name)));
create index inventory_items_category_idx on public.inventory_items (category, lower(btrim(name)));
create index inventory_items_low_idx on public.inventory_items (lower(btrim(name)))
  where is_active and minimum_stock > 0 and current_stock <= minimum_stock;

create table public.inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.inventory_items (id) on delete restrict,
  item_name     text not null,
  unit          app.stock_unit not null,
  direction     app.stock_direction not null,
  quantity      numeric(14, 3) not null check (quantity > 0),
  balance_after numeric(14, 3) not null check (balance_after >= 0),
  job_id        uuid references public.jobs (id) on delete set null,
  job_number    text,
  reason        text check (char_length(coalesce(reason, '')) <= 300),
  at            timestamptz not null,
  by_id         uuid not null,
  by_name       text not null,
  created_at    timestamptz not null default now(),
  created_by    uuid not null
);
create index inventory_transactions_item_idx on public.inventory_transactions (item_id, at desc);
create index inventory_transactions_job_idx  on public.inventory_transactions (job_id, at desc)
  where job_id is not null;
create index inventory_transactions_at_idx   on public.inventory_transactions (at desc);

-- ── Keeping the figure honest ──────────────────────────────────────────────

/*
 * A new material always starts empty. Its opening balance is recorded as a
 * movement like any other, so the history explains every unit that is there.
 */
create or replace function app.tg_inventory_item_insert()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  new.current_stock := 0;
  return new;
end $$;

create trigger inventory_items_start_empty before insert on public.inventory_items
  for each row execute function app.tg_inventory_item_insert();

create or replace function app.tg_inventory_item_update()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function app.tg_inventory_item_update();

/*
 * Applies a movement to the material it belongs to.
 *
 * SECURITY DEFINER because current_stock has no update grant: this is the only
 * thing in the system that can move it, which is what makes the running total
 * and the transaction history impossible to disagree.
 *
 * The row lock is taken before the arithmetic, so two people issuing the last
 * of a roll at the same moment cannot both be told there was enough.
 */
create or replace function app.sync_inventory_stock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_item    public.inventory_items;
  v_balance numeric(14, 3);
begin
  select * into v_item from public.inventory_items where id = new.item_id for update;

  if v_item.id is null then
    raise exception 'That material no longer exists.' using errcode = 'P0001';
  end if;
  if not v_item.is_active then
    raise exception 'That material is no longer in use, so stock cannot be moved against it.'
      using errcode = 'P0001';
  end if;

  v_balance := v_item.current_stock
             + case when new.direction = 'in' then new.quantity else -new.quantity end;

  if v_balance < 0 then
    raise exception 'There is not enough % in stock. Available: % %.',
      v_item.name, v_item.current_stock, v_item.unit using errcode = 'P0001';
  end if;

  new.item_name     := v_item.name;
  new.unit          := v_item.unit;
  new.balance_after := v_balance;

  update public.inventory_items
     set current_stock = v_balance,
         updated_by    = auth.uid()
   where id = new.item_id;

  return new;
end $$;

create trigger inventory_transactions_apply before insert on public.inventory_transactions
  for each row execute function app.sync_inventory_stock();

-- ── Row level security ─────────────────────────────────────────────────────

alter table public.inventory_items        enable row level security;
alter table public.inventory_transactions enable row level security;

-- current_stock is absent from the update grant: it belongs to the trigger.
grant select, insert on public.inventory_items to authenticated;
grant update (name, category, unit, minimum_stock, notes, is_active, updated_by)
  on public.inventory_items to authenticated;

create policy inventory_items_read on public.inventory_items for select to authenticated
  using (app.has_permission('inventory:view'));

create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (
    app.has_permission('inventory:manage')
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

create policy inventory_items_update on public.inventory_items for update to authenticated
  using (app.has_permission('inventory:manage'))
  with check (app.has_permission('inventory:manage') and updated_by = auth.uid());

-- Select and insert only. A correction is another movement, not an edit.
grant select, insert on public.inventory_transactions to authenticated;

create policy inventory_transactions_read on public.inventory_transactions
  for select to authenticated
  using (app.has_permission('inventory:view'));

create policy inventory_transactions_insert on public.inventory_transactions
  for insert to authenticated
  with check (
    app.has_permission('inventory:manage')
    and by_id = auth.uid()
    and created_by = auth.uid()
  );

-- ── Remote procedure ───────────────────────────────────────────────────────

/*
 * Records stock coming in or going out, optionally against a job.
 *
 * The refusal to go below zero lives in the trigger, under the row lock. This
 * function exists to snapshot the job number and the employee's name, neither
 * of which is trusted from the caller.
 */
create or replace function public.record_stock_movement(
  p_item_id uuid,
  p_direction app.stock_direction,
  p_quantity numeric,
  p_job_id uuid,
  p_reason text
) returns public.inventory_transactions
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row public.inventory_transactions;
  v_job_number text;
  v_by text;
begin
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Enter how much is moving.' using errcode = 'P0001';
  end if;

  if p_job_id is not null then
    select job_number into v_job_number from public.jobs where id = p_job_id;
    if v_job_number is null then
      raise exception 'That job no longer exists.' using errcode = 'P0001';
    end if;
  end if;

  select name into v_by from public.staff_profiles where id = auth.uid() and is_active;
  if v_by is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  insert into public.inventory_transactions (
    item_id, item_name, unit, direction, quantity, balance_after,
    job_id, job_number, reason, at, by_id, by_name, created_at, created_by
  ) values (
    p_item_id, '', 'piece', p_direction, p_quantity, 0,
    p_job_id, v_job_number, nullif(btrim(coalesce(p_reason, '')), ''),
    now(), auth.uid(), v_by, now(), auth.uid()
  )
  returning * into v_row;

  return v_row;
end $$;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_stock_movement'
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;

grant select, insert, update, delete
  on public.inventory_items, public.inventory_transactions to service_role;
