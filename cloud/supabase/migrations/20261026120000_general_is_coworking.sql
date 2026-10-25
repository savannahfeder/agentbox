-- GENERAL IS CALLED COWORKING (w-64116bb761, 2026-10-24): the open group that
-- someone with no team joins on their own. Same id, so everyone in it stays.
-- Safe to run twice.
update public.rooms set name = 'Coworking'
  where id = '9e9e9e9e-0000-4000-8000-000000000001' and name <> 'Coworking';
