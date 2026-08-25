-- ---------------------------------------------------------------------------
-- Devasriya Print - bring the document counters back in step
--
-- A counter can fall behind the records it numbers if it is ever reset or
-- restored separately from the tables (a partial restore, a truncated test
-- fixture, a manual edit). When that happens the next allocation hands out a
-- number that is already taken, and the unique constraint rejects the whole
-- transaction - which is the right failure, but a confusing one.
--
-- This walks each series once and moves the counter to whichever is higher: the
-- value it holds, or the highest number actually issued. Idempotent, so it is
-- safe to run again, and it can only ever move a counter forwards - a counter
-- that went backwards would start reissuing numbers.
-- ---------------------------------------------------------------------------

with issued as (
  select 'enquiries'::app.counter_scope as scope,
         substring(enquiry_number from 5 for 4) as year_key,
         max(substring(enquiry_number from 10 for 4)::int) as highest
    from public.enquiries
   group by 1, 2
  union all
  select 'jobs'::app.counter_scope,
         substring(job_number from 5 for 4),
         max(substring(job_number from 10 for 4)::int)
    from public.jobs
   group by 1, 2
  union all
  select 'estimates'::app.counter_scope,
         substring(estimate_number from 5 for 4),
         max(substring(estimate_number from 10 for 4)::int)
    from public.estimates
   group by 1, 2
)
insert into public.document_counters (scope, year_key, last_value)
select scope, year_key, highest from issued
on conflict (scope, year_key) do update
  set last_value = greatest(public.document_counters.last_value, excluded.last_value);
