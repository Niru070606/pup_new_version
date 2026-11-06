-- =====================================================================
-- PUP Unisan Campus Website - Supabase schema, security and workflow
-- Run ONCE in Supabase > SQL Editor on a new project.
-- All permission rules live here (Row Level Security + RPC functions),
-- so they are enforced on the server no matter what the frontend does.
-- =====================================================================

-- ---------- Types ----------------------------------------------------
create type public.user_role as enum ('faculty', 'admin');
create type public.account_status as enum ('pending_approval', 'approved', 'rejected', 'suspended', 'deactivated');
create type public.announcement_status as enum ('draft', 'pending', 'published', 'rejected', 'revision_required', 'unpublished', 'archived');
create type public.revision_status as enum ('draft', 'pending', 'approved', 'rejected', 'revision_required');
create type public.review_decision as enum ('approved', 'rejected', 'revision_required');

-- ---------- Tables ---------------------------------------------------
-- "Pending email verification" is derived from auth.users.email_confirmed_at.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  department text not null default '' check (char_length(department) <= 120),
  role public.user_role not null default 'faculty',
  status public.account_status not null default 'pending_approval',
  status_reason text check (char_length(status_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faculty_directory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  job_title text check (char_length(job_title) <= 120),
  department text check (char_length(department) <= 120),
  public_email text check (public_email is null or public_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_public boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 2000),
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editable institutional content. Values start EMPTY on purpose: nothing official is invented.
create table public.campus_content (
  key text primary key,
  grp text not null,
  label text not null,
  kind text not null default 'longtext' check (kind in ('text', 'longtext', 'url', 'toggle')),
  value text not null default '' check (char_length(value) <= 5000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (kind <> 'url' or value = '' or value like 'https://%'),
  check (key <> 'map_embed_url' or value = '' or value like 'https://www.google.com/maps/embed%')
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text check (char_length(subject) <= 200),
  message text not null check (char_length(message) between 10 and 3000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete restrict,
  status public.announcement_status not null default 'draft',
  -- Public content comes from this revision. Deliberately NOT a foreign key (keeps API relationships unambiguous);
  -- it is only ever set by review_announcement().
  live_revision_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (published_at is not null and live_revision_id is not null))
);

create table public.announcement_revisions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  version int not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 10000),
  category text check (category in ('Official Notices', 'Academic Updates', 'Campus Events', 'Admissions', 'Student Activities')),
  issuing_office text not null default '' check (char_length(issuing_office) <= 150),
  status public.revision_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, version)
);

create table public.announcement_reviews (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.announcement_revisions (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision public.review_decision not null,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  check (decision = 'approved' or char_length(btrim(coalesce(reason, ''))) > 0)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.profiles (status);
create index on public.faculty_directory (display_order, full_name);
create index on public.announcements (status, published_at desc);
create index on public.announcement_revisions (announcement_id, version desc);
create index on public.announcement_revisions (status);
create index on public.announcement_reviews (revision_id);
create index on public.audit_logs (created_at desc);

-- ---------- Seed content keys (values intentionally blank) -----------
insert into public.campus_content (key, grp, label, kind, value) values
  ('welcome_message',      'home',     'Homepage welcome message', 'longtext', ''),
  ('about_intro',          'about',    'Campus introduction', 'longtext', ''),
  ('history',              'about',    'Campus history', 'longtext', ''),
  ('vision',               'about',    'Vision', 'longtext', ''),
  ('mission',              'about',    'Mission', 'longtext', ''),
  ('contact_address',      'contact',  'Campus address', 'text', ''),
  ('contact_phone',        'contact',  'Phone number', 'text', ''),
  ('contact_email',        'contact',  'Public contact email', 'text', ''),
  ('contact_hours',        'contact',  'Office hours', 'text', ''),
  ('map_embed_url',        'contact',  'Google Maps embed link (must start with https://www.google.com/maps/embed)', 'url', ''),
  ('admissions_url',       'links',    'Admissions information link (optional, https://...)', 'url', ''),
  ('academic_calendar_url','links',    'Academic calendar link (optional, https://...)', 'url', ''),
  ('contact_form_enabled', 'settings', 'Contact form', 'toggle', 'true'),
  ('site_notice',          'settings', 'Site-wide notice banner (optional, leave blank to hide)', 'text', '');

-- ---------- Generic triggers -----------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.faculty_directory for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.academic_programs for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.announcements for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.announcement_revisions for each row execute function public.touch_updated_at();

create function public.content_before_update() returns trigger language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
create trigger trg_content_before before update on public.campus_content for each row execute function public.content_before_update();

-- ---------- Authorization helpers ------------------------------------
-- Active = approved by an administrator AND email verified. Checked on every request,
-- so suspended/deactivated accounts lose access immediately.
create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.status = 'approved' and u.email_confirmed_at is not null);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved' and u.email_confirmed_at is not null);
$$;

create function public.owns_announcement(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user()
     and exists (select 1 from public.announcements a where a.id = p_id and a.author_id = auth.uid());
$$;

-- ---------- Audit log ------------------------------------------------
-- Only callable from other server-side functions/triggers (execute is revoked from API roles below).
create function public.write_audit(p_action text, p_type text, p_id text, p_details jsonb default '{}'::jsonb, p_actor uuid default auth.uid())
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, details)
  values (p_actor, p_action, p_type, p_id, coalesce(p_details, '{}'::jsonb));
$$;

create function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit(
    tg_argv[0] || '_' || lower(tg_op), tg_argv[0], coalesce(new.id::text, old.id::text),
    jsonb_build_object('name', coalesce(to_jsonb(new)->>'full_name', to_jsonb(new)->>'name', to_jsonb(old)->>'full_name', to_jsonb(old)->>'name')));
  return coalesce(new, old);
end $$;
create trigger trg_audit after insert or update or delete on public.faculty_directory for each row execute function public.audit_row_change('faculty_directory');
create trigger trg_audit after insert or update or delete on public.academic_programs for each row execute function public.audit_row_change('academic_program');

create function public.content_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit(case when new.grp = 'settings' then 'setting_updated' else 'content_updated' end, 'campus_content', new.key, jsonb_build_object('key', new.key));
  return new;
end $$;
create trigger trg_content_audit after update on public.campus_content for each row execute function public.content_audit();

-- ---------- Registration and email verification ----------------------
-- Role is ALWAYS 'faculty' and status ALWAYS 'pending_approval' on sign-up; metadata cannot change that.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, department)
  values (new.id, new.email,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
          left(coalesce(new.raw_user_meta_data ->> 'department', ''), 120));
  perform public.write_audit('account_registered', 'user', new.id::text, '{}'::jsonb, new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.handle_email_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit('email_verified', 'user', new.id::text, '{}'::jsonb, new.id);
  return new;
end $$;
create trigger on_auth_user_verified after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_email_verified();

-- ---------- Views ----------------------------------------------------
-- The ONLY thing the public can read about announcements: published, live content, no personal data.
-- (Runs with the view owner's rights on purpose; it exposes nothing else.)
create view public.public_announcements as
select a.id, r.title, r.body, r.category, r.issuing_office, a.published_at
from public.announcements a
join public.announcement_revisions r on r.id = a.live_revision_id
where a.status = 'published';

-- Dashboard listing. security_invoker = true, so Row Level Security of the caller applies
-- (faculty see only their own rows, admins see all).
create view public.announcement_overview with (security_invoker = true) as
select a.id, a.status, a.author_id, p.full_name as author_name, p.department as author_department,
       a.published_at, a.created_at, a.updated_at,
       l.id as latest_revision_id, l.version as latest_version, l.status as latest_status,
       l.title, l.body, l.category, l.issuing_office, l.submitted_at,
       lr.title as live_title
from public.announcements a
join lateral (select r.* from public.announcement_revisions r where r.announcement_id = a.id order by r.version desc limit 1) l on true
left join public.announcement_revisions lr on lr.id = a.live_revision_id
left join public.profiles p on p.id = a.author_id;

-- ---------- Workflow functions (the only way to change announcements/accounts) ----
create function public.save_announcement(p_id uuid, p_title text, p_body text, p_category text, p_office text, p_submit boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ann public.announcements;
  v_rev public.announcement_revisions;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_office text := btrim(coalesce(p_office, ''));
  v_cat text := nullif(btrim(coalesce(p_category, '')), '');
  v_rev_status public.revision_status := (case when p_submit then 'pending' else 'draft' end)::public.revision_status;
  v_ann_status public.announcement_status := (case when p_submit then 'pending' else 'draft' end)::public.announcement_status;
begin
  if not public.is_active_user() then raise exception 'Your account is not active.'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then raise exception 'The title must be 3 to 200 characters.'; end if;
  if char_length(v_body) > 10000 then raise exception 'The content is too long (10,000 characters maximum).'; end if;
  if char_length(v_office) > 150 then raise exception 'The issuing office is too long.'; end if;
  if v_cat is not null and v_cat not in ('Official Notices', 'Academic Updates', 'Campus Events', 'Admissions', 'Student Activities') then
    raise exception 'Invalid category.'; end if;
  if p_submit then
    if char_length(v_body) < 10 then raise exception 'Write the announcement content before submitting.'; end if;
    if v_office = '' then raise exception 'The issuing office is required before submitting.'; end if;
  end if;

  if p_id is null then
    insert into public.announcements (author_id, status) values (v_uid, v_ann_status) returning * into v_ann;
    insert into public.announcement_revisions (announcement_id, version, title, body, category, issuing_office, status, submitted_at)
    values (v_ann.id, 1, v_title, v_body, v_cat, v_office, v_rev_status, case when p_submit then now() end) returning * into v_rev;
    if p_submit then
      perform public.write_audit('announcement_submitted', 'announcement', v_ann.id::text, jsonb_build_object('title', v_title));
    end if;
  else
    select * into v_ann from public.announcements where id = p_id for update;
    if not found then raise exception 'Announcement not found.'; end if;
    if v_ann.author_id <> v_uid and not public.is_admin() then raise exception 'You can only edit your own announcements.'; end if;
    if v_ann.status in ('unpublished', 'archived') then raise exception 'This announcement is not editable.'; end if;

    select * into v_rev from public.announcement_revisions where announcement_id = p_id order by version desc limit 1 for update;
    if v_rev.status = 'pending' then raise exception 'This announcement is awaiting review and cannot be edited.'; end if;

    if v_rev.status = 'approved' then
      -- Editing live content: create a NEW revision. The public keeps seeing the approved version until re-approval.
      insert into public.announcement_revisions (announcement_id, version, title, body, category, issuing_office, status, submitted_at)
      values (p_id, v_rev.version + 1, v_title, v_body, v_cat, v_office, v_rev_status, case when p_submit then now() end) returning * into v_rev;
    else
      update public.announcement_revisions
         set title = v_title, body = v_body, category = v_cat, issuing_office = v_office, status = v_rev_status,
             submitted_at = case when p_submit then now() else submitted_at end
       where id = v_rev.id returning * into v_rev;
    end if;

    if v_ann.status <> 'published' then
      update public.announcements set status = v_ann_status where id = p_id;
    end if;
    if p_submit then
      perform public.write_audit(case when v_rev.version > 1 then 'announcement_revision_submitted' else 'announcement_submitted' end,
                                 'announcement', p_id::text, jsonb_build_object('title', v_title, 'version', v_rev.version));
    end if;
  end if;
  return coalesce(p_id, v_ann.id);
end $$;

create function public.review_announcement(p_revision_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rev public.announcement_revisions;
  v_ann public.announcements;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then raise exception 'Invalid decision.'; end if;
  if p_decision <> 'approved' and v_reason is null then raise exception 'A reason is required so the submitter knows what to fix.'; end if;

  select * into v_rev from public.announcement_revisions where id = p_revision_id for update;
  if not found then raise exception 'Submission not found.'; end if;
  if v_rev.status <> 'pending' then raise exception 'This submission is no longer pending.'; end if;
  select * into v_ann from public.announcements where id = v_rev.announcement_id for update;

  update public.announcement_revisions set status = p_decision::public.revision_status where id = v_rev.id;
  insert into public.announcement_reviews (revision_id, reviewer_id, decision, reason)
  values (v_rev.id, auth.uid(), p_decision::public.review_decision, v_reason);

  if p_decision = 'approved' then
    if v_ann.status in ('draft', 'pending', 'rejected', 'revision_required') then
      update public.announcements set status = 'published', live_revision_id = v_rev.id, published_at = now() where id = v_ann.id;
      perform public.write_audit('announcement_approved', 'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title));
      perform public.write_audit('announcement_published', 'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title));
    else
      -- Already published (or hidden by an admin): swap in the approved revision, keep the current status.
      update public.announcements set live_revision_id = v_rev.id where id = v_ann.id;
      perform public.write_audit('announcement_revision_approved', 'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title, 'version', v_rev.version));
    end if;
  else
    if v_ann.status in ('draft', 'pending', 'rejected', 'revision_required') then
      update public.announcements set status = p_decision::public.announcement_status where id = v_ann.id;
    end if;
    perform public.write_audit(case when p_decision = 'rejected' then 'announcement_rejected' else 'announcement_revision_requested' end,
                               'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title, 'version', v_rev.version));
  end if;
end $$;

create function public.set_announcement_status(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ann public.announcements;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_ann from public.announcements where id = p_id for update;
  if not found then raise exception 'Announcement not found.'; end if;

  if p_action = 'unpublish' and v_ann.status = 'published' then
    update public.announcements set status = 'unpublished' where id = p_id;
    perform public.write_audit('announcement_unpublished', 'announcement', p_id::text);
  elsif p_action = 'archive' and v_ann.status in ('published', 'unpublished') then
    update public.announcements set status = 'archived' where id = p_id;
    perform public.write_audit('announcement_archived', 'announcement', p_id::text);
  elsif p_action = 'republish' and v_ann.status = 'unpublished' then
    update public.announcements set status = 'published', published_at = now() where id = p_id;
    perform public.write_audit('announcement_published', 'announcement', p_id::text, jsonb_build_object('republished', true));
  else
    raise exception 'That change is not allowed for the current status.';
  end if;
end $$;

create function public.set_account_status(p_user_id uuid, p_status text, p_reason text)
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

  update public.profiles
     set status = p_status::public.account_status,
         status_reason = case when p_status = 'approved' then null else v_reason end
   where id = p_user_id;
  perform public.write_audit('account_' || p_status, 'user', p_user_id::text, jsonb_build_object('email', v_target.email));
end $$;

create function public.admin_list_users()
returns table (id uuid, email text, full_name text, department text, role public.user_role, status public.account_status,
               status_reason text, email_confirmed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  return query
    select p.id, p.email, p.full_name, p.department, p.role, p.status, p.status_reason, u.email_confirmed_at, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

create function public.admin_overview_counts() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  return jsonb_build_object(
    'pending_registrations', (select count(*) from public.profiles p join auth.users u on u.id = p.id
                              where p.status = 'pending_approval' and u.email_confirmed_at is not null),
    'pending_announcements', (select count(*) from public.announcement_revisions where status = 'pending'),
    'unread_messages', (select count(*) from public.contact_messages where not is_read));
end $$;

-- ---------- Row Level Security ---------------------------------------
alter table public.profiles enable row level security;
alter table public.faculty_directory enable row level security;
alter table public.academic_programs enable row level security;
alter table public.campus_content enable row level security;
alter table public.contact_messages enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_revisions enable row level security;
alter table public.announcement_reviews enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_user()) with check (id = auth.uid());

create policy directory_select on public.faculty_directory for select to anon, authenticated
  using (is_public or public.is_admin());
create policy directory_admin on public.faculty_directory for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy programs_select on public.academic_programs for select to anon, authenticated
  using (is_published or public.is_admin());
create policy programs_admin on public.academic_programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy content_select on public.campus_content for select to anon, authenticated using (true);
create policy content_update on public.campus_content for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy messages_insert on public.contact_messages for insert to anon, authenticated with check (is_read = false);
create policy messages_admin_select on public.contact_messages for select to authenticated using (public.is_admin());
create policy messages_admin_update on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy messages_admin_delete on public.contact_messages for delete to authenticated using (public.is_admin());

create policy announcements_select on public.announcements for select to authenticated
  using (public.is_admin() or public.owns_announcement(id));
create policy revisions_select on public.announcement_revisions for select to authenticated
  using (public.is_admin() or public.owns_announcement(announcement_id));
create policy reviews_select on public.announcement_reviews for select to authenticated
  using (public.is_admin() or exists (select 1 from public.announcement_revisions r where r.id = revision_id and public.owns_announcement(r.announcement_id)));
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
-- No insert/update/delete policies exist for announcements, revisions, reviews or audit_logs:
-- they can only be changed by the functions above, and audit records can never be edited or deleted via the API.

-- ---------- Privileges (least privilege) -----------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, department) on public.profiles to authenticated;   -- role/status can never be edited by users
grant select on public.faculty_directory, public.academic_programs, public.campus_content to anon, authenticated;
grant insert, update, delete on public.faculty_directory, public.academic_programs to authenticated;
grant update (value) on public.campus_content to authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (is_read) on public.contact_messages to authenticated;
grant select on public.announcements, public.announcement_revisions, public.announcement_reviews, public.audit_logs to authenticated;
grant select on public.public_announcements to anon, authenticated;
grant select on public.announcement_overview to authenticated;

grant execute on function public.is_admin(), public.is_active_user() to anon, authenticated;
grant execute on function public.owns_announcement(uuid) to authenticated;
grant execute on function public.save_announcement(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.review_announcement(uuid, text, text) to authenticated;
grant execute on function public.set_announcement_status(uuid, text) to authenticated;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_overview_counts() to authenticated;

-- ---------- First administrator --------------------------------------
-- Admins can never be created through the website. After you register your own account and verify
-- your email, run this ONE line in the SQL Editor (replace the email):
--   update public.profiles set role = 'admin', status = 'approved' where email = 'you@example.com';
