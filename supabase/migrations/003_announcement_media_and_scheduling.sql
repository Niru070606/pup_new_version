-- =====================================================================
-- 003 - Announcements: cover + inline images, scheduled publication,
--       automatic expiry, related announcements, richer public views.
-- Run after 002. The Faculty -> Admin approval workflow is unchanged.
-- =====================================================================

-- ---------- Columns --------------------------------------------------
alter table public.announcement_revisions
  add column publish_at timestamptz,
  add column expires_at timestamptz,
  add constraint rev_schedule_order check (publish_at is null or expires_at is null or expires_at > publish_at);

-- When a NEW revision of an already-live announcement is approved with a future publish_at, it waits here.
-- The previously approved revision stays public until that moment.
alter table public.announcements add column next_revision_id uuid;

create table public.announcement_images (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.announcement_revisions (id) on delete cascade,
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  role text not null check (role in ('cover', 'inline')),
  position int not null default 0 check (position between 0 and 50),
  caption text check (char_length(caption) <= 300),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  created_at timestamptz not null default now()
);
create unique index announcement_images_one_cover on public.announcement_images (revision_id) where role = 'cover';
create index on public.announcement_images (revision_id, position);
create index on public.announcement_images (asset_id);

-- ---------- Which revision is public right now? ----------------------
create or replace function public.effective_revision_id(p_live uuid, p_next uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.id from public.announcement_revisions r where r.id = p_next and r.publish_at is not null and r.publish_at <= now()),
    p_live);
$$;

-- ---------- Media registry entries -----------------------------------
insert into public.media_ref_sources (key, label, any_sql, live_sql) values (
  'announcement_images', 'an announcement',
  $q$ select asset_id from public.announcement_images $q$,
  $q$ select ai.asset_id from public.announcement_images ai
        join public.announcement_revisions r on r.id = ai.revision_id
        join public.announcements a on a.id = r.announcement_id
       where a.status = 'published' and ai.revision_id in (a.live_revision_id, a.next_revision_id) $q$);

-- ---------- Save (draft / submit) ------------------------------------
-- p_images: null = leave images as they are; otherwise the complete list:
--   [{"asset_id": "...", "role": "cover"|"inline", "position": 0, "caption": "...", "alt_text": "..."}]
create or replace function public.write_announcement_images(p_rev uuid, p_images jsonb, p_require_alt boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_asset public.media_assets; v_n int := 0; v_covers int := 0;
  v_role text; v_alt text;
begin
  if jsonb_typeof(p_images) <> 'array' then raise exception 'Invalid image list.'; end if;
  if jsonb_array_length(p_images) > 13 then raise exception 'An announcement can have one cover image and up to 12 inline images.'; end if;
  delete from public.announcement_images where revision_id = p_rev;
  for v_item in select * from jsonb_array_elements(p_images) loop
    v_n := v_n + 1;
    v_role := v_item ->> 'role';
    if v_role not in ('cover', 'inline') then raise exception 'Invalid image role.'; end if;
    if v_role = 'cover' then v_covers := v_covers + 1; end if;
    if v_covers > 1 then raise exception 'Only one cover image is allowed.'; end if;
    select * into v_asset from public.media_assets where id = (v_item ->> 'asset_id')::uuid;
    if not found or v_asset.status <> 'ready' or v_asset.kind <> 'image' or v_asset.purpose <> 'announcement' then
      raise exception 'One of the images is not available. Upload it again.'; end if;
    if v_asset.owner_id <> auth.uid() and not public.is_admin() then raise exception 'You can only use images you uploaded.'; end if;
    v_alt := left(btrim(coalesce(v_item ->> 'alt_text', '')), 300);
    if p_require_alt and v_alt = '' then raise exception 'Describe every image (alt text) before submitting, so screen-reader users can understand it.'; end if;
    insert into public.announcement_images (revision_id, asset_id, role, position, caption, alt_text)
    values (p_rev, v_asset.id, v_role, coalesce((v_item ->> 'position')::int, v_n), nullif(left(btrim(coalesce(v_item ->> 'caption', '')), 300), ''), v_alt);
  end loop;
end $$;

drop function if exists public.save_announcement(uuid, text, text, text, text, boolean);
create or replace function public.save_announcement(
  p_id uuid, p_title text, p_body text, p_category text, p_office text, p_submit boolean,
  p_publish_at timestamptz default null, p_expires_at timestamptz default null, p_images jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ann public.announcements;
  v_rev public.announcement_revisions;
  v_prev uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_office text := btrim(coalesce(p_office, ''));
  v_cat text := nullif(btrim(coalesce(p_category, '')), '');
  v_rev_status public.revision_status := (case when p_submit then 'pending' else 'draft' end)::public.revision_status;
  v_ann_status public.announcement_status := (case when p_submit then 'pending' else 'draft' end)::public.announcement_status;
begin
  if not public.has_role(array['faculty', 'admin']::public.user_role[]) then raise exception 'Your account is not allowed to write announcements.'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then raise exception 'The title must be 3 to 200 characters.'; end if;
  if char_length(v_body) > 10000 then raise exception 'The content is too long (10,000 characters maximum).'; end if;
  if char_length(v_office) > 150 then raise exception 'The issuing office is too long.'; end if;
  if v_cat is not null and v_cat not in ('Official Notices', 'Academic Updates', 'Campus Events', 'Admissions', 'Student Activities') then
    raise exception 'Invalid category.'; end if;
  if p_publish_at is not null and p_expires_at is not null and p_expires_at <= p_publish_at then
    raise exception 'The expiry date must be after the publication date.'; end if;
  if p_submit then
    if char_length(v_body) < 10 then raise exception 'Write the announcement content before submitting.'; end if;
    if v_office = '' then raise exception 'The issuing office is required before submitting.'; end if;
    if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry date has already passed.'; end if;
  end if;

  if p_id is null then
    insert into public.announcements (author_id, status) values (v_uid, v_ann_status) returning * into v_ann;
    insert into public.announcement_revisions (announcement_id, version, title, body, category, issuing_office, status, submitted_at, publish_at, expires_at)
    values (v_ann.id, 1, v_title, v_body, v_cat, v_office, v_rev_status, case when p_submit then now() end, p_publish_at, p_expires_at) returning * into v_rev;
    if p_images is not null then perform public.write_announcement_images(v_rev.id, p_images, p_submit); end if;
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
      v_prev := v_rev.id;
      insert into public.announcement_revisions (announcement_id, version, title, body, category, issuing_office, status, submitted_at, publish_at, expires_at)
      values (p_id, v_rev.version + 1, v_title, v_body, v_cat, v_office, v_rev_status, case when p_submit then now() end, p_publish_at, p_expires_at) returning * into v_rev;
      if p_images is null then
        insert into public.announcement_images (revision_id, asset_id, role, position, caption, alt_text)
        select v_rev.id, asset_id, role, position, caption, alt_text from public.announcement_images where revision_id = v_prev;
      end if;
    else
      update public.announcement_revisions
         set title = v_title, body = v_body, category = v_cat, issuing_office = v_office, status = v_rev_status,
             submitted_at = case when p_submit then now() else submitted_at end,
             publish_at = p_publish_at, expires_at = p_expires_at
       where id = v_rev.id returning * into v_rev;
    end if;
    if p_images is not null then perform public.write_announcement_images(v_rev.id, p_images, p_submit); end if;

    if p_submit and exists (select 1 from public.announcement_images where revision_id = v_rev.id and alt_text = '') then
      raise exception 'Describe every image (alt text) before submitting.'; end if;

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

-- ---------- Review (approve / reject / request revision) -------------
create or replace function public.review_announcement(p_revision_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rev public.announcement_revisions;
  v_ann public.announcements;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_next_live boolean;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then raise exception 'Invalid decision.'; end if;
  if p_decision <> 'approved' and v_reason is null then raise exception 'A reason is required so the submitter knows what to fix.'; end if;

  select * into v_rev from public.announcement_revisions where id = p_revision_id for update;
  if not found then raise exception 'Submission not found.'; end if;
  if v_rev.status <> 'pending' then raise exception 'This submission is no longer pending.'; end if;
  select * into v_ann from public.announcements where id = v_rev.announcement_id for update;

  if p_decision = 'approved' and v_rev.expires_at is not null and v_rev.expires_at <= now() then
    raise exception 'This announcement has already expired. Ask the author to change the expiry date.'; end if;

  update public.announcement_revisions set status = p_decision::public.revision_status where id = v_rev.id;
  insert into public.announcement_reviews (revision_id, reviewer_id, decision, reason)
  values (v_rev.id, auth.uid(), p_decision::public.review_decision, v_reason);

  if p_decision = 'approved' then
    if v_ann.status in ('draft', 'pending', 'rejected', 'revision_required') then
      update public.announcements
         set status = 'published', live_revision_id = v_rev.id, next_revision_id = null,
             published_at = greatest(coalesce(v_rev.publish_at, now()), now())
       where id = v_ann.id;
      perform public.write_audit('announcement_approved', 'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title));
      perform public.write_audit('announcement_published', 'announcement', v_ann.id::text,
        jsonb_build_object('title', v_rev.title, 'scheduled_for', v_rev.publish_at));
    else
      -- Already published (or hidden by an admin): swap in the approved revision, keep the current status.
      select (v_ann.next_revision_id is not null and exists (
                select 1 from public.announcement_revisions n where n.id = v_ann.next_revision_id and n.publish_at <= now()))
        into v_next_live;
      if v_rev.publish_at is not null and v_rev.publish_at > now() then
        -- Scheduled: whatever is live now (including an earlier scheduled revision that already started) stays until then.
        update public.announcements
           set live_revision_id = case when v_next_live then v_ann.next_revision_id else live_revision_id end,
               next_revision_id = v_rev.id
         where id = v_ann.id;
      else
        update public.announcements set live_revision_id = v_rev.id, next_revision_id = null where id = v_ann.id;
      end if;
      perform public.write_audit('announcement_revision_approved', 'announcement', v_ann.id::text,
        jsonb_build_object('title', v_rev.title, 'version', v_rev.version, 'scheduled_for', v_rev.publish_at));
    end if;
  else
    if v_ann.status in ('draft', 'pending', 'rejected', 'revision_required') then
      update public.announcements set status = p_decision::public.announcement_status where id = v_ann.id;
    end if;
    perform public.write_audit(case when p_decision = 'rejected' then 'announcement_rejected' else 'announcement_revision_requested' end,
                               'announcement', v_ann.id::text, jsonb_build_object('title', v_rev.title, 'version', v_rev.version));
  end if;
  perform public.refresh_media_public();
end $$;

create or replace function public.set_announcement_status(p_id uuid, p_action text)
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
  perform public.refresh_media_public();
end $$;

-- ---------- Views ----------------------------------------------------
-- Public: published, already started, not yet expired. The previously approved revision stays visible while a new one
-- is pending (live_revision_id is only changed by approval). Existing columns keep their order; new ones are appended.
create or replace view public.public_announcements as
select a.id, r.title, r.body, r.category, r.issuing_office, a.published_at,
       p.full_name as author_name,
       r.expires_at,
       cm.id as cover_asset_id,
       ci.alt_text as cover_alt,
       ci.caption as cover_caption,
       cm.path_original as cover_path_original,
       cm.path_medium as cover_path_medium,
       cm.path_thumb as cover_path_thumb,
       cm.width as cover_width,
       cm.height as cover_height,
       cm.width_medium as cover_width_medium,
       cm.width_thumb as cover_width_thumb
from public.announcements a
join public.announcement_revisions r on r.id = public.effective_revision_id(a.live_revision_id, a.next_revision_id)
left join public.profiles p on p.id = a.author_id
left join public.announcement_images ci on ci.revision_id = r.id and ci.role = 'cover'
left join public.media_assets cm on cm.id = ci.asset_id and cm.is_public and cm.status = 'ready'
where a.status = 'published' and a.published_at <= now() and (r.expires_at is null or r.expires_at > now());

create view public.public_announcement_images as
select pa.id as announcement_id, ai.role, ai.position, ai.caption, ai.alt_text,
       m.id as asset_id, m.path_original, m.path_medium, m.path_thumb, m.width, m.height, m.width_medium, m.width_thumb
from public.public_announcements pa
join public.announcements a on a.id = pa.id
join public.announcement_images ai on ai.revision_id = public.effective_revision_id(a.live_revision_id, a.next_revision_id)
join public.media_assets m on m.id = ai.asset_id and m.is_public and m.status = 'ready';

create or replace view public.announcement_overview with (security_invoker = true) as
select a.id, a.status, a.author_id, p.full_name as author_name, p.department as author_department,
       a.published_at, a.created_at, a.updated_at,
       l.id as latest_revision_id, l.version as latest_version, l.status as latest_status,
       l.title, l.body, l.category, l.issuing_office, l.submitted_at,
       lr.title as live_title,
       l.publish_at, l.expires_at
from public.announcements a
join lateral (select r.* from public.announcement_revisions r where r.announcement_id = a.id order by r.version desc limit 1) l on true
left join public.announcement_revisions lr on lr.id = a.live_revision_id
left join public.profiles p on p.id = a.author_id;

-- Related announcements: same category first, then newest.
create or replace function public.get_related_announcements(p_id uuid, p_limit int default 3)
returns setof public.public_announcements language sql stable set search_path = public as $$
  select pa.* from public.public_announcements pa
  where pa.id <> p_id
  order by (pa.category is not distinct from (select c.category from public.public_announcements c where c.id = p_id)) desc, pa.published_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 12);
$$;

-- ---------- RLS ------------------------------------------------------
alter table public.announcement_images enable row level security;
create policy announcement_images_select on public.announcement_images for select to authenticated using (
  public.is_admin() or exists (select 1 from public.announcement_revisions r where r.id = revision_id and public.owns_announcement(r.announcement_id)));

-- ---------- Privileges -----------------------------------------------
revoke all on public.announcement_images, public.public_announcement_images from anon, authenticated;
grant select on public.announcement_images to authenticated;
grant select on public.public_announcement_images to anon, authenticated;
grant select on public.public_announcements to anon, authenticated;
grant select on public.announcement_overview to authenticated;

revoke all on function public.effective_revision_id(uuid, uuid), public.write_announcement_images(uuid, jsonb, boolean),
  public.save_announcement(uuid, text, text, text, text, boolean, timestamptz, timestamptz, jsonb),
  public.review_announcement(uuid, text, text), public.set_announcement_status(uuid, text),
  public.get_related_announcements(uuid, int) from public, anon, authenticated;
grant execute on function public.save_announcement(uuid, text, text, text, text, boolean, timestamptz, timestamptz, jsonb),
  public.review_announcement(uuid, text, text), public.set_announcement_status(uuid, text) to authenticated;
grant execute on function public.get_related_announcements(uuid, int) to anon, authenticated;
-- Views call this function with the CALLER's privileges (PostgreSQL checks function rights as the invoker), so the public views need it executable.
-- It only returns an id and reads nothing the views do not already expose.
grant execute on function public.effective_revision_id(uuid, uuid) to anon, authenticated;
