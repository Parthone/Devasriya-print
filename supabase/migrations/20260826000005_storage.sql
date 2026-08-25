-- ---------------------------------------------------------------------------
-- Devasriya Print - Storage buckets and policies
--
-- Three private buckets. Nothing is public: a viewable URL is signed at the
-- moment somebody asks for it and expires shortly afterwards, so a link cannot
-- be lifted out of the database and used by somebody the policies would refuse.
--
-- Objects are write-once. There is no UPDATE policy and no DELETE policy on any
-- of the three, which is what makes "this artwork was approved" a claim about a
-- specific file that stays true. An upload whose row insert then fails leaves an
-- unreferenced object behind: an orphaned file costs storage, a deletable one
-- would cost the guarantee.
--
-- The enquiry / job split is a hard boundary, not tidiness. Converting an
-- enquiry copies the bytes to a job owned path precisely so that seeing jobs
-- never grants sight of enquiries.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('enquiry-audio', 'enquiry-audio', false, 5242880,
   array['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a']),
  ('job-audio', 'job-audio', false, 5242880,
   array['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a']),
  ('designs', 'designs', false, 26214400,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Paths are `{owner_id}/{attachment_id}.{ext}`, so the first folder segment is
-- the record the object belongs to.
create or replace function app.storage_owner_id(p_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

-- ── Enquiry requirement audio ──────────────────────────────────────────────
create policy "enquiry audio read" on storage.objects for select to authenticated
  using (bucket_id = 'enquiry-audio' and app.has_permission('enquiries:view'));

create policy "enquiry audio insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'enquiry-audio'
    and (app.has_permission('enquiries:create') or app.has_permission('enquiries:edit'))
  );

-- ── Job requirement audio ──────────────────────────────────────────────────
-- The customer whose order it is may play their own message back on the design
-- review screen.
create policy "job audio read" on storage.objects for select to authenticated
  using (
    bucket_id = 'job-audio'
    and (
      app.has_permission('jobs:view')
      or exists (
        select 1 from public.jobs j
        where j.id = app.storage_owner_id(name)
          and app.is_active_customer()
          and j.customer_id = app.my_customer_id()
      )
    )
  );

create policy "job audio insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-audio'
    and (app.has_permission('jobs:create') or app.has_permission('jobs:edit'))
  );

-- ── Design files ───────────────────────────────────────────────────────────
-- Ownership is read from the job the object sits under, which is the same
-- customer the design row carries.
create policy "design read" on storage.objects for select to authenticated
  using (
    bucket_id = 'designs'
    and (
      app.has_permission('designs:view')
      or exists (
        select 1 from public.jobs j
        where j.id = app.storage_owner_id(name)
          and app.is_active_customer()
          and j.customer_id = app.my_customer_id()
      )
    )
  );

create policy "design insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'designs' and app.has_permission('designs:upload'));

-- No update policy and no delete policy for any of the three buckets: an object
-- is written once and stays exactly as it was written.
