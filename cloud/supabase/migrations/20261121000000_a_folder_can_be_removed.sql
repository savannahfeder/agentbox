-- A FOLDER CAN BE REMOVED.
--
-- A removed folder keeps its row, marked gone, rather than being deleted: the
-- computer that made it would otherwise send it back up, and putting it back
-- must find its files' places still naming it. Newest `at` wins, as for a rename,
-- so the existing update policy already says who may remove one.
--
-- Safe to run twice.

alter table public.file_folders add column if not exists gone boolean not null default false;
