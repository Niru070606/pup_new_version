-- =====================================================================
-- 002 - Roles, least-privilege helpers, media metadata, upload limits,
--       Supabase Storage bucket + policies.
-- Run after 001. Safe to read top to bottom; every new table has RLS.
-- =====================================================================

-- ---------- Role helpers ---------------------------------------------
create or replace function public.has_role(p_roles public.user_role[]) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role = any (p_roles) and p.status = 'approved' and u.email_confirmed_at is not null);
$$;

create or replace function public.is_designer() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role(array['designer']::public.user_role[]); $$;

create or replace function public.is_faculty() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role(array['faculty']::public.user_role[]); $$;

-- Admin OR designer: may touch design drafts, link drafts and design media.
create or replace function public.can_design() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role(array['designer','admin']::public.user_role[]); $$;

-- ---------- Role assignment (administrators only) --------------------
-- Admin accounts still cannot be created or changed through the website.
-- Defense in depth: no one can ever change their own role/status through the API,
-- even if a future grant or policy is added by mistake. Only the SQL editor (no JWT) may.
create or replace function public.guard_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status) and coalesce(auth.role(), 'service_role') in ('anon', 'authenticated') then
    -- Allowed only from inside the audited admin functions (they run as the function owner, where auth.role() is still 'authenticated').
    -- Those functions set this flag; direct table updates cannot.
    if coalesce(current_setting('app.privileged_change', true), '') <> 'on' then
      raise exception 'Role and status can only be changed by an administrator through the approved functions.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles for each row execute function public.guard_profile_privileged_columns();

-- The admin functions below set the flag for their own transaction only.
create or replace function public.set_account_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_target public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_role not in ('faculty', 'designer') then raise exception 'Only the Faculty/Staff and Designer roles can be assigned here.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found.'; end if;
  if v_target.role = 'admin' then raise exception 'Administrator accounts cannot be changed here.'; end if;
  if v_target.role::text = p_role then return; end if;
  perform set_config('app.privileged_change', 'on', true);
  update public.profiles set role = p_role::public.user_role where id = p_user_id;
  perform public.write_audit('account_role_changed', 'user', p_user_id::text,
    jsonb_build_object('email', v_target.email, 'from', v_target.role, 'to', p_role));
end $$;

create or replace function public.set_account_status(p_user_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_target public.profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_status not in ('approved', 'rejected', 'suspended', 'deactivated') then raise exception 'Invalid status.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own account.'; end if;
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found.'; end if;
  if v_target.role = 'admin' then raise exception 'Administrator accounts cannot be changed here.'; end if;
  if p_status in ('rejected', 'suspended') and v_reason is null then raise exception 'A reason is required.'; end if;
  if p_status = 'approved' and not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'This user has not verified their email address yet.'; end if;
  if not (
    (p_status = 'approved' and v_target.status in ('pending_approval', 'rejected', 'suspended', 'deactivated')) or
    (p_status = 'rejected' and v_target.status = 'pending_approval') or
    (p_status = 'suspended' and v_target.status = 'approved') or
    (p_status = 'deactivated' and v_target.status in ('approved', 'suspended'))
  ) then raise exception 'That status change is not allowed.'; end if;

  perform set_config('app.privileged_change', 'on', true);
  update public.profiles
     set status = p_status::public.account_status,
         status_reason = case when p_status = 'approved' then null else v_reason end
   where id = p_user_id;
  perform public.write_audit('account_' || p_status, 'user', p_user_id::text, jsonb_build_object('email', v_target.email));
end $$;

-- Announcements remain a Faculty/Staff and Administrator function. Designers cannot author them.
-- (Re-created in 003 with the media/scheduling parameters; the old signature is dropped there.)
create or replace function public.owns_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['faculty','admin']::public.user_role[])
     and exists (select 1 from public.announcements a where a.id = p_id and a.author_id = auth.uid());
$$;

-- ---------- Media settings (administrator-configurable limits) --------
create table public.media_settings (
  id boolean primary key default true check (id),           -- single row
  max_image_bytes bigint not null default 5242880  check (max_image_bytes between 102400 and 26214400),   -- 5 MB
  max_document_bytes bigint not null default 15728640 check (max_document_bytes between 102400 and 52428800), -- 15 MB
  quota_total_bytes bigint not null default 524288000 check (quota_total_bytes >= 10485760),             -- 500 MB (Supabase free plan has 1 GB)
  quota_per_user_bytes bigint not null default 104857600 check (quota_per_user_bytes >= 1048576),        -- 100 MB
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.media_settings default values;

-- ---------- Media assets (metadata for every file in the bucket) -----
create type public.media_kind as enum ('image', 'document');
create type public.media_status as enum ('pending_upload', 'ready', 'deleted');
-- purpose decides who may upload and who may reuse an asset.
create type public.media_purpose as enum ('design', 'announcement', 'personnel', 'document', 'event');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  kind public.media_kind not null,
  purpose public.media_purpose not null,
  status public.media_status not null default 'pending_upload',
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  mime_type text not null,
  declared_bytes bigint not null check (declared_bytes > 0),
  size_bytes bigint not null default 0,                      -- measured from storage when finished
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  -- object paths inside bucket 'site-media'. Images have three variants; documents only path_original.
  path_original text,
  path_medium text,
  path_thumb text,
  width_medium int,
  width_thumb int,
  alt_text text check (char_length(alt_text) <= 300),
  caption text check (char_length(caption) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  folder text not null default '' check (char_length(folder) <= 60),
  -- Maintained by refresh_media_public(): true only while the asset is used by APPROVED, live content.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_mime_ok check (
    (kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp')) or
    (kind = 'document' and mime_type in (
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')))
);
create index on public.media_assets (owner_id, created_at desc);
create index on public.media_assets (purpose, status);
create index on public.media_assets (is_public) where is_public;
create trigger trg_touch before update on public.media_assets for each row execute function public.touch_updated_at();

-- ---------- Who may upload what --------------------------------------
create or replace function public.can_upload_purpose(p_purpose public.media_purpose) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_purpose
    when 'design'       then public.can_design()
    when 'announcement' then public.has_role(array['faculty','admin']::public.user_role[])
    else public.is_admin()      -- personnel photos, documents, events
  end;
$$;

-- Step 1 of an upload: validate, enforce limits and quotas, reserve an id/path.
create or replace function public.media_begin_upload(p_purpose text, p_kind text, p_filename text, p_mime text, p_bytes bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_set public.media_settings;
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_filename, ''));
  v_ext text := lower(substring(btrim(coalesce(p_filename, '')) from '\.([A-Za-z0-9]+)$'));
  v_used_all bigint; v_used_me bigint;
begin
  if not public.is_active_user() then raise exception 'Your account is not active.'; end if;
  if p_purpose not in ('design','announcement','personnel','document','event') then raise exception 'Invalid upload purpose.'; end if;
  if p_kind not in ('image','document') then raise exception 'Invalid file kind.'; end if;
  if not public.can_upload_purpose(p_purpose::public.media_purpose) then raise exception 'You do not have permission to upload this kind of file.'; end if;
  if (p_kind = 'document') <> (p_purpose = 'document') then raise exception 'Documents can only be uploaded to the Document Center.'; end if;
  if v_name = '' or char_length(v_name) > 200 then raise exception 'Invalid file name.'; end if;
  -- Extension allow-list in addition to the MIME allow-list. Blocks .svg, .html, .exe, macro-enabled Office files, etc.
  if p_kind = 'image' and (v_ext is null or v_ext not in ('jpg','jpeg','png','webp')) then
    raise exception 'Only JPG, PNG or WebP images are allowed.'; end if;
  if p_kind = 'document' and (v_ext is null or v_ext not in ('pdf','doc','docx','xls','xlsx','ppt','pptx')) then
    raise exception 'Only PDF and Microsoft Office documents (without macros) are allowed.'; end if;
  if p_bytes is null or p_bytes <= 0 then raise exception 'The file is empty.'; end if;

  select * into v_set from public.media_settings;
  if p_kind = 'image' and p_bytes > v_set.max_image_bytes then
    raise exception 'This image is larger than the % MB limit.', round(v_set.max_image_bytes / 1048576.0, 1); end if;
  if p_kind = 'document' and p_bytes > v_set.max_document_bytes then
    raise exception 'This document is larger than the % MB limit.', round(v_set.max_document_bytes / 1048576.0, 1); end if;

  -- Quota. Abandoned reservations older than one hour are ignored.
  select coalesce(sum(case when status = 'ready' then size_bytes else declared_bytes end), 0) into v_used_all
    from public.media_assets where status = 'ready' or (status = 'pending_upload' and created_at > now() - interval '1 hour');
  select coalesce(sum(case when status = 'ready' then size_bytes else declared_bytes end), 0) into v_used_me
    from public.media_assets where owner_id = auth.uid() and (status = 'ready' or (status = 'pending_upload' and created_at > now() - interval '1 hour'));
  if v_used_all + p_bytes * 3 > v_set.quota_total_bytes then raise exception 'The site media storage quota has been reached. Ask an administrator.'; end if;
  if not public.is_admin() and v_used_me + p_bytes * 3 > v_set.quota_per_user_bytes then raise exception 'You have reached your personal upload quota. Delete unused files or ask an administrator.'; end if;

  insert into public.media_assets (id, owner_id, kind, purpose, original_filename, mime_type, declared_bytes)
  values (v_id, auth.uid(), p_kind::public.media_kind, p_purpose::public.media_purpose, v_name, lower(coalesce(p_mime, '')), p_bytes);
  return v_id;
end $$;

-- Step 3 of an upload: confirm the objects really exist in storage, measure them, and activate the asset.
create or replace function public.media_finish_upload(p_id uuid, p_width int, p_height int, p_width_medium int, p_width_thumb int, p_alt text, p_caption text, p_folder text)
returns public.media_assets language plpgsql security definer set search_path = public, storage as $$
declare
  v_a public.media_assets; v_set public.media_settings;
  v_total bigint; v_cnt int; v_orig bigint;
  v_ext text;
begin
  select * into v_a from public.media_assets where id = p_id for update;
  if not found or v_a.owner_id <> auth.uid() then raise exception 'Upload not found.'; end if;
  if v_a.status <> 'pending_upload' then raise exception 'This upload was already completed.'; end if;
  select * into v_set from public.media_settings;

  select count(*), coalesce(sum((metadata ->> 'size')::bigint), 0) into v_cnt, v_total
    from storage.objects where bucket_id = 'site-media' and name like p_id::text || '/%';
  if v_a.kind = 'image' and v_cnt <> 3 then raise exception 'The image upload is incomplete. Please try again.'; end if;
  if v_a.kind = 'image' and exists (select 1 from storage.objects where bucket_id = 'site-media' and name like p_id::text || '/%' and coalesce(metadata ->> 'mimetype', '') <> 'image/webp') then
    raise exception 'Unexpected image format.'; end if;
  if v_a.kind = 'document' and exists (select 1 from storage.objects where bucket_id = 'site-media' and name like p_id::text || '/%' and lower(coalesce(metadata ->> 'mimetype', '')) <> v_a.mime_type) then
    raise exception 'The file type does not match what was declared.'; end if;
  if v_a.kind = 'document' and v_cnt <> 1 then raise exception 'The file upload is incomplete. Please try again.'; end if;

  select coalesce(sum((metadata ->> 'size')::bigint), 0) into v_orig from storage.objects
    where bucket_id = 'site-media' and name = p_id::text || '/original.' || case when v_a.kind = 'image' then 'webp' else lower(substring(v_a.original_filename from '\.([A-Za-z0-9]+)$')) end;
  if v_a.kind = 'image' and v_orig > v_set.max_image_bytes then raise exception 'The optimized image is still larger than the allowed size.'; end if;
  if v_a.kind = 'document' and v_orig > v_set.max_document_bytes then raise exception 'The document is larger than the allowed size.'; end if;

  if v_a.kind = 'image' then
    if coalesce(p_width, 0) < 1 or coalesce(p_height, 0) < 1 then raise exception 'Invalid image dimensions.'; end if;
    update public.media_assets set
      status = 'ready', size_bytes = v_total, width = p_width, height = p_height,
      mime_type = 'image/webp',    -- every image is re-encoded in the browser to WebP (strips metadata and any embedded payload)
      path_original = p_id::text || '/original.webp', path_medium = p_id::text || '/medium.webp', path_thumb = p_id::text || '/thumb.webp',
      width_medium = p_width_medium, width_thumb = p_width_thumb,
      alt_text = left(btrim(coalesce(p_alt, '')), 300), caption = left(btrim(coalesce(p_caption, '')), 500), folder = left(btrim(coalesce(p_folder, '')), 60)
     where id = p_id returning * into v_a;
  else
    v_ext := lower(substring(v_a.original_filename from '\.([A-Za-z0-9]+)$'));
    update public.media_assets set
      status = 'ready', size_bytes = v_total, path_original = p_id::text || '/original.' || v_ext,
      caption = left(btrim(coalesce(p_caption, '')), 500), folder = left(btrim(coalesce(p_folder, '')), 60)
     where id = p_id returning * into v_a;
  end if;
  perform public.write_audit('media_uploaded', 'media', p_id::text, jsonb_build_object('purpose', v_a.purpose, 'bytes', v_total));
  return v_a;
end $$;

-- Editing descriptive metadata of an asset you own (or any design asset if you are a designer/admin).
create or replace function public.media_update_meta(p_id uuid, p_alt text, p_caption text, p_folder text, p_tags text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.media_assets;
begin
  select * into v_a from public.media_assets where id = p_id for update;
  if not found or v_a.status <> 'ready' then raise exception 'Media not found.'; end if;
  if not (public.is_admin() or v_a.owner_id = auth.uid() or (v_a.purpose = 'design' and public.is_designer())) then
    raise exception 'You do not have permission to change this media.'; end if;
  update public.media_assets set alt_text = left(btrim(coalesce(p_alt, '')), 300), caption = left(btrim(coalesce(p_caption, '')), 500),
    folder = left(btrim(coalesce(p_folder, '')), 60), tags = coalesce((select (array_agg(left(btrim(t), 30)))[1:10] from unnest(p_tags) t where btrim(t) <> ''), '{}')
   where id = p_id;
end $$;

-- ---------- Where is an asset used? ----------------------------------
-- Each feature registers two small queries here (from its own migration):
--   any_sql  = ids of assets referenced anywhere (drafts included)  -> blocks deletion
--   live_sql = ids of assets referenced by APPROVED, live content   -> makes the asset publicly readable
-- Internal table: nobody can read or write it through the API.
create table public.media_ref_sources (
  key text primary key,
  label text not null,
  any_sql text not null,
  live_sql text not null
);
alter table public.media_ref_sources enable row level security;
revoke all on public.media_ref_sources from anon, authenticated;

create or replace function public.media_usage(p_id uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare r record; v_found boolean; v_uses text[] := '{}';
begin
  for r in select * from public.media_ref_sources order by key loop
    execute format('select exists (select 1 from (%s) q(id) where q.id = $1)', r.any_sql) into v_found using p_id;
    if v_found then v_uses := v_uses || r.label; end if;
  end loop;
  return v_uses;
end $$;

-- Safe deletion: step 1 marks the asset deleted (refused while in use); step 2 the browser removes the files
-- (storage policy only allows removal of files whose asset row is marked deleted).
create or replace function public.media_request_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.media_assets; v_uses text[];
begin
  select * into v_a from public.media_assets where id = p_id for update;
  if not found or v_a.status = 'deleted' then raise exception 'Media not found.'; end if;
  if not (public.is_admin() or v_a.owner_id = auth.uid()) then raise exception 'You can only delete files you uploaded.'; end if;
  v_uses := public.media_usage(p_id);
  if cardinality(v_uses) > 0 then
    raise exception 'This file is still in use (%). Replace it there first.', array_to_string(v_uses[1:3], ', '); end if;
  update public.media_assets set status = 'deleted', is_public = false where id = p_id;
  perform public.write_audit('media_deleted', 'media', p_id::text, jsonb_build_object('name', v_a.original_filename));
end $$;

-- Admin-only: change upload limits/quotas.
create or replace function public.set_media_settings(p_max_image bigint, p_max_doc bigint, p_quota_total bigint, p_quota_user bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  update public.media_settings set max_image_bytes = p_max_image, max_document_bytes = p_max_doc,
    quota_total_bytes = p_quota_total, quota_per_user_bytes = p_quota_user, updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('media_settings_updated', 'media_settings', 'main',
    jsonb_build_object('max_image', p_max_image, 'max_doc', p_max_doc, 'quota_total', p_quota_total, 'quota_user', p_quota_user));
end $$;

create or replace function public.media_storage_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_design() and not public.is_admin() then raise exception 'Access denied.'; end if;
  return jsonb_build_object(
    'used_total', (select coalesce(sum(size_bytes), 0) from public.media_assets where status = 'ready'),
    'used_mine',  (select coalesce(sum(size_bytes), 0) from public.media_assets where status = 'ready' and owner_id = auth.uid()),
    'settings',   (select to_jsonb(s) - 'id' - 'updated_by' from public.media_settings s));
end $$;

-- Public may only see settings-free limits through the uploader: it needs the limits to pre-check files.
create or replace function public.media_limits() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('max_image_bytes', max_image_bytes, 'max_document_bytes', max_document_bytes) from public.media_settings;
$$;

-- ---------- Public flag maintenance ----------------------------------
-- Recomputes which assets belong to approved, live content. Called by every approve / publish / rollback function.
create or replace function public.refresh_media_public() returns void
language plpgsql security definer set search_path = public as $$
declare v_sql text;
begin
  select string_agg('(' || live_sql || ')', ' union ') into v_sql from public.media_ref_sources;
  if v_sql is null then
    update public.media_assets set is_public = false where is_public;
    return;
  end if;
  execute 'update public.media_assets m set is_public = (m.status = ''ready'' and m.id in (' || v_sql || ')) '
       || 'where m.is_public is distinct from (m.status = ''ready'' and m.id in (' || v_sql || '))';
end $$;

-- ---------- RLS: media tables ----------------------------------------
alter table public.media_settings enable row level security;
alter table public.media_assets enable row level security;

create policy media_settings_admin_select on public.media_settings for select to authenticated using (public.is_admin());

-- Admin: everything. Owner: own files. Designers: all design assets (shared library). Nobody else.
create policy media_assets_select on public.media_assets for select to authenticated using (
  status <> 'deleted' and (
    public.is_admin()
    or owner_id = auth.uid()
    or (purpose = 'design' and public.is_designer())
  ));
-- No insert/update/delete policies: all changes go through the functions above.

-- A view that exposes ONLY what anonymous visitors may see: assets that are part of approved, live content.
create view public.public_media as
select id, kind, alt_text, caption, width, height, width_medium, width_thumb, path_original, path_medium, path_thumb, original_filename, size_bytes, mime_type
from public.media_assets where is_public and status = 'ready';

-- ---------- Storage bucket and policies ------------------------------
-- ONE private bucket. Nothing is public by URL. Visitors get short-lived signed links, and the storage
-- SELECT policy below only lets them sign files that belong to approved, live content (media_assets.is_public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', false, 52428800,
  array['image/webp','image/jpeg','image/png','application/pdf',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.media_object_asset(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

-- Policy checks run as the caller, who has no table access to media_assets, so they go through these narrow
-- security-definer helpers instead (each returns only true/false).
create or replace function public.media_obj_is_public(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_assets m where m.id = public.media_object_asset(p_name) and m.is_public and m.status = 'ready');
$$;
create or replace function public.media_obj_staff_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_assets m where m.id = public.media_object_asset(p_name) and m.status <> 'deleted' and (
    public.is_admin() or m.owner_id = auth.uid() or (m.purpose = 'design' and public.is_designer())));
$$;
create or replace function public.media_obj_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select (storage.foldername(p_name))[2] is null and exists (
    select 1 from public.media_assets m
    where m.id = public.media_object_asset(p_name) and m.owner_id = auth.uid() and m.status = 'pending_upload'
      and public.can_upload_purpose(m.purpose) and public.is_active_user()
      and ((m.kind = 'image' and storage.filename(p_name) in ('original.webp', 'medium.webp', 'thumb.webp'))
        or (m.kind = 'document' and storage.filename(p_name) = 'original.' || lower(substring(m.original_filename from '\.([A-Za-z0-9]+)$')))));
$$;
create or replace function public.media_obj_delete_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_assets m where m.id = public.media_object_asset(p_name) and m.status = 'deleted' and (m.owner_id = auth.uid() or public.is_admin()));
$$;

-- Read: visitors only for published assets; signed-in users for their own / design library / admin.
create policy "site-media public read published" on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media' and public.media_obj_is_public(name));
create policy "site-media staff read" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.media_obj_staff_read(name));
-- Upload: only into a folder reserved by media_begin_upload() for YOU, while it is still pending, and only the expected file names.
create policy "site-media upload reserved" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.media_obj_upload_ok(name));
-- Delete: only files of assets that were marked deleted by media_request_delete().
-- No UPDATE policy exists (no overwrite in place): a replacement is always a new asset.
create policy "site-media delete marked" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.media_obj_delete_ok(name));

-- ---------- Privileges -----------------------------------------------
revoke all on public.media_settings, public.media_assets, public.public_media from anon, authenticated;
grant select on public.media_settings, public.media_assets to authenticated;
grant select on public.public_media to anon, authenticated;

revoke all on function public.has_role(public.user_role[]), public.is_designer(), public.is_faculty(), public.can_design(),
  public.set_account_role(uuid, text), public.guard_profile_privileged_columns(), public.can_upload_purpose(public.media_purpose),
  public.media_begin_upload(text, text, text, text, bigint), public.media_finish_upload(uuid, int, int, int, int, text, text, text),
  public.media_update_meta(uuid, text, text, text, text[]), public.media_usage(uuid), public.media_request_delete(uuid),
  public.set_media_settings(bigint, bigint, bigint, bigint), public.media_storage_usage(), public.media_limits(),
  public.refresh_media_public(), public.media_object_asset(text), public.media_obj_is_public(text), public.media_obj_staff_read(text),
  public.media_obj_upload_ok(text), public.media_obj_delete_ok(text) from public, anon, authenticated;
grant execute on function public.has_role(public.user_role[]), public.is_designer(), public.is_faculty(), public.can_design(),
  public.can_upload_purpose(public.media_purpose), public.media_object_asset(text), public.media_obj_is_public(text), public.media_obj_staff_read(text),
  public.media_obj_upload_ok(text), public.media_obj_delete_ok(text) to anon, authenticated;
grant execute on function public.set_account_role(uuid, text), public.media_begin_upload(text, text, text, text, bigint),
  public.media_finish_upload(uuid, int, int, int, int, text, text, text), public.media_update_meta(uuid, text, text, text, text[]),
  public.media_usage(uuid), public.media_request_delete(uuid), public.set_media_settings(bigint, bigint, bigint, bigint),
  public.media_storage_usage() to authenticated;
grant execute on function public.media_limits() to authenticated;
-- set_account_status keeps its existing grant; re-assert because CREATE OR REPLACE preserves privileges but we are explicit:
revoke all on function public.set_account_status(uuid, text, text) from public, anon;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;
