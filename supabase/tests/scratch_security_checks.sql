-- !!! SCRATCH DATABASE ONLY !!! Creates fake users and records. NEVER run on your real Supabase project.
-- Needs stub auth/storage schemas (see IMPLEMENTATION_NOTES.md, 'How the SQL was checked').
\set ON_ERROR_STOP off
\pset pager off
create temp table res(name text, ok boolean, info text);
grant all on res to anon, authenticated;
create or replace function pg_temp.as_user(u uuid, r text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); perform set_config('request.jwt.claim.role', r, false); end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','admin@x.com',now()),('00000000-0000-0000-0000-0000000000d1','des@x.com',now()),('00000000-0000-0000-0000-0000000000f1','fac@x.com',now());
update public.profiles set role='admin', status='approved' where email='admin@x.com';
update public.profiles set status='approved' where email in ('des@x.com','fac@x.com');

-- helper to record expected error / success
create or replace function pg_temp.expect_err(label text, sql text, must_contain text default '') returns void language plpgsql as $$
begin
  begin execute sql; insert into res values (label, false, 'expected error, got success');
  exception when others then insert into res values (label, position(must_contain in sqlerrm) > 0, left(sqlerrm,110)); end;
end $$;
create or replace function pg_temp.expect_ok(label text, sql text) returns void language plpgsql as $$
begin
  begin execute sql; insert into res values (label, true, '');
  exception when others then insert into res values (label, false, left(sqlerrm,160)); end;
end $$;
grant execute on function pg_temp.expect_err(text,text,text), pg_temp.expect_ok(text,text) to anon, authenticated;

-- admin assigns designer
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','authenticated');
set role authenticated;
select pg_temp.expect_ok('admin assigns designer role', $$ select public.set_account_role('00000000-0000-0000-0000-0000000000d1','designer') $$);
select pg_temp.expect_err('admin cannot assign admin', $$ select public.set_account_role('00000000-0000-0000-0000-0000000000f1','admin') $$, 'Only the Faculty');
select pg_temp.expect_err('admin cannot change own role', $$ select public.set_account_role('00000000-0000-0000-0000-0000000000a1','designer') $$, 'own role');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1','authenticated');
set role authenticated;
select pg_temp.expect_err('designer cannot set roles', $$ select public.set_account_role('00000000-0000-0000-0000-0000000000f1','designer') $$, 'Administrator');
select pg_temp.expect_err('designer cannot self-elevate (direct update)', $$ update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000d1' $$, 'permission denied');
select pg_temp.expect_ok('designer sees 0 contact messages', $$ do $b$ begin if (select count(*) from public.contact_messages)<>0 then raise exception 'saw'; end if; end $b$ $$);
select pg_temp.expect_ok('designer reads audit logs = 0 rows', $$ do $b$ begin if (select count(*) from public.audit_logs) <> 0 then raise exception 'saw audit'; end if; end $b$ $$);
select pg_temp.expect_err('designer cannot list users', $$ select * from public.admin_list_users() $$, 'Administrator');
select pg_temp.expect_err('designer cannot upload announcement media', $$ select public.media_begin_upload('announcement','image','a.jpg','image/jpeg',1000) $$, 'permission');
select pg_temp.expect_err('designer cannot upload documents', $$ select public.media_begin_upload('document','document','a.pdf','application/pdf',1000) $$, 'permission');
select pg_temp.expect_err('svg rejected', $$ select public.media_begin_upload('design','image','a.svg','image/svg+xml',1000) $$, 'Only JPG');
select pg_temp.expect_err('oversize rejected', $$ select public.media_begin_upload('design','image','a.png','image/png',99999999) $$, 'larger than');
select pg_temp.expect_err('designer cannot write announcements', $$ select public.save_announcement(null,'Hello title','body text long enough','Official Notices','Office',false) $$, 'not allowed');
select pg_temp.expect_err('designer cannot review design', $$ select public.review_design(gen_random_uuid(),'approved',null) $$, 'Administrator');
select pg_temp.expect_err('designer cannot change settings', $$ select public.set_media_settings(1000000,1000000,100000000,10000000) $$, 'Administrator');
select pg_temp.expect_err('designer cannot update media_settings table', $$ update public.media_settings set max_image_bytes=1 $$, 'permission denied');
-- design drafts
select pg_temp.expect_err('invalid color rejected', $$ select public.save_design_draft(null,'x','{"version":1,"colors":{"primary":"red"}}'::jsonb,false) $$, 'RRGGBB');
select pg_temp.expect_err('low contrast primary rejected', $$ select public.save_design_draft(null,'x','{"version":1,"colors":{"primary":"#FFFF00"}}'::jsonb,false) $$, 'too light');
select pg_temp.expect_err('unknown key rejected', $$ select public.save_design_draft(null,'x','{"version":1,"script":"alert(1)"}'::jsonb,false) $$, 'Unknown');
select pg_temp.expect_err('javascript link rejected', $$ select public.save_design_draft(null,'x','{"version":1,"carousel":{"slides":[{"id":"a","assetId":"00000000-0000-0000-0000-000000000001","alt":"x","linkUrl":"javascript:alert(1)"}]}}'::jsonb,false) $$, 'link');
select pg_temp.expect_err('html text rejected', $$ select public.save_design_draft(null,'x','{"version":1,"hero":{"headline":"<script>"}}'::jsonb,false) $$, 'unsupported');
select pg_temp.expect_ok('valid draft saved', $$ select public.save_design_draft(null,'My design','{"version":1,"colors":{"primary":"#1A4F8B","primaryHover":"#133E6E","primaryStrong":"#0E2F55","footer":"#0B2545"},"hero":{"headline":"Welcome"},"layout":{"sections":["events","announcements"]}}'::jsonb,true,'please') $$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1','authenticated');
set role authenticated;
select pg_temp.expect_ok('faculty sees 0 design drafts', $$ do $b$ begin if (select count(*) from public.design_revisions)<>0 then raise exception 'visible'; end if; end $b$ $$);
select pg_temp.expect_err('faculty cannot upload design media', $$ select public.media_begin_upload('design','image','a.png','image/png',1000) $$, 'permission');
select pg_temp.expect_err('faculty cannot save design', $$ select public.save_design_draft(null,'x','{"version":1}'::jsonb,false) $$, 'access');
select pg_temp.expect_err('faculty cannot edit link tables', $$ insert into public.link_groups(title) values ('x') $$, 'row-level security');
select pg_temp.expect_ok('faculty can reserve announcement upload', $$ select public.media_begin_upload('announcement','image','a.png','image/png',1000) $$);
select pg_temp.expect_ok('faculty saves announcement draft', $$ select public.save_announcement(null,'Hello title','body text long enough','Official Notices','Office',false) $$);
reset role;
-- admin approves design
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','authenticated');
set role authenticated;
select pg_temp.expect_ok('admin approves design', $$ select public.review_design((select id from public.design_revisions limit 1),'approved',null) $$);
reset role; select pg_temp.as_user(null,'anon'); set role anon;
select pg_temp.expect_ok('anon gets live design', $$ do $b$ begin if public.get_live_design() is null then raise exception 'null'; end if; end $b$ $$);
select pg_temp.expect_err('anon cannot read draft table', $$ select * from public.design_revisions $$, 'permission denied');
select pg_temp.expect_err('anon cannot read profiles', $$ select * from public.profiles $$, 'permission denied');
select pg_temp.expect_err('anon cannot read faculty_directory table', $$ select * from public.faculty_directory $$, 'permission denied');
select pg_temp.expect_ok('anon reads public_directory view', $$ select * from public.public_directory $$);
select pg_temp.expect_ok('anon search', $$ select * from public.global_search('hello') $$);
select pg_temp.expect_ok('anon page view', $$ select public.record_page_view('/events') $$);
select pg_temp.expect_err('anon cannot read analytics', $$ select * from public.page_view_daily $$, 'permission denied');
select pg_temp.expect_ok('anon reads public_announcements', $$ select * from public.public_announcements $$);
select pg_temp.expect_ok('anon related announcements', $$ select * from public.get_related_announcements(gen_random_uuid()) $$);
select pg_temp.expect_err('anon cannot call set_account_role', $$ select public.set_account_role(gen_random_uuid(),'designer') $$, 'permission denied');
reset role;
-- links workflow
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1','authenticated'); set role authenticated;
select pg_temp.expect_ok('designer adds link', $$ insert into public.link_entries(group_id,title,url) select id,'PUP','https://www.pup.edu.ph' from public.link_groups limit 1 $$);
select pg_temp.expect_err('javascript url rejected', $$ insert into public.link_entries(group_id,title,url) select id,'x','javascript:alert(1)' from public.link_groups limit 1 $$, 'violates check');
select pg_temp.expect_ok('designer submits links', $$ select public.submit_link_changes('n') $$);
select pg_temp.expect_err('designer cannot approve links', $$ select public.review_link_revision((select id from public.link_revisions limit 1),'approved',null) $$, 'Administrator');
reset role; select pg_temp.as_user(null,'anon'); set role anon;
select pg_temp.expect_ok('anon: no links before approval', $$ do $b$ begin if public.get_live_links() is not null then raise exception 'leak'; end if; end $b$ $$);
reset role; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','authenticated'); set role authenticated;
select pg_temp.expect_ok('admin approves links', $$ select public.review_link_revision((select id from public.link_revisions limit 1),'approved',null) $$);
reset role; select pg_temp.as_user(null,'anon'); set role anon;
select pg_temp.expect_ok('anon sees approved links', $$ do $b$ begin if jsonb_array_length(public.get_live_links()->'groups') < 1 then raise exception 'none'; end if; end $b$ $$);
select pg_temp.expect_ok('anon search finds link', $$ do $b$ begin if not exists (select 1 from public.global_search('PUP') where kind='link') then raise exception 'nf'; end if; end $b$ $$);
reset role;
-- announcement workflow with schedule
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1','authenticated'); set role authenticated;
select pg_temp.expect_ok('faculty submits scheduled announcement', $$ select public.save_announcement((select id from public.announcements limit 1),'Hello title','body text long enough','Official Notices','Office',true, now()+interval '1 day', now()+interval '3 days') $$);
reset role; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','authenticated'); set role authenticated;
select pg_temp.expect_ok('admin approves', $$ select public.review_announcement((select id from public.announcement_revisions order by created_at desc limit 1),'approved',null) $$);
reset role; select pg_temp.as_user(null,'anon'); set role anon;
select pg_temp.expect_ok('scheduled announcement hidden now', $$ do $b$ begin if (select count(*) from public.public_announcements)<>0 then raise exception 'visible early'; end if; end $b$ $$);
reset role;
update public.announcement_revisions set publish_at = now()-interval '1 hour', expires_at = now()+interval '1 day';
update public.announcements set published_at = now()-interval '1 hour';
set role anon; select pg_temp.as_user(null,'anon');
select pg_temp.expect_ok('visible after start', $$ do $b$ begin if (select count(*) from public.public_announcements)<>1 then raise exception 'not visible'; end if; end $b$ $$);
reset role; update public.announcement_revisions set expires_at = now()-interval '1 minute' where expires_at > now(); update public.announcement_revisions set publish_at=now()-interval '2 days';
set role anon;
select pg_temp.expect_ok('hidden after expiry', $$ do $b$ begin if (select count(*) from public.public_announcements)<>0 then raise exception 'still visible'; end if; end $b$ $$);
reset role;
select name, ok, info from res where not ok order by 1;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from res;
