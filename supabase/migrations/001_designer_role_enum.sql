-- =====================================================================
-- 001 - Add the 'designer' account role.
-- RUN THIS FILE ALONE (its own query in the SQL Editor) and let it finish
-- BEFORE running 002. PostgreSQL cannot use a new enum value inside the same
-- transaction that created it.
-- =====================================================================
alter type public.user_role add value if not exists 'designer';
