-- =====================================================================
-- 006 - Events calendar, Forms & Document Center, aggregate analytics,
--       content version history + restore, global search.
-- Run after 005.
-- =====================================================================

-- audit_row_change now also understands records named by "title".
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit(
    tg_argv[0] || '_' || lower(tg_op), tg_argv[0], coalesce(new.id::text, old.id::text),
    jsonb_build_object('name', coalesce(to_jsonb(new)->>'full_name', to_jsonb(new)->>'name', to_jsonb(new)->>'title',
                                        to_jsonb(old)->>'full_name', to_jsonb(old)->>'name', to_jsonb(old)->>'title')));
  return coalesce(new, old);
end $$;

-- ======================= EVENTS ======================================
create table public.campus_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  location text check (char_length(location) <= 200),
  category text check (char_length(category) <= 60),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  cover_asset_id uuid references public.media_assets (id) on delete set null,
  cover_alt text check (char_length(cover_alt) <= 300),
  is_published boolean not null default false,
  publish_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index on public.campus_events (starts_at);
create trigger trg_touch before update on public.campus_events for each row execute function public.touch_updated_at();
create trigger trg_audit after insert or update or delete on public.campus_events for each row execute function public.audit_row_change('event');

-- ======================= DOCUMENT CENTER =============================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 1000),
  category text not null default 'Forms' check (category in ('Forms', 'Guides', 'Downloads', 'Policies')),
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  display_order int not null default 0,
  is_published boolean not null default false,
  publish_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.documents (category, display_order);
create trigger trg_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger trg_audit after insert or update or delete on public.documents for each row execute function public.audit_row_change('document');
create or replace function public.documents_asset_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.media_assets m where m.id = new.asset_id and m.kind = 'document' and m.status = 'ready') then
    raise exception 'Choose an uploaded document file.'; end if;
  return new;
end $$;
create trigger trg_documents_asset before insert or update of asset_id on public.documents for each row execute function public.documents_asset_check();

-- ---------- Media registry + automatic public flag refresh -----------
insert into public.media_ref_sources (key, label, any_sql, live_sql) values
 ('event_covers', 'an event', $q$ select cover_asset_id from public.campus_events where cover_asset_id is not null $q$,
                              $q$ select cover_asset_id from public.campus_events where cover_asset_id is not null and is_published $q$),
 ('documents', 'the Document Center', $q$ select asset_id from public.documents $q$,
                                      $q$ select asset_id from public.documents where is_published $q$);
create or replace function public.refresh_media_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.refresh_media_public(); return null; end $$;
create trigger trg_events_media after insert or update or delete on public.campus_events for each statement execute function public.refresh_media_trigger();
create trigger trg_documents_media after insert or update or delete on public.documents for each statement execute function public.refresh_media_trigger();

-- ---------- Public views ---------------------------------------------
create view public.public_events as
select e.id, e.title, e.description, e.location, e.category, e.starts_at, e.ends_at, e.all_day,
       case when m.is_public and m.status = 'ready' then m.id end as cover_asset_id, e.cover_alt,
       case when m.is_public and m.status = 'ready' then m.path_medium end as cover_path_medium,
       case when m.is_public and m.status = 'ready' then m.path_thumb end as cover_path_thumb,
       case when m.is_public and m.status = 'ready' then m.width_medium end as cover_width_medium
from public.campus_events e left join public.media_assets m on m.id = e.cover_asset_id
where e.is_published and (e.publish_at is null or e.publish_at <= now());

create view public.public_documents as
select d.id, d.title, d.description, d.category, d.display_order, d.created_at,
       m.id as asset_id, m.path_original, m.size_bytes, m.mime_type, m.original_filename
from public.documents d join public.media_assets m on m.id = d.asset_id and m.is_public and m.status = 'ready'
where d.is_published and (d.publish_at is null or d.publish_at <= now());

-- ======================= ANALYTICS (aggregate only) ==================
-- Stores counts per day and page. No IP address, user id, cookie, user agent or referrer is ever stored.
create table public.page_view_daily (
  day date not null default current_date,
  path text not null check (char_length(path) <= 80),
  title text,
  views int not null default 0,
  primary key (day, path)
);

create or replace function public.record_page_view(p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare v_path text := left(coalesce(p_path, ''), 80); v_title text; v_id uuid;
begin
  if v_path = '' then v_path := '/'; end if;
  if v_path !~ '^/((about|academics|faculty|announcements|contact|events|documents|links|search)?|(announcements|events)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then return; end if;
  if v_path ~ '^/announcements/' then
    v_id := substring(v_path from 16)::uuid;
    select title into v_title from public.public_announcements where id = v_id;
    if v_title is null then return; end if;     -- only count pages that are really public
  elsif v_path ~ '^/events/' then
    v_id := substring(v_path from 9)::uuid;
    select title into v_title from public.public_events where id = v_id;
    if v_title is null then return; end if;
  else
    v_title := case v_path when '/' then 'Home' when '/about' then 'About' when '/academics' then 'Academic programs' when '/faculty' then 'Faculty & staff'
      when '/announcements' then 'Announcements' when '/contact' then 'Contact' when '/events' then 'Events calendar' when '/documents' then 'Forms & documents'
      when '/links' then 'Links directory' when '/search' then 'Search' end;
  end if;
  insert into public.page_view_daily (day, path, title, views) values (current_date, v_path, v_title, 1)
  on conflict (day, path) do update set views = public.page_view_daily.views + 1, title = excluded.title;
end $$;

create or replace function public.admin_analytics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  return jsonb_build_object(
    'days', v_days,
    'total', (select coalesce(sum(views), 0) from public.page_view_daily where day > current_date - v_days),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'views', v) order by d) from (
        select g::date as d, coalesce((select sum(views) from public.page_view_daily x where x.day = g::date), 0) as v
        from generate_series(current_date - (v_days - 1), current_date, interval '1 day') g) s), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'title', title, 'views', v) order by v desc) from (
        select path, max(title) as title, sum(views) as v from public.page_view_daily where day > current_date - v_days group by path order by v desc limit 15) t), '[]'::jsonb),
    'top_announcements', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'title', title, 'views', v) order by v desc) from (
        select path, max(title) as title, sum(views) as v from public.page_view_daily where day > current_date - v_days and path like '/announcements/%' group by path order by v desc limit 10) t), '[]'::jsonb));
end $$;

-- ======================= CONTENT HISTORY =============================
create table public.campus_content_history (
  id bigint generated always as identity primary key,
  key text not null references public.campus_content (key) on delete cascade,
  old_value text not null,
  new_value text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.campus_content_history (key, changed_at desc);
create or replace function public.content_history_record() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.value is distinct from new.value then
    insert into public.campus_content_history (key, old_value, new_value, changed_by) values (new.key, old.value, new.value, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_content_history after update on public.campus_content for each row execute function public.content_history_record();

create or replace function public.restore_content_value(p_history_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_h public.campus_content_history;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_h from public.campus_content_history where id = p_history_id;
  if not found then raise exception 'History entry not found.'; end if;
  update public.campus_content set value = v_h.old_value where key = v_h.key;   -- creates its own history entry and audit record
  perform public.write_audit('content_restored', 'campus_content', v_h.key, jsonb_build_object('key', v_h.key));
end $$;

-- ======================= GLOBAL SEARCH ===============================
create or replace function public.global_search(p_q text, p_limit int default 30)
returns table (kind text, id text, title text, snippet text, path text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := btrim(coalesce(p_q, '')); v_pat text; v_lim int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if char_length(v_q) < 2 or char_length(v_q) > 80 then return; end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select * from (
    select 'announcement'::text, a.id::text, a.title, left(a.body, 160), '/announcements/' || a.id::text,
           (case when a.title ilike v_pat then 1.0 else 0.5 end)::real
      from public.public_announcements a where a.title ilike v_pat or a.body ilike v_pat or a.issuing_office ilike v_pat
    union all
    select 'program', p.id::text, p.name, left(coalesce(p.description, ''), 160), '/academics', (case when p.name ilike v_pat then 0.9 else 0.4 end)::real
      from public.academic_programs p where p.is_published and (p.name ilike v_pat or p.description ilike v_pat)
    union all
    select 'person', d.id::text, d.full_name, concat_ws(' · ', d.job_title, d.department, d.program_name), '/faculty?q=' || replace(d.full_name, ' ', '+'), (case when d.full_name ilike v_pat then 0.9 else 0.4 end)::real
      from public.public_directory d where d.full_name ilike v_pat or d.job_title ilike v_pat or d.department ilike v_pat or d.program_name ilike v_pat
    union all
    select 'event', e.id::text, e.title, left(coalesce(e.description, ''), 160), '/events/' || e.id::text, (case when e.title ilike v_pat then 0.8 else 0.4 end)::real
      from public.public_events e where e.title ilike v_pat or e.description ilike v_pat or e.location ilike v_pat
    union all
    select 'document', d.id::text, d.title, left(coalesce(d.description, ''), 160), '/documents?q=' || replace(d.title, ' ', '+'), (case when d.title ilike v_pat then 0.8 else 0.4 end)::real
      from public.public_documents d where d.title ilike v_pat or d.description ilike v_pat
    union all
    select 'link', l ->> 'id', l ->> 'title', left(coalesce(l ->> 'description', l ->> 'url'), 160), '/links?q=' || replace(l ->> 'title', ' ', '+'), (case when (l ->> 'title') ilike v_pat then 0.7 else 0.3 end)::real
      from (select jsonb_array_elements(g -> 'links') l from jsonb_array_elements(coalesce(public.get_live_links() -> 'groups', '[]'::jsonb)) g) x
      where (l ->> 'title') ilike v_pat or (l ->> 'description') ilike v_pat
    union all
    select 'page', c.key, c.label, left(c.value, 160), '/about', 0.3::real
      from public.campus_content c where c.key in ('about_intro', 'history', 'vision', 'mission') and c.value ilike v_pat
  ) r(kind, id, title, snippet, path, rank)
  order by r.rank desc, r.kind, r.title
  limit v_lim;
end $$;

-- ---------- RLS ------------------------------------------------------
alter table public.campus_events enable row level security;
alter table public.documents enable row level security;
alter table public.page_view_daily enable row level security;
alter table public.campus_content_history enable row level security;
create policy events_admin on public.campus_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy documents_admin on public.documents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy content_history_admin on public.campus_content_history for select to authenticated using (public.is_admin());
-- page_view_daily: no policies at all; only the two functions above touch it.

-- ---------- Privileges -----------------------------------------------
revoke all on public.campus_events, public.documents, public.page_view_daily, public.campus_content_history, public.public_events, public.public_documents from anon, authenticated;
grant select, insert, update, delete on public.campus_events, public.documents to authenticated;
grant select on public.campus_content_history to authenticated;
grant select on public.public_events, public.public_documents to anon, authenticated;

revoke all on function public.audit_row_change(), public.documents_asset_check(), public.refresh_media_trigger(), public.record_page_view(text),
  public.admin_analytics(int), public.content_history_record(), public.restore_content_value(bigint), public.global_search(text, int) from public, anon, authenticated;
grant execute on function public.record_page_view(text), public.global_search(text, int) to anon, authenticated;
grant execute on function public.admin_analytics(int), public.restore_content_value(bigint) to authenticated;
