-- ---------------------------------------------------------------------------
-- Devasriya Print - Module 10a: invoices and payments
--
-- An invoice is a historical record in the same sense a quotation is: every
-- priced line and every customer detail is copied at creation and never read
-- back from the job, so re-pricing a job after billing cannot move a bill that
-- has already gone to the customer.
--
-- Two facts about money are enforced by the database rather than by the
-- browser, because both of them are the kind of mistake that is discovered
-- months later:
--
--   * what has been paid is never written by a client. paid_paise and status
--     carry no update grant at all; they are recomputed from the payments
--     table by a trigger, so the only way to move them is to record a payment.
--   * a payment can never take an invoice past its total. The trigger takes a
--     row lock on the invoice before it sums, so two people receiving the same
--     balance at the same moment cannot both succeed.
--
-- payments has select and insert grants and nothing else: history is not
-- editable and not deletable, by anyone, through any statement.
-- ---------------------------------------------------------------------------

create type app.payment_status as enum ('unpaid', 'partial', 'paid');
create type app.payment_mode   as enum ('cash', 'upi', 'bank-transfer', 'cheque', 'card', 'other');

create table public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  invoice_number         text not null unique check (invoice_number ~ '^INV-[0-9]{4}-[0-9]{4}$'),
  job_id                 uuid not null references public.jobs (id) on delete restrict,
  job_number             text not null,
  job_title              text not null,
  customer_id            uuid not null references public.customers (id) on delete restrict,
  customer_name          text not null,
  customer_mobile        text not null,
  customer_business_name text,
  customer_address       text,
  customer_gstin         text,
  invoice_date           timestamptz not null,
  subtotal_paise         bigint not null check (subtotal_paise > 0),
  discount_paise         bigint check (discount_paise > 0),
  discount_reason        text check (char_length(coalesce(discount_reason, '')) <= 200),
  total_paise            bigint not null check (total_paise > 0),
  paid_paise             bigint not null default 0 check (paid_paise >= 0),
  status                 app.payment_status not null default 'unpaid',
  notes                  text check (char_length(coalesce(notes, '')) <= 1000),
  terms                  text check (char_length(coalesce(terms, '')) <= 2000),
  created_at             timestamptz not null default now(),
  created_by             uuid not null,
  updated_at             timestamptz not null default now(),
  updated_by             uuid not null,
  constraint invoices_discount_within_subtotal check (coalesce(discount_paise, 0) < subtotal_paise),
  constraint invoices_total_is_subtotal_less_discount
    check (total_paise = subtotal_paise - coalesce(discount_paise, 0)),
  constraint invoices_not_overpaid check (paid_paise <= total_paise),
  constraint invoices_status_matches_paid check (
    (paid_paise = 0          and status = 'unpaid')  or
    (paid_paise = total_paise and status = 'paid')   or
    (paid_paise > 0 and paid_paise < total_paise and status = 'partial')
  )
);
create index invoices_job_idx      on public.invoices (job_id);
create index invoices_customer_idx on public.invoices (customer_id);
create index invoices_status_idx   on public.invoices (status, invoice_date desc);
create index invoices_open_idx     on public.invoices (invoice_date desc) where status <> 'paid';

-- Copied verbatim from job_pricing_lines at creation. No update or delete
-- grant exists anywhere: a billed price is a fact about a day.
create table public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices (id) on delete restrict,
  position          integer not null check (position between 0 and 49),
  product_id        uuid,
  product_name      text not null,
  pricing_method    app.pricing_method not null,
  measurement_unit  app.measurement_unit,
  width             numeric(12, 4),
  height            numeric(12, 4),
  length            numeric(12, 4),
  quantity          numeric(12, 4) not null,
  rate_paise        bigint not null,
  rate_unit         app.rate_unit not null,
  calculated_area   numeric(16, 6),
  calculated_length numeric(16, 6),
  line_amount_paise bigint not null,
  notes             text,
  unique (invoice_id, position)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices (id) on delete restrict,
  invoice_number text not null,
  job_id         uuid not null,
  customer_id    uuid not null,
  amount_paise   bigint not null check (amount_paise > 0),
  paid_at        timestamptz not null,
  mode           app.payment_mode not null,
  reference      text check (char_length(coalesce(reference, '')) <= 120),
  note           text check (char_length(coalesce(note, '')) <= 500),
  recorded_by_id uuid not null,
  recorded_by    text not null,
  created_at     timestamptz not null default now(),
  created_by     uuid not null
);
create index payments_invoice_idx  on public.payments (invoice_id, paid_at desc);
create index payments_job_idx      on public.payments (job_id);
create index payments_customer_idx on public.payments (customer_id, paid_at desc);

-- ── Keeping the two numbers honest ─────────────────────────────────────────

/*
 * total_paise is derived, so it is recomputed here rather than trusted from
 * the statement - and once a rupee has been received the discount is frozen,
 * because moving it would silently change what the customer still owes.
 */
create or replace function app.tg_invoice_guard()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.discount_paise is distinct from old.discount_paise and old.paid_paise > 0 then
    raise exception 'A payment has already been recorded against this invoice, so the discount can no longer change.'
      using errcode = 'P0001';
  end if;

  new.total_paise := new.subtotal_paise - coalesce(new.discount_paise, 0);
  new.updated_at  := now();
  return new;
end $$;

create trigger invoices_guard before update on public.invoices
  for each row execute function app.tg_invoice_guard();

/*
 * What has been paid, recomputed from the payment history.
 *
 * SECURITY DEFINER because paid_paise and status carry no update grant: this
 * function is the only thing in the system that can move them, which is what
 * makes "the invoice agrees with its payments" true by construction rather
 * than by convention.
 *
 * The row lock is taken before the sum, not after. In READ COMMITTED a second
 * transaction blocks on the lock and then re-reads with a fresh snapshot, so
 * two people receiving the same balance at the same moment cannot both be told
 * there was room for it.
 */
create or replace function app.sync_invoice_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total bigint;
  v_paid  bigint;
begin
  select total_paise into v_total
    from public.invoices where id = new.invoice_id for update;

  if v_total is null then
    raise exception 'That invoice no longer exists.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_paise), 0) into v_paid
    from public.payments where invoice_id = new.invoice_id;

  if v_paid > v_total then
    raise exception 'That is more than the balance outstanding on this invoice.'
      using errcode = 'P0001';
  end if;

  update public.invoices
     set paid_paise = v_paid,
         status     = case
                        when v_paid = 0       then 'unpaid'
                        when v_paid >= v_total then 'paid'
                        else 'partial'
                      end::app.payment_status,
         updated_by = auth.uid()
   where id = new.invoice_id;

  return new;
end $$;

create trigger payments_sync_invoice after insert on public.payments
  for each row execute function app.sync_invoice_payment();

-- ── Row level security ─────────────────────────────────────────────────────

alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments      enable row level security;

-- Snapshot columns, paid_paise and status are absent from the update grant, so
-- no statement written by any client can reach them.
grant select, insert on public.invoices to authenticated;
grant update (discount_paise, discount_reason, notes, terms, updated_by)
  on public.invoices to authenticated;

create policy invoices_read on public.invoices for select to authenticated
  using (app.has_permission('billing:view'));

create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    app.has_permission('billing:create')
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

create policy invoices_edit on public.invoices for update to authenticated
  using (app.has_permission('billing:edit'))
  with check (app.has_permission('billing:edit') and updated_by = auth.uid());

grant select, insert on public.invoice_lines to authenticated;

create policy invoice_lines_read on public.invoice_lines for select to authenticated
  using (app.has_permission('billing:view'));
create policy invoice_lines_insert on public.invoice_lines for insert to authenticated
  with check (app.has_permission('billing:create'));

-- Select and insert only. Payment history has no update or delete path.
grant select, insert on public.payments to authenticated;

create policy payments_read on public.payments for select to authenticated
  using (app.has_permission('billing:view'));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    app.has_permission('billing:create')
    and recorded_by_id = auth.uid()
    and created_by = auth.uid()
  );

-- ── Numbering ──────────────────────────────────────────────────────────────
-- Same gapless series machinery as ENQ / JOB / EST, with INV added.

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
                when 'invoices'  then 'INV'
              end;

  return v_prefix || '-' || p_year_key || '-' || lpad(v_next::text, 4, '0');
end $$;

-- ── Remote procedures ──────────────────────────────────────────────────────

/*
 * Bills a job.
 *
 * The lines and the customer details are copied here rather than sent by the
 * browser, so what is on the invoice is what the job was actually priced at.
 * A job may be billed more than once - part billing is normal - and each
 * invoice carries its own number, discount and payment history.
 */
create or replace function public.create_invoice(
  p_job_id uuid,
  p_discount_paise bigint,
  p_discount_reason text,
  p_notes text,
  p_terms text,
  p_year_key text
) returns public.invoices
language plpgsql security invoker set search_path = ''
as $$
declare
  v_job public.jobs;
  v_pricing public.job_pricing;
  v_customer public.customers;
  v_row public.invoices;
  v_lines integer;
  v_discount bigint;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then
    raise exception 'That job no longer exists.' using errcode = 'P0001';
  end if;

  select * into v_pricing from public.job_pricing where job_id = p_job_id;
  select count(*) into v_lines from public.job_pricing_lines where job_id = p_job_id;
  if v_pricing.job_id is null or v_lines = 0 then
    raise exception 'Price the job before billing it.' using errcode = 'P0001';
  end if;
  if coalesce(v_pricing.total_paise, 0) <= 0 then
    raise exception 'A job priced at zero cannot be billed.' using errcode = 'P0001';
  end if;

  v_discount := nullif(greatest(coalesce(p_discount_paise, 0), 0), 0);
  if v_discount is not null and v_discount >= v_pricing.total_paise then
    raise exception 'The discount cannot be the whole bill.' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = v_job.customer_id;

  insert into public.invoices (
    invoice_number, job_id, job_number, job_title,
    customer_id, customer_name, customer_mobile,
    customer_business_name, customer_address, customer_gstin,
    invoice_date, subtotal_paise, discount_paise, discount_reason, total_paise,
    notes, terms, created_at, created_by, updated_at, updated_by
  ) values (
    app.next_document_number('invoices', p_year_key),
    v_job.id, v_job.job_number, v_job.title,
    v_job.customer_id, v_job.customer_name, v_job.customer_mobile,
    nullif(v_customer.business_name, ''),
    case when v_customer.id is null then null
         else v_customer.address || ', ' || v_customer.city || ' ' || v_customer.pincode end,
    nullif(v_customer.gstin, ''),
    now(), v_pricing.total_paise, v_discount,
    case when v_discount is null then null else nullif(btrim(coalesce(p_discount_reason, '')), '') end,
    v_pricing.total_paise - coalesce(v_discount, 0),
    nullif(p_notes, ''), nullif(p_terms, ''),
    now(), auth.uid(), now(), auth.uid()
  )
  returning * into v_row;

  insert into public.invoice_lines (
    invoice_id, position, product_id, product_name, pricing_method, measurement_unit,
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

/*
 * Receives money against an invoice.
 *
 * The outstanding balance is checked here so the message is a useful one, and
 * again in the trigger under a row lock so a race cannot get past it. Who
 * received it is read from the employee record, not taken from the caller.
 */
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount_paise bigint,
  p_paid_at timestamptz,
  p_mode app.payment_mode,
  p_reference text,
  p_note text
) returns public.payments
language plpgsql security invoker set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_row public.payments;
  v_by text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'That invoice is not available.' using errcode = 'P0001';
  end if;

  if coalesce(p_amount_paise, 0) <= 0 then
    raise exception 'Enter the amount received.' using errcode = 'P0001';
  end if;

  if p_amount_paise > v_invoice.total_paise - v_invoice.paid_paise then
    raise exception 'That is more than the balance outstanding on this invoice.'
      using errcode = 'P0001';
  end if;

  select name into v_by from public.staff_profiles where id = auth.uid() and is_active;
  if v_by is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  insert into public.payments (
    invoice_id, invoice_number, job_id, customer_id,
    amount_paise, paid_at, mode, reference, note,
    recorded_by_id, recorded_by, created_at, created_by
  ) values (
    v_invoice.id, v_invoice.invoice_number, v_invoice.job_id, v_invoice.customer_id,
    p_amount_paise, coalesce(p_paid_at, now()), p_mode,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(), v_by, now(), auth.uid()
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
     where n.nspname = 'public' and p.proname in ('create_invoice', 'record_payment')
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;

grant select, insert, update, delete on public.invoices, public.invoice_lines, public.payments
  to service_role;
