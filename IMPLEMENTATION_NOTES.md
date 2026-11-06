# PUP Unisan – Upgrade implementation notes

Status: **code written and checked offline, not deployed, not tested in a browser or against your live Supabase project.**
See "What was and was not verified" before relying on any of it.

## 1. Starting point (what the source already had)

React 18 + TypeScript + Vite + Tailwind SPA; Supabase Auth + PostgreSQL (RLS, `SECURITY DEFINER` RPCs, audit log); Netlify with SPA redirect and CSP headers.
Roles: `faculty`, `admin`. Announcement workflow: draft → pending → published, revisions, reviews, unpublish/archive. Admin tools: registrations, users, content, directory, messages, logs.

| Requirement area | Before | Now |
|---|---|---|
| Designer role, RLS-enforced | missing | **implemented** (`001`, `002`, `004`) |
| Role assignment by admins only; no self-elevation | partial (column grants) | **implemented** + trigger guard + `set_account_role` |
| Media upload security (private bucket, limits, quotas, policies) | missing | **implemented** (`002`) |
| Announcement cover/inline images, alt text, order | missing | **implemented** (`003`) |
| Shareable detail page, related announcements | detail page existed, no related | **implemented** |
| Scheduled publication + automatic expiry | missing | **implemented** (read-time filtering, no cron needed) |
| Public version stays live while revision pending | already | preserved |
| Visual editor, previews, theming, carousel, media library | missing | **implemented** (`004`, `VisualEditor`) |
| Design approval, versions, rollback | missing | **implemented** |
| Personnel directory (sections, programs, photos, privacy, highlights, print) | basic list | **implemented** (`005`) |
| Expandable links directory with approval workflow | missing | **implemented** (`004`) |
| Events calendar, documents center, global search, analytics | missing | **implemented** (`006`) |
| Content version history + restore | missing | **implemented** for campus content; designs, links and announcements have their own history |
| Accessibility / performance | partly | skip link, focus management, labelled controls, lazy responsive images, reduced motion, route-level code splitting |

## 2. Applying the upgrade (existing Supabase project)

1. **Back up** (Supabase → Database → Backups) or at least export your data.
2. SQL Editor, run each file as its **own query**, in order, waiting for success:
   `supabase/migrations/001_designer_role_enum.sql` → `002_roles_and_media_security.sql` → `003_announcement_media_and_scheduling.sql` → `004_design_system_and_links.sql` → `005_personnel_directory.sql` → `006_campus_features.sql`.
   (`001` must finish before `002`: PostgreSQL cannot use a new enum value in the same transaction.) Run each migration **once**.
   New project: run `supabase/schema.sql` first.
3. Confirm **Storage → Buckets** now lists a **private** bucket `site-media` (migration 002 creates it). Do not make it public.
4. `npm install`, `npm run build` (no new dependencies were added), deploy `dist/` to Netlify as before. No new environment variables: still only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never use the service-role key.
5. Create a Designer: have the person register and verify email → approve under **Registrations** → **Users → Change role → Designer**.
6. Optional: Supabase → Storage → Settings, check your plan's global upload limit (the bucket is set to 50 MB; site limits are lower and editable in **Admin → Media & storage**).
7. `netlify.toml` needed no changes (CSP already allows `https://*.supabase.co` images/connections; the app sets colours/backgrounds through CSS properties, which `style-src 'self'` permits).

Behaviour changes to know about:
* The public directory is now read from the view `public_directory`; the base table `faculty_directory` is administrator-only. Existing records keep their public email (marked as consented because an admin had approved it) and default to section **Teaching** — reclassify them in **Admin → Faculty & staff**.
* `save_announcement` gained optional parameters (old calls still work); Designers cannot create announcements.
* `admin_overview_counts` now also returns pending designs/links.

## 3. Security model (all enforced in PostgreSQL / Storage, not in the UI)

* `has_role / is_designer / can_design` helpers check approved + email-verified on every request.
* Roles/status on `profiles` can be changed only by the admin RPCs (column grants **and** a trigger that rejects any other path from the API). Admins cannot be created or modified from the website; admins cannot change their own role.
* **Design** is validated JSON (`validate_design_config`): fixed keys, hex colours with WCAG contrast guards, built-in font stacks only, enumerated layout options, https/internal links only, asset ids that must exist as design images. No HTML, CSS text, or scripts are stored. The client re-validates (`sanitizeDesign`) and falls back to the original look on anything invalid. Approved designs are immutable; only approved ones can be live (trigger); rollback just moves the live pointer.
* **Links**: designers edit a working copy (RLS: designers/admins); submitting snapshots it server-side; only an admin-approved snapshot is returned by `get_live_links()`.
* **Media**: one private bucket. Flow = `media_begin_upload` (role, extension + MIME allow-list, size limit, total/per-user quota) → upload only to the reserved folder with expected file names (storage INSERT policy) → `media_finish_upload` (re-measures real stored size/type, activates). Images are re-encoded to WebP client-side (EXIF/GPS stripped) in 3 sizes. SVG/HTML/macro-Office/executables are rejected by extension, MIME, bucket allow-list and magic-byte sniffing. No UPDATE policy (no overwrite); delete only after `media_request_delete` confirms the file is unused. Visitors can sign only files whose asset is `is_public`, a flag recomputed from **approved, live** content (`refresh_media_public`) — drafts, rejected designs and unapproved personnel photos are not reachable even with a guessed path.
* Personnel: private employment data lives in `personnel_private` (admin-only). Public view exposes birthday (month/day), contact details and retirement info only with recorded consent flags; years of service / "new member" only when dates are admin-verified.
* Analytics: counts per page per day only. No IP, user id, cookie or referrer is stored; Do-Not-Track is respected.

## 4. New / changed files

SQL: `supabase/migrations/001…006`, `supabase/tests/scratch_security_checks.sql` (scratch DB only).
Libraries: `src/lib/{media,design,usePageTitle}.ts`, `types.ts`, `util.ts` (extended); `src/context/DesignContext.tsx`.
Components: `components/media/{ResponsiveImage,ImageUploader,MediaPicker,MediaLibraryPanel}.tsx`, `components/design/{BackgroundLayer,Carousel,Banner,SitePreview}.tsx`; `PublicLayout`, `ProtectedRoute`, `ui` modified.
Public pages: `Home`, `Announcements`, `AnnouncementDetail`, `FacultyDirectory` (modified); `Events`, `EventDetail`, `Documents`, `LinksDirectory`, `Search` (new).
Faculty: `AnnouncementEditor`, `MyAnnouncements` (modified).
Designer: `pages/designer/{DesignerHome,VisualEditor,DesignerMedia,LinksEditor}.tsx` (new).
Admin: `AdminUsers`, `AdminHome`, `AdminDirectory`, `AdminAnnouncements`, `AdminReview` (modified); `AdminDesign`, `AdminLinks`, `AdminEvents`, `AdminDocuments`, `AdminMedia`, `AdminAnalytics`, `AdminHistory` (new).
Config: `tailwind.config.js`, `src/index.css` (theme variables, print styles), `App.tsx` (routes), `Login`/`AccountStatus` (role-aware redirects), README.

## 5. What was and was not verified

* **Verified:** all SQL (`schema.sql` + 001–006) applies cleanly on PostgreSQL 16 with stand-in Supabase `auth`/`storage` schemas; ~55 role/RLS/workflow checks pass (designer limits, no self-elevation, design/link validation and approval gates, upload reservation rules, public/draft media visibility, scheduling/expiry, anon access). This also found and fixed one real bug.
* **Verified only partially:** the TypeScript was type-checked offline with React/router/Supabase typed as `any` (the sandbox could not reach npm). That catches syntax errors, bad imports and mismatches between our own types, **not** React/Supabase API misuse. Run `npm install && npm run build` first and fix anything it reports.
* **Not done (by your scope):** no browser testing, no run against real Supabase Storage/Auth, no deployment.

## 6. Limits and requirements that need decisions

* **Social-media link previews** (Facebook etc.) for announcement URLs need server-side rendering/prerendering; a pure SPA on Netlify cannot provide per-page Open Graph tags. Share/copy links work.
* **Server-side file scanning** (antivirus, true image decoding) is not possible without an Edge Function. Images are re-encoded in the browser and checked by magic bytes; documents are checked by extension/MIME/magic bytes, not scanned. Consider an Edge Function + scanner if staff upload documents from untrusted sources. A user bypassing the website could upload arbitrary bytes labelled as an allowed type (bucket MIME allow-list and policies still apply); such files are never served publicly unless an admin publishes them.
* **Image transformations** use browser-generated variants, not Supabase's paid transformation service.
* **Fonts** are system font stacks only (strict CSP `font-src 'self'`); adding Google Fonts needs a CSP change.
* Signed image URLs expire (1 h) and are re-requested automatically; very long-open pages may briefly show "Loading image…" until refreshed. The favicon is signed once per page load.
* Page-view counting is unauthenticated and can be inflated by scripts; treat it as a trend indicator.
* Analytics, search and events are only as complete as the content admins enter; nothing official is invented (all new group titles/placeholders are neutral).
* Existing announcements keep working unchanged; the live design starts as the original look until a design is approved.
