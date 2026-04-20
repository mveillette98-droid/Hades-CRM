-- ---------------------------------------------------------------------
-- Bootstrap: promote the first user to admin.
--
-- HOW TO USE:
--   1. Run migrations 0001 and 0002 first.
--   2. Sign up via the app (/login → "Create one").
--   3. Come back here, replace the email on the last line with yours,
--      and run this whole file in the Supabase SQL editor.
-- ---------------------------------------------------------------------

update public.profiles
set role = 'admin'
where email = 'REPLACE_WITH_YOUR_EMAIL@example.com';

-- Verify
select id, email, full_name, role, created_at
from public.profiles
order by created_at desc;
