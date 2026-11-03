-- A SHARED THREAD'S WORK: ITS MESSAGES, THE FILES THEY LINK TO, AND COMMENTS.
--
-- A teammate's thread used to open as its summary card and nothing else. The
-- owner's computer now publishes the newest messages and copies of the files
-- they name, and whoever can read the card can comment.
--
-- ONE RULE, AND IT IS THE CARD'S. Each policy below asks whether the reader can
-- see the card row, and that select runs under the card's own read policy
-- (20261001000800_chosen_people.sql). So a thread shared with chosen people
-- reaches only them, and leaving the team ends it, with no second list to drift.
--
-- A THREAD MADE PRIVATE IS TAKEN BACK BY THE DATABASE. Its card is deleted, and
-- the foreign keys delete the work, the files and the comments with it.
--
-- Safe to run twice.

create table if not exists public.thread_work (
  person_id uuid not null,
  thread_id text not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  hash text not null,
  work jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (person_id, thread_id),
  foreign key (person_id, thread_id) references public.thread_cards(person_id, thread_id) on delete cascade,
  constraint thread_work_is_not_huge check (pg_column_size(work) <= 1000000)
);

create table if not exists public.thread_work_files (
  person_id uuid not null,
  thread_id text not null,
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  data text not null check (char_length(data) <= 14000000),
  created_at timestamptz not null default now(),
  primary key (person_id, thread_id, name),
  foreign key (person_id, thread_id) references public.thread_cards(person_id, thread_id) on delete cascade
);

create table if not exists public.thread_comments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  thread_id text not null,
  by_person uuid not null default auth.uid() references public.people(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (owner, thread_id) references public.thread_cards(person_id, thread_id) on delete cascade
);
create index if not exists thread_comments_of_a_thread on public.thread_comments (owner, thread_id);

alter table public.thread_work enable row level security;
alter table public.thread_work_files enable row level security;
alter table public.thread_comments enable row level security;

-- WORK: read while the card is readable; written only by the owner of a card that
-- is on a team they are on.
drop policy if exists thread_work_read on public.thread_work;
create policy thread_work_read on public.thread_work for select using (
  exists (select 1 from public.thread_cards c where c.person_id = thread_work.person_id and c.thread_id = thread_work.thread_id)
);
drop policy if exists thread_work_write on public.thread_work;
create policy thread_work_write on public.thread_work for insert with check (
  person_id = auth.uid() and team_id in (select public.my_teams())
);
drop policy if exists thread_work_update on public.thread_work;
create policy thread_work_update on public.thread_work for update using (person_id = auth.uid())
  with check (person_id = auth.uid() and team_id in (select public.my_teams()));
drop policy if exists thread_work_delete on public.thread_work;
create policy thread_work_delete on public.thread_work for delete using (person_id = auth.uid());

-- FILES: the same, each name written once.
drop policy if exists thread_work_files_read on public.thread_work_files;
create policy thread_work_files_read on public.thread_work_files for select using (
  exists (select 1 from public.thread_cards c where c.person_id = thread_work_files.person_id and c.thread_id = thread_work_files.thread_id)
);
drop policy if exists thread_work_files_write on public.thread_work_files;
create policy thread_work_files_write on public.thread_work_files for insert with check (person_id = auth.uid());
drop policy if exists thread_work_files_delete on public.thread_work_files;
create policy thread_work_files_delete on public.thread_work_files for delete using (person_id = auth.uid());

-- COMMENTS: read and written while the card is readable, signed by whoever wrote
-- them. Never edited; gone with the card.
drop policy if exists thread_comments_read on public.thread_comments;
create policy thread_comments_read on public.thread_comments for select using (
  exists (select 1 from public.thread_cards c where c.person_id = thread_comments.owner and c.thread_id = thread_comments.thread_id)
);
drop policy if exists thread_comments_write on public.thread_comments;
create policy thread_comments_write on public.thread_comments for insert with check (
  by_person = auth.uid()
  and exists (select 1 from public.thread_cards c where c.person_id = thread_comments.owner and c.thread_id = thread_comments.thread_id)
);

revoke all on public.thread_work, public.thread_work_files, public.thread_comments from anon;
grant select, insert, update, delete on public.thread_work to authenticated, service_role;
grant select, insert, delete on public.thread_work_files to authenticated, service_role;
grant select, insert on public.thread_comments to authenticated, service_role;

-- So a comment wakes its owner at once. The work itself is picked up by the
-- sync: realtime carries whole rows, and these are large.
do $$ begin
  alter publication supabase_realtime add table public.thread_comments;
exception when duplicate_object then null; end $$;
