-- =====================================================================
-- 004 - Designer features: validated design configurations with
--       draft -> review -> approved -> live workflow and rollback,
--       and the expandable links directory (draft working copy +
--       approved published snapshots).
-- Run after 003.
-- =====================================================================

-- ======================= DESIGN CONFIGURATION ========================
-- The design is DATA, never code: a JSON document that must pass validate_design_config().
-- It can only select colours, built-in font stacks, layout switches and uploaded design images.
-- No HTML, CSS, URLs to scripts or scripts are ever stored or executed.

create or replace function public.design_luminance(p_hex text) returns numeric
language sql immutable as $$
  with c as (select ('x' || substr(p_hex, 2, 2))::bit(8)::int / 255.0 as r,
                    ('x' || substr(p_hex, 4, 2))::bit(8)::int / 255.0 as g,
                    ('x' || substr(p_hex, 6, 2))::bit(8)::int / 255.0 as b)
  select 0.2126 * (case when r <= 0.03928 then r / 12.92 else power((r + 0.055) / 1.055, 2.4) end)
       + 0.7152 * (case when g <= 0.03928 then g / 12.92 else power((g + 0.055) / 1.055, 2.4) end)
       + 0.0722 * (case when b <= 0.03928 then b / 12.92 else power((b + 0.055) / 1.055, 2.4) end) from c;
$$;
create or replace function public.design_contrast(p_a text, p_b text) returns numeric
language sql immutable as $$
  select (greatest(public.design_luminance(p_a), public.design_luminance(p_b)) + 0.05) / (least(public.design_luminance(p_a), public.design_luminance(p_b)) + 0.05);
$$;

create or replace function public.dz_absent(v jsonb) returns boolean language sql immutable as $$ select v is null or jsonb_typeof(v) = 'null'; $$;

create or replace function public.dz_obj(v jsonb, p_allowed text[], p_label text) returns void
language plpgsql immutable as $$
declare k text;
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'object' then raise exception 'Design setting "%" is not valid.', p_label; end if;
  for k in select jsonb_object_keys(v) loop
    if not (k = any (p_allowed)) then raise exception 'Unknown design setting "%.%".', p_label, left(k, 40); end if;
  end loop;
end $$;

create or replace function public.dz_hex(v jsonb, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'The colour for "%" must look like #RRGGBB.', p_label; end if;
end $$;

create or replace function public.dz_enum(v jsonb, p_allowed text[], p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (p_allowed)) then raise exception 'The value for "%" is not one of the allowed choices.', p_label; end if;
end $$;

create or replace function public.dz_num(v jsonb, p_lo numeric, p_hi numeric, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < p_lo or (v #>> '{}')::numeric > p_hi then
    raise exception 'The value for "%" must be between % and %.', p_label, p_lo, p_hi; end if;
end $$;

create or replace function public.dz_bool(v jsonb, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'boolean' then raise exception 'The value for "%" must be on or off.', p_label; end if;
end $$;

create or replace function public.dz_text(v jsonb, p_max int, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > p_max or (v #>> '{}') ~ '[<>[:cntrl:]]' then
    raise exception 'The text for "%" is too long (max %) or contains unsupported characters.', p_label, p_max; end if;
end $$;

create or replace function public.dz_uuid(v jsonb, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The image reference for "%" is not valid.', p_label; end if;
end $$;

-- Internal link (/path) or https link only. No javascript:, data:, http:, protocol-relative, etc.
create or replace function public.dz_link(v jsonb, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 500
     or ((v #>> '{}') !~ '^/([A-Za-z0-9_?=&#.%~+-][A-Za-z0-9/_?=&#.%~+-]*)?$' and (v #>> '{}') !~ '^https://[^[:space:]<>"'']+$') then
    raise exception 'The link for "%" must be a site page (like /events) or start with https://.', p_label; end if;
end $$;

create or replace function public.dz_background(v jsonb, p_label text) returns void language plpgsql immutable as $$
begin
  if public.dz_absent(v) then return; end if;
  perform public.dz_obj(v, array['assetId','color','positionX','positionY','size','opacity','overlayColor','overlayOpacity','blendMode'], p_label);
  perform public.dz_uuid(v -> 'assetId', p_label || ' image');
  perform public.dz_hex(v -> 'color', p_label || ' colour');
  perform public.dz_num(v -> 'positionX', 0, 100, p_label || ' horizontal position');
  perform public.dz_num(v -> 'positionY', 0, 100, p_label || ' vertical position');
  perform public.dz_enum(v -> 'size', array['cover','contain','auto'], p_label || ' size');
  perform public.dz_num(v -> 'opacity', 0, 1, p_label || ' opacity');
  perform public.dz_hex(v -> 'overlayColor', p_label || ' overlay colour');
  perform public.dz_num(v -> 'overlayOpacity', 0, 1, p_label || ' overlay opacity');
  perform public.dz_enum(v -> 'blendMode', array['normal','multiply','overlay','soft-light','screen','darken','lighten'], p_label || ' blend mode');
end $$;

-- Every uploaded image the design refers to (explicit paths only).
create or replace function public.design_asset_ids(p jsonb) returns setof uuid
language sql immutable as $$
  select distinct (x #>> '{}')::uuid from (
    select jsonb_path_query(p, '$.branding.logoAssetId') x
    union all select jsonb_path_query(p, '$.branding.faviconAssetId')
    union all select jsonb_path_query(p, '$.hero.imageAssetId')
    union all select jsonb_path_query(p, '$.hero.background.assetId')
    union all select jsonb_path_query(p, '$.banner.imageAssetId')
    union all select jsonb_path_query(p, '$.pageBackground.assetId')
    union all select jsonb_path_query(p, '$.carousel.slides[*].assetId')) t
  where jsonb_typeof(x) = 'string';
$$;

create or replace function public.validate_design_config(p jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_slide jsonb; v_ids text[] := '{}'; v_n int := 0; v_sec text; v_bad int;
  v_secs text[] := array['announcements','events','about','academics','links'];
  c jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'The design data is not valid.'; end if;
  if octet_length(p::text) > 60000 then raise exception 'The design is too large.'; end if;
  perform public.dz_obj(p, array['version','branding','colors','typography','layout','hero','banner','pageBackground','carousel'], 'design');
  if (p -> 'version') is distinct from '1'::jsonb then raise exception 'Unsupported design version.'; end if;

  perform public.dz_obj(p -> 'branding', array['logoAssetId','faviconAssetId'], 'branding');
  perform public.dz_uuid(p #> '{branding,logoAssetId}', 'logo');
  perform public.dz_uuid(p #> '{branding,faviconAssetId}', 'favicon');

  c := p -> 'colors';
  perform public.dz_obj(c, array['primary','primaryHover','primaryStrong','accent','accentHover','accentSoft','footer','ink','surface'], 'colors');
  perform public.dz_hex(c -> 'primary', 'primary'); perform public.dz_hex(c -> 'primaryHover', 'primary hover');
  perform public.dz_hex(c -> 'primaryStrong', 'strong primary'); perform public.dz_hex(c -> 'accent', 'accent');
  perform public.dz_hex(c -> 'accentHover', 'accent hover'); perform public.dz_hex(c -> 'accentSoft', 'soft accent');
  perform public.dz_hex(c -> 'footer', 'footer'); perform public.dz_hex(c -> 'ink', 'text'); perform public.dz_hex(c -> 'surface', 'surface');
  -- Accessibility guard: text must stay readable whatever colours are picked.
  if not public.dz_absent(c -> 'primary') and public.design_contrast(c ->> 'primary', '#FFFFFF') < 4.5 then
    raise exception 'The primary colour is too light: white text on it needs a contrast ratio of at least 4.5.'; end if;
  if not public.dz_absent(c -> 'footer') and public.design_contrast(c ->> 'footer', '#FFFFFF') < 4.5 then
    raise exception 'The footer colour is too light for white text (contrast at least 4.5 needed).'; end if;
  if not public.dz_absent(c -> 'primaryStrong') and public.design_contrast(c ->> 'primaryStrong', '#FFFFFF') < 4.5 then
    raise exception 'The strong primary colour is too light for headings on white (contrast at least 4.5 needed).'; end if;
  if not public.dz_absent(c -> 'ink') and public.design_contrast(c ->> 'ink', '#FFFFFF') < 7 then
    raise exception 'The text colour needs a contrast ratio of at least 7 against white.'; end if;
  if not public.dz_absent(c -> 'accent') and not public.dz_absent(c -> 'primaryStrong')
     and public.design_contrast(c ->> 'accent', c ->> 'primaryStrong') < 4.5 then
    raise exception 'Buttons in the accent colour need readable text: contrast with the strong primary colour must be at least 4.5.'; end if;

  perform public.dz_obj(p -> 'typography', array['headingFont','bodyFont','baseSize'], 'typography');
  perform public.dz_enum(p #> '{typography,headingFont}', array['serif-classic','sans-system','humanist','rounded','mono'], 'heading font');
  perform public.dz_enum(p #> '{typography,bodyFont}', array['serif-classic','sans-system','humanist','rounded','mono'], 'body font');
  perform public.dz_num(p #> '{typography,baseSize}', 14, 20, 'base text size');

  perform public.dz_obj(p -> 'layout', array['maxWidth','headerStyle','heroAlign','radius','sections','hiddenSections'], 'layout');
  perform public.dz_enum(p #> '{layout,maxWidth}', array['narrow','standard','wide'], 'page width');
  perform public.dz_enum(p #> '{layout,headerStyle}', array['light','dark'], 'header style');
  perform public.dz_enum(p #> '{layout,heroAlign}', array['left','center'], 'hero alignment');
  perform public.dz_enum(p #> '{layout,radius}', array['sharp','soft','round'], 'corner style');
  foreach v_sec in array array['sections','hiddenSections'] loop
    if not public.dz_absent(p #> array['layout', v_sec]) then
      if jsonb_typeof(p #> array['layout', v_sec]) <> 'array' or jsonb_array_length(p #> array['layout', v_sec]) > 5 then raise exception 'Invalid section list.'; end if;
      select count(*) into v_bad from jsonb_array_elements(p #> array['layout', v_sec]) e
        where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_secs));
      if v_bad > 0 then raise exception 'Unknown homepage section.'; end if;
      if (select count(distinct e) from jsonb_array_elements(p #> array['layout', v_sec]) e) <> jsonb_array_length(p #> array['layout', v_sec]) then
        raise exception 'A homepage section is listed twice.'; end if;
    end if;
  end loop;

  perform public.dz_obj(p -> 'hero', array['headline','subtitle','imageAssetId','showImage','minHeight','background'], 'hero');
  perform public.dz_text(p #> '{hero,headline}', 120, 'hero headline');
  perform public.dz_text(p #> '{hero,subtitle}', 240, 'hero subtitle');
  perform public.dz_uuid(p #> '{hero,imageAssetId}', 'hero image');
  perform public.dz_bool(p #> '{hero,showImage}', 'show hero image');
  perform public.dz_enum(p #> '{hero,minHeight}', array['compact','standard','tall'], 'hero height');
  perform public.dz_background(p #> '{hero,background}', 'hero background');

  perform public.dz_obj(p -> 'banner', array['enabled','text','tone','imageAssetId'], 'banner');
  perform public.dz_bool(p #> '{banner,enabled}', 'banner');
  perform public.dz_text(p #> '{banner,text}', 200, 'banner text');
  perform public.dz_enum(p #> '{banner,tone}', array['info','accent','warning'], 'banner style');
  perform public.dz_uuid(p #> '{banner,imageAssetId}', 'banner image');

  perform public.dz_background(p -> 'pageBackground', 'page background');

  perform public.dz_obj(p -> 'carousel', array['enabled','autoplay','intervalSec','slides'], 'carousel');
  perform public.dz_bool(p #> '{carousel,enabled}', 'carousel');
  perform public.dz_bool(p #> '{carousel,autoplay}', 'carousel autoplay');
  perform public.dz_num(p #> '{carousel,intervalSec}', 3, 15, 'carousel interval');
  if not public.dz_absent(p #> '{carousel,slides}') then
    if jsonb_typeof(p #> '{carousel,slides}') <> 'array' or jsonb_array_length(p #> '{carousel,slides}') > 10 then
      raise exception 'A carousel can have at most 10 slides.'; end if;
    for v_slide in select * from jsonb_array_elements(p #> '{carousel,slides}') loop
      v_n := v_n + 1;
      perform public.dz_obj(v_slide, array['id','assetId','title','caption','alt','linkUrl','visible'], 'slide ' || v_n);
      if coalesce(v_slide ->> 'id', '') !~ '^[a-z0-9-]{1,40}$' then raise exception 'Slide % has an invalid id.', v_n; end if;
      if v_slide ->> 'id' = any (v_ids) then raise exception 'Two slides share the same id.'; end if;
      v_ids := v_ids || (v_slide ->> 'id');
      if public.dz_absent(v_slide -> 'assetId') then raise exception 'Slide % needs an image.', v_n; end if;
      perform public.dz_uuid(v_slide -> 'assetId', 'slide ' || v_n || ' image');
      perform public.dz_text(v_slide -> 'title', 100, 'slide ' || v_n || ' title');
      perform public.dz_text(v_slide -> 'caption', 240, 'slide ' || v_n || ' caption');
      perform public.dz_text(v_slide -> 'alt', 300, 'slide ' || v_n || ' description');
      if coalesce(btrim(v_slide ->> 'alt'), '') = '' then raise exception 'Slide % needs an image description (alt text).', v_n; end if;
      perform public.dz_link(v_slide -> 'linkUrl', 'slide ' || v_n || ' link');
      perform public.dz_bool(v_slide -> 'visible', 'slide ' || v_n || ' visibility');
    end loop;
  end if;

  -- Every referenced image must exist, be a finished design image.
  select count(*) into v_bad from public.design_asset_ids(p) as a(asset_id)
   where not exists (select 1 from public.media_assets m where m.id = a.asset_id and m.status = 'ready' and m.kind = 'image' and m.purpose = 'design');
  if v_bad > 0 then raise exception 'One of the images used in this design is no longer available. Pick it again from the media library.'; end if;
end $$;

-- ---------- Tables ---------------------------------------------------
create table public.design_revisions (
  id uuid primary key default gen_random_uuid(),
  version int generated always as identity,
  name text not null default 'Untitled design' check (char_length(name) between 1 and 80),
  author_id uuid not null references public.profiles (id) on delete restrict,
  config jsonb not null,
  status public.revision_status not null default 'draft',
  based_on uuid references public.design_revisions (id) on delete set null,
  note text check (char_length(note) <= 500),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (char_length(review_reason) <= 1000),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or approved_at is not null)
);
create index on public.design_revisions (author_id, updated_at desc);
create index on public.design_revisions (status);
create trigger trg_touch before update on public.design_revisions for each row execute function public.touch_updated_at();

-- Approved designs are immutable history: they can never be edited or deleted, only superseded by the live pointer.
create or replace function public.design_revisions_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then raise exception 'Approved designs are kept as history and cannot be deleted.'; end if;
    return old;
  end if;
  -- The only allowed change to an approved design: the reviewer reference being cleared when that account is removed.
  if old.status = 'approved' and (to_jsonb(new) - 'reviewed_by' - 'updated_at') is distinct from (to_jsonb(old) - 'reviewed_by' - 'updated_at') then
    raise exception 'Approved designs cannot be changed.'; end if;
  return new;
end $$;
create trigger trg_design_immutable before update or delete on public.design_revisions for each row execute function public.design_revisions_immutable();

-- Which approved design is live. NULL = the built-in default look.
create table public.site_design_state (
  id boolean primary key default true check (id),
  live_revision_id uuid references public.design_revisions (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_design_state default values;

-- Only approved revisions may ever be live.
create or replace function public.site_design_only_approved() returns trigger language plpgsql as $$
begin
  if new.live_revision_id is not null and not exists (select 1 from public.design_revisions r where r.id = new.live_revision_id and r.status = 'approved') then
    raise exception 'Only an approved design can be made live.'; end if;
  return new;
end $$;
create trigger trg_site_design_approved before insert or update on public.site_design_state for each row execute function public.site_design_only_approved();

insert into public.media_ref_sources (key, label, any_sql, live_sql) values (
  'design', 'the site design',
  $q$ select public.design_asset_ids(config) from public.design_revisions $q$,
  $q$ select public.design_asset_ids(r.config) from public.design_revisions r join public.site_design_state s on s.live_revision_id = r.id $q$);

-- ---------- Workflow functions ---------------------------------------
create or replace function public.save_design_draft(p_id uuid, p_name text, p_config jsonb, p_submit boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rev public.design_revisions; v_live uuid;
  v_name text := left(coalesce(nullif(btrim(p_name), ''), 'Untitled design'), 80);
  v_status public.revision_status := (case when p_submit then 'pending' else 'draft' end)::public.revision_status;
begin
  if not public.can_design() then raise exception 'You do not have access to the design tools.'; end if;
  perform public.validate_design_config(p_config);
  if p_id is null then
    if (select count(*) from public.design_revisions where author_id = v_uid and status in ('draft', 'rejected', 'revision_required')) >= 20 then
      raise exception 'You have 20 unfinished designs. Delete some before creating more.'; end if;
    select live_revision_id into v_live from public.site_design_state;
    insert into public.design_revisions (author_id, name, config, status, based_on, note, submitted_at)
    values (v_uid, v_name, p_config, v_status, v_live, left(p_note, 500), case when p_submit then now() end) returning * into v_rev;
  else
    select * into v_rev from public.design_revisions where id = p_id for update;
    if not found or v_rev.author_id <> v_uid then raise exception 'Design not found.'; end if;   -- ownership check (also for admins: they review, they do not edit others' drafts)
    if v_rev.status not in ('draft', 'rejected', 'revision_required') then raise exception 'This design can not be edited (it is awaiting review or already approved).'; end if;
    update public.design_revisions set name = v_name, config = p_config, status = v_status, note = left(p_note, 500),
      submitted_at = case when p_submit then now() else submitted_at end, review_reason = case when p_submit then null else review_reason end
     where id = p_id returning * into v_rev;
  end if;
  if p_submit then
    perform public.write_audit('design_submitted', 'design', v_rev.id::text, jsonb_build_object('name', v_name, 'version', v_rev.version));
  end if;
  return v_rev.id;
end $$;

create or replace function public.delete_design_draft(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_rev public.design_revisions;
begin
  select * into v_rev from public.design_revisions where id = p_id for update;
  if not found or v_rev.author_id <> auth.uid() or not public.can_design() then raise exception 'Design not found.'; end if;
  if v_rev.status not in ('draft', 'rejected', 'revision_required') then raise exception 'Only unfinished designs can be deleted.'; end if;
  delete from public.design_revisions where id = p_id;
end $$;

create or replace function public.review_design(p_id uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_rev public.design_revisions; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then raise exception 'Invalid decision.'; end if;
  if p_decision <> 'approved' and v_reason is null then raise exception 'A reason is required so the designer knows what to change.'; end if;
  select * into v_rev from public.design_revisions where id = p_id for update;
  if not found then raise exception 'Design not found.'; end if;
  if v_rev.status <> 'pending' then raise exception 'This design is no longer pending.'; end if;
  perform public.validate_design_config(v_rev.config);   -- re-validated at publication time

  update public.design_revisions set status = p_decision::public.revision_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_reason = v_reason, approved_at = case when p_decision = 'approved' then now() end where id = p_id;
  if p_decision = 'approved' then
    update public.site_design_state set live_revision_id = p_id, updated_by = auth.uid(), updated_at = now();
    perform public.write_audit('design_approved', 'design', p_id::text, jsonb_build_object('name', v_rev.name, 'version', v_rev.version));
    perform public.write_audit('design_published', 'design', p_id::text, jsonb_build_object('name', v_rev.name, 'version', v_rev.version));
    perform public.refresh_media_public();
  else
    perform public.write_audit(case when p_decision = 'rejected' then 'design_rejected' else 'design_revision_requested' end,
      'design', p_id::text, jsonb_build_object('name', v_rev.name, 'version', v_rev.version));
  end if;
end $$;

-- p_id = null rolls back to the built-in default look.
create or replace function public.rollback_design(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_rev public.design_revisions;
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_id is not null then
    select * into v_rev from public.design_revisions where id = p_id;
    if not found or v_rev.status <> 'approved' then raise exception 'Only a previously approved design can be restored.'; end if;
    perform public.validate_design_config(v_rev.config);
  end if;
  update public.site_design_state set live_revision_id = p_id, updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('design_rolled_back', 'design', coalesce(p_id::text, 'default'), jsonb_build_object('name', v_rev.name, 'version', v_rev.version));
  perform public.refresh_media_public();
end $$;

-- What visitors get: the live design plus ONLY the public image paths it uses. Never drafts.
create or replace function public.get_live_design() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object(
    'revision_id', r.id, 'version', r.version, 'config', r.config,
    'assets', coalesce((select jsonb_object_agg(m.id, jsonb_build_object('path_original', m.path_original, 'path_medium', m.path_medium, 'path_thumb', m.path_thumb,
                 'width', m.width, 'height', m.height, 'width_medium', m.width_medium, 'width_thumb', m.width_thumb))
               from public.media_assets m where m.is_public and m.status = 'ready' and m.id in (select public.design_asset_ids(r.config))), '{}'::jsonb))
  end
  from public.site_design_state s left join public.design_revisions r on r.id = s.live_revision_id;
$$;

-- ======================= LINKS DIRECTORY =============================
create table public.link_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (char_length(description) <= 240),
  display_order int not null default 0,
  is_hidden boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.link_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.link_groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text not null check (char_length(url) <= 500 and (url ~* '^https?://[^[:space:]<>"'']+$' or url ~* '^mailto:[^[:space:]<>"'',@]+@[^[:space:]<>"'',@]+$')),
  description text check (char_length(description) <= 240),
  icon text check (icon is null or icon in ('globe','document','people','book','mail','building','calendar','school','download','star')),
  display_order int not null default 0,
  is_hidden boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.link_entries (group_id, display_order);
create trigger trg_touch before update on public.link_groups for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.link_entries for each row execute function public.touch_updated_at();

-- Seed group titles named in the specification. No links are invented.
insert into public.link_groups (title, display_order) values
  ('Student Organizations', 10), ('Government / SK Links', 20), ('Academic Resources', 30), ('PUP System Links', 40), ('Forms & Downloads', 50);

create table public.link_revisions (
  id uuid primary key default gen_random_uuid(),
  version int generated always as identity,
  author_id uuid not null references public.profiles (id) on delete restrict,
  snapshot jsonb not null,
  status public.revision_status not null default 'pending',
  note text check (char_length(note) <= 500),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (char_length(review_reason) <= 1000),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.link_revisions (status, created_at desc);
create or replace function public.link_revisions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Link revisions are history and cannot be deleted.'; end if;
  if old.snapshot is distinct from new.snapshot or old.author_id <> new.author_id then raise exception 'A submitted snapshot cannot be changed.'; end if;
  if old.status = 'approved' and (to_jsonb(new) - 'reviewed_by') is distinct from (to_jsonb(old) - 'reviewed_by') then
    raise exception 'Approved link revisions cannot be changed.'; end if;
  return new;
end $$;
create trigger trg_link_revisions_guard before update or delete on public.link_revisions for each row execute function public.link_revisions_guard();

create table public.site_links_state (
  id boolean primary key default true check (id),
  live_revision_id uuid references public.link_revisions (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_links_state default values;
create or replace function public.site_links_only_approved() returns trigger language plpgsql as $$
begin
  if new.live_revision_id is not null and not exists (select 1 from public.link_revisions r where r.id = new.live_revision_id and r.status = 'approved') then
    raise exception 'Only approved links can be made live.'; end if;
  return new;
end $$;
create trigger trg_site_links_approved before insert or update on public.site_links_state for each row execute function public.site_links_only_approved();

create or replace function public.build_links_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('groups', coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'title', g.title, 'description', g.description, 'hidden', g.is_hidden,
    'links', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'url', e.url, 'description', e.description, 'icon', e.icon, 'hidden', e.is_hidden)
                        order by e.display_order, e.title), '[]'::jsonb) from public.link_entries e where e.group_id = g.id)
  ) order by g.display_order, g.title), '[]'::jsonb))
  from public.link_groups g;
$$;

create or replace function public.submit_link_changes(p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can_design() then raise exception 'You do not have access to the link tools.'; end if;
  -- Newer submission replaces any older waiting one (kept as history, marked clearly).
  update public.link_revisions set status = 'draft', review_reason = 'Replaced by a newer submission.' where status = 'pending';
  insert into public.link_revisions (author_id, snapshot, note) values (auth.uid(), public.build_links_snapshot(), left(p_note, 500)) returning id into v_id;
  perform public.write_audit('links_submitted', 'links', v_id::text);
  return v_id;
end $$;

create or replace function public.review_link_revision(p_id uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_rev public.link_revisions; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then raise exception 'Invalid decision.'; end if;
  if p_decision <> 'approved' and v_reason is null then raise exception 'A reason is required.'; end if;
  select * into v_rev from public.link_revisions where id = p_id for update;
  if not found or v_rev.status <> 'pending' then raise exception 'This submission is no longer pending.'; end if;
  update public.link_revisions set status = p_decision::public.revision_status, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = v_reason,
    approved_at = case when p_decision = 'approved' then now() end where id = p_id;
  if p_decision = 'approved' then
    update public.site_links_state set live_revision_id = p_id, updated_by = auth.uid(), updated_at = now();
    perform public.write_audit('links_approved', 'links', p_id::text);
    perform public.write_audit('links_published', 'links', p_id::text);
  else
    perform public.write_audit(case when p_decision = 'rejected' then 'links_rejected' else 'links_revision_requested' end, 'links', p_id::text);
  end if;
end $$;

create or replace function public.rollback_links(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if p_id is not null and not exists (select 1 from public.link_revisions where id = p_id and status = 'approved') then
    raise exception 'Only a previously approved links version can be restored.'; end if;
  update public.site_links_state set live_revision_id = p_id, updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('links_rolled_back', 'links', coalesce(p_id::text, 'none'));
end $$;

-- Replace the editable working copy with a previously approved snapshot (starting point for new edits).
create or replace function public.restore_links_working_copy(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; g jsonb; l jsonb; v_gi int := 0; v_li int;
begin
  if not public.can_design() then raise exception 'You do not have access to the link tools.'; end if;
  select snapshot into v_snap from public.link_revisions where id = p_id and status = 'approved';
  if v_snap is null then raise exception 'Only an approved links version can be restored.'; end if;
  delete from public.link_entries; delete from public.link_groups;
  for g in select * from jsonb_array_elements(v_snap -> 'groups') loop
    v_gi := v_gi + 10; v_li := 0;
    insert into public.link_groups (id, title, description, display_order, is_hidden)
    values ((g ->> 'id')::uuid, g ->> 'title', g ->> 'description', v_gi, coalesce((g ->> 'hidden')::boolean, false));
    for l in select * from jsonb_array_elements(g -> 'links') loop
      v_li := v_li + 10;
      insert into public.link_entries (group_id, title, url, description, icon, display_order, is_hidden)
      values ((g ->> 'id')::uuid, l ->> 'title', l ->> 'url', l ->> 'description', l ->> 'icon', v_li, coalesce((l ->> 'hidden')::boolean, false));
    end loop;
  end loop;
  perform public.write_audit('links_working_copy_restored', 'links', p_id::text);
end $$;

-- Public: approved, visible groups/links only. Designers' unapproved edits never appear here.
create or replace function public.get_live_links() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object('version', r.version, 'approved_at', r.approved_at, 'groups',
    coalesce((select jsonb_agg(jsonb_build_object('id', g ->> 'id', 'title', g ->> 'title', 'description', g ->> 'description',
        'links', (select coalesce(jsonb_agg(jsonb_build_object('id', l ->> 'id', 'title', l ->> 'title', 'url', l ->> 'url', 'description', l ->> 'description', 'icon', l ->> 'icon')), '[]'::jsonb)
                    from jsonb_array_elements(g -> 'links') l where coalesce((l ->> 'hidden')::boolean, false) = false)))
      from jsonb_array_elements(r.snapshot -> 'groups') g where coalesce((g ->> 'hidden')::boolean, false) = false), '[]'::jsonb)) end
  from public.site_links_state s left join public.link_revisions r on r.id = s.live_revision_id;
$$;

-- ---------- Admin counters (extended) --------------------------------
create or replace function public.admin_overview_counts() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  return jsonb_build_object(
    'pending_registrations', (select count(*) from public.profiles p join auth.users u on u.id = p.id
                              where p.status = 'pending_approval' and u.email_confirmed_at is not null),
    'pending_announcements', (select count(*) from public.announcement_revisions where status = 'pending'),
    'unread_messages', (select count(*) from public.contact_messages where not is_read),
    'pending_designs', (select count(*) from public.design_revisions where status = 'pending'),
    'pending_links', (select count(*) from public.link_revisions where status = 'pending'));
end $$;

-- ---------- RLS ------------------------------------------------------
alter table public.design_revisions enable row level security;
alter table public.site_design_state enable row level security;
alter table public.link_groups enable row level security;
alter table public.link_entries enable row level security;
alter table public.link_revisions enable row level security;
alter table public.site_links_state enable row level security;

-- Designers see only their own designs; administrators see everything. Visitors and Faculty see nothing.
create policy design_rev_select on public.design_revisions for select to authenticated
  using (public.is_admin() or (author_id = auth.uid() and public.is_designer()));
create policy design_state_select on public.site_design_state for select to authenticated using (public.can_design());
-- No write policies on design tables: all writes go through the functions above.

-- Link working copy: designers and admins may edit (these are drafts; nothing is public until approved).
create policy link_groups_all on public.link_groups for all to authenticated using (public.can_design()) with check (public.can_design());
create policy link_entries_all on public.link_entries for all to authenticated using (public.can_design()) with check (public.can_design());
create policy link_rev_select on public.link_revisions for select to authenticated using (public.can_design());
create policy links_state_select on public.site_links_state for select to authenticated using (public.can_design());

-- ---------- Privileges -----------------------------------------------
revoke all on public.design_revisions, public.site_design_state, public.link_groups, public.link_entries, public.link_revisions, public.site_links_state from anon, authenticated;
grant select on public.design_revisions, public.site_design_state, public.link_revisions, public.site_links_state to authenticated;
grant select, delete on public.link_groups, public.link_entries to authenticated;
grant insert (title, description, display_order, is_hidden) on public.link_groups to authenticated;
grant update (title, description, display_order, is_hidden) on public.link_groups to authenticated;
grant insert (group_id, title, url, description, icon, display_order, is_hidden) on public.link_entries to authenticated;
grant update (group_id, title, url, description, icon, display_order, is_hidden) on public.link_entries to authenticated;

revoke all on function
  public.design_luminance(text), public.design_contrast(text, text), public.dz_absent(jsonb), public.dz_obj(jsonb, text[], text), public.dz_hex(jsonb, text),
  public.dz_enum(jsonb, text[], text), public.dz_num(jsonb, numeric, numeric, text), public.dz_bool(jsonb, text), public.dz_text(jsonb, int, text),
  public.dz_uuid(jsonb, text), public.dz_link(jsonb, text), public.dz_background(jsonb, text), public.design_asset_ids(jsonb), public.validate_design_config(jsonb),
  public.save_design_draft(uuid, text, jsonb, boolean, text), public.delete_design_draft(uuid), public.review_design(uuid, text, text), public.rollback_design(uuid),
  public.get_live_design(), public.build_links_snapshot(), public.submit_link_changes(text), public.review_link_revision(uuid, text, text),
  public.rollback_links(uuid), public.restore_links_working_copy(uuid), public.get_live_links(), public.admin_overview_counts(),
  public.design_revisions_immutable(), public.site_design_only_approved(), public.link_revisions_guard(), public.site_links_only_approved()
  from public, anon, authenticated;
grant execute on function public.get_live_design(), public.get_live_links() to anon, authenticated;
grant execute on function public.save_design_draft(uuid, text, jsonb, boolean, text), public.delete_design_draft(uuid), public.review_design(uuid, text, text),
  public.rollback_design(uuid), public.submit_link_changes(text), public.review_link_revision(uuid, text, text), public.rollback_links(uuid),
  public.restore_links_working_copy(uuid), public.admin_overview_counts() to authenticated;
