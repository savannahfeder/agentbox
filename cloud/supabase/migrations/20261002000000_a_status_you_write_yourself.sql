-- A STATUS LINE YOU WRITE YOURSELF.
--
-- The founder, 2026-10-01: "If I'm going to spend a day or a few days in
-- meetings, I don't want the board to make it seem like I'm not doing any
-- work." Four of six people interviewed asked for the same thing, so a person
-- carries one short line they wrote, and their teammates read it beside their
-- face.
--
-- It is two columns on the person, not a table of its own: there is exactly
-- one per person, it is replaced rather than accumulated, and people_read
-- already says who may read a person (yourself, and anyone on a team with
-- you). A stranger therefore cannot read it, with no new policy to get wrong.
--
-- WHO CLEARS IT WHEN IT LAPSES. Nobody has to. Everything that draws a status
-- goes through shared/team-status.mjs, which reads an expired one as nothing,
-- so it disappears on the reader's own clock whether or not the writer's Mac
-- is awake. The owner's Mac also wipes the row on its next sync after the
-- time passes, so old text does not sit here for good. That is tidying.

alter table public.people add column if not exists status_text text;
alter table public.people add column if not exists status_until timestamptz;

-- One line, and the app cuts it to 80 before it gets here. The database says
-- so too, so a client with a bug cannot put a paragraph on somebody's face.
alter table public.people drop constraint if exists people_status_text_is_one_line;
alter table public.people add constraint people_status_text_is_one_line
  check (status_text is null or (length(status_text) <= 80 and status_text !~ '[\n\r]'));

-- THE GRANT IS PER COLUMN, WHICH IS WHY A NEW COLUMN NEEDS ONE.
-- 20261001000500_security.sql revoked update on people and granted it back
-- for exactly (name, avatar_url), so "people change their name and face,
-- nothing else". A status is the third thing they may change about
-- themselves, and without this line every write answers "permission denied
-- for table people" however right the policy is. people_update_self already
-- carries both using and with check, so the row stays yours at both ends.
grant update (status_text, status_until) on public.people to authenticated;

-- A status changes without any line being written, so the other Macs need
-- telling the same way they are told about lines and thread cards.
alter publication supabase_realtime add table public.people;
