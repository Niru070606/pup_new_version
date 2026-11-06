-- =====================================================================
-- 005 - Faculty & staff directory: structured sections, photos, private
--       employment data kept apart from public fields, consent flags.
-- Run after 004.
-- =====================================================================

-- ---------- Public-facing columns (extend the existing table) --------
alter table public.faculty_directory
  add column section text not null default 'teaching' check (section in ('administration', 'teaching', 'non_teaching')),
  add column program_id uuid references public.academic_programs (id) on delete set null,
  add column is_director boolean not null default false,
  add column photo_asset_id uuid references public.media_assets (id) on delete set null,
  add column photo_approved boolean not null default false,
  add column public_phone text check (public_phone is null or public_phone ~ '^[0-9 +().-]{5,40}$'),
  -- Written permission recorded by an administrator. Nothing personal is shown publicly without it.
  add column consent_contact boolean not null default false,
  add column consent_birthday boolean not null default false,
  add column consent_retirement boolean not null default false,
  add column consent_by uuid references public.profiles (id) on delete set null,
  add column consent_at timestamptz,
  -- Employment dates were checked against official records by an administrator.
  add column employment_verified boolean not null default false,
  add column verified_by uuid references public.profiles (id) on delete set null,
  add column verified_at timestamptz;
create unique index faculty_directory_one_director on public.faculty_directory (is_director) where is_director;
create index on public.faculty_directory (section, display_order);
create index on public.faculty_directory (program_id);

-- Records that existed before this upgrade already carried an administrator-approved public email.
update public.faculty_directory set consent_contact = true, consent_at = now() where public_email is not null;

create or replace function public.directory_consent_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.consent_contact or new.consent_birthday or new.consent_retirement) and
     (tg_op = 'INSERT' or new.consent_contact is distinct from old.consent_contact or new.consent_birthday is distinct from old.consent_birthday
      or new.consent_retirement is distinct from old.consent_retirement or old.consent_at is null) then
    new.consent_by := auth.uid(); new.consent_at := now();
  elsif not (new.consent_contact or new.consent_birthday or new.consent_retirement) then
    new.consent_by := null; new.consent_at := null;
  end if;
  if new.employment_verified and (tg_op = 'INSERT' or not old.employment_verified) then new.verified_by := auth.uid(); new.verified_at := now();
  elsif not new.employment_verified then new.verified_by := null; new.verified_at := null; end if;
  if new.section <> 'teaching' then new.program_id := null; end if;
  if new.is_director then new.section := 'administration'; end if;
  return new;
end $$;
create trigger trg_directory_consent before insert or update on public.faculty_directory for each row execute function public.directory_consent_stamp();

-- ---------- Private employment information (administrators only) ----
create table public.personnel_private (
  directory_id uuid primary key references public.faculty_directory (id) on delete cascade,
  date_joined date check (date_joined is null or (date_joined >= date '1950-01-01' and date_joined <= current_date + 366)),
  birthday date check (birthday is null or (birthday >= date '1920-01-01' and birthday <= current_date - 6000)),
  retirement_date date check (retirement_date is null or retirement_date >= date '1950-01-01'),
  employment_status text check (employment_status is null or employment_status in ('permanent', 'temporary', 'contractual', 'part_time', 'job_order', 'on_leave', 'retired', 'resigned')),
  personal_phone text check (char_length(personal_phone) <= 40),
  personal_email text check (personal_email is null or personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes text check (char_length(notes) <= 1000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (retirement_date is null or date_joined is null or retirement_date >= date_joined)
);
create or replace function public.personnel_private_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid(); new.updated_at := now();
  perform public.write_audit('personnel_private_' || lower(tg_op), 'personnel', new.directory_id::text);   -- no personal values in the log
  return new;
end $$;
create trigger trg_personnel_private_audit before insert or update on public.personnel_private for each row execute function public.personnel_private_audit();

-- ---------- Media registry -------------------------------------------
insert into public.media_ref_sources (key, label, any_sql, live_sql) values (
  'personnel_photos', 'a directory profile',
  $q$ select photo_asset_id from public.faculty_directory where photo_asset_id is not null $q$,
  $q$ select photo_asset_id from public.faculty_directory where photo_asset_id is not null and photo_approved and is_public $q$);

create or replace function public.refresh_directory_media() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.refresh_media_public(); return null; end $$;
create trigger trg_directory_media after insert or update of photo_asset_id, photo_approved, is_public or delete on public.faculty_directory
  for each statement execute function public.refresh_directory_media();

-- ---------- Public view: only approved, consented, derived fields ----
-- Birthdays: month and day only, only with consent. Retirement date and status: only with consent.
-- Years of service and the "new member" flag: only when an administrator verified the employment dates.
create view public.public_directory as
select d.id, d.full_name, d.job_title, d.department, d.section, d.is_director, d.display_order,
       d.program_id, ap.name as program_name,
       case when d.photo_approved and pm.is_public and pm.status = 'ready' then pm.id end as photo_asset_id,
       case when d.photo_approved and pm.is_public and pm.status = 'ready' then pm.path_medium end as photo_path_medium,
       case when d.photo_approved and pm.is_public and pm.status = 'ready' then pm.path_thumb end as photo_path_thumb,
       case when d.consent_contact then d.public_email end as public_email,
       case when d.consent_contact then d.public_phone end as public_phone,
       case when d.consent_birthday then extract(month from pp.birthday)::int end as birth_month,
       case when d.consent_birthday then extract(day from pp.birthday)::int end as birth_day,
       case when d.consent_retirement then pp.retirement_date end as retirement_date,
       case when d.consent_retirement then pp.employment_status end as employment_status,
       case when d.employment_verified and pp.date_joined is not null then extract(year from age(current_date, pp.date_joined))::int end as years_of_service,
       (d.employment_verified and pp.date_joined is not null and pp.date_joined > (current_date - interval '3 months')::date and pp.date_joined <= current_date) as is_new_member
from public.faculty_directory d
left join public.personnel_private pp on pp.directory_id = d.id
left join public.academic_programs ap on ap.id = d.program_id and ap.is_published
left join public.media_assets pm on pm.id = d.photo_asset_id
where d.is_public;

-- ---------- RLS ------------------------------------------------------
-- The base table is now administrator-only. Visitors and other roles use public_directory.
drop policy directory_select on public.faculty_directory;
create policy directory_select on public.faculty_directory for select to authenticated using (public.is_admin());
alter table public.personnel_private enable row level security;
create policy personnel_private_admin on public.personnel_private for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Privileges -----------------------------------------------
revoke all on public.faculty_directory from anon;
revoke all on public.personnel_private, public.public_directory from anon, authenticated;
grant select, insert, update, delete on public.personnel_private to authenticated;
grant select on public.public_directory to anon, authenticated;
revoke all on function public.directory_consent_stamp(), public.personnel_private_audit(), public.refresh_directory_media() from public, anon, authenticated;
