-- A TEAM'S FOLDERS, AND WHERE ITS FILES SIT.
--
-- A folder says who reads it: everyone on the team, or chosen people. A folder in
-- a project only its owner sees is never sent here (main/files-place.mjs).
--
-- A file's place hangs on a card, as thread_file_marks does: only those who may
-- read the thread read it, and taking the thread private deletes it. The family
-- is the file's identity in the project (shared/artifact-marks.mjs), so a new
-- version stays where it is.
--
-- `at` is the writer's clock, because each copy keeps the newest word it has seen
-- and a folder can be changed on a computer with no connection.
--
-- Safe to run twice.

create table if not exists public.file_folders (
  id text primary key check (char_length(id) between 1 and 64),
  team_id uuid not null references public.teams(id) on delete cascade,
  project text not null check (char_length(project) between 1 and 300),
  name text not null check (char_length(name) between 1 and 120),
  parent text,
  people uuid[],
  created_by uuid not null default auth.uid() references public.people(id) on delete cascade,
  at bigint not null,
  constraint a_folder_is_shared_with_somebody check (people is null or cardinality(people) > 0)
);

alter table public.file_folders enable row level security;

drop policy if exists file_folders_read on public.file_folders;
create policy file_folders_read on public.file_folders for select using (
  team_id in (select public.my_teams())
  and (people is null or created_by = auth.uid() or auth.uid() = any(people))
);
drop policy if exists file_folders_write on public.file_folders;
create policy file_folders_write on public.file_folders for insert with check (
  team_id in (select public.my_teams())
  and created_by = auth.uid()
  and (people is null or auth.uid() = any(people))
);
drop policy if exists file_folders_update on public.file_folders;
create policy file_folders_update on public.file_folders for update using (
  team_id in (select public.my_teams())
  and (people is null or created_by = auth.uid() or auth.uid() = any(people))
) with check (
  team_id in (select public.my_teams())
  and (people is null or auth.uid() = any(people))
);

revoke all on public.file_folders from anon;
grant select, insert, update on public.file_folders to authenticated, service_role;

create table if not exists public.file_places (
  owner uuid not null,
  thread_id text not null,
  family text not null check (char_length(family) between 1 and 400),
  project text not null check (char_length(project) between 1 and 300),
  folder text references public.file_folders(id) on delete set null,
  by_person uuid not null default auth.uid() references public.people(id) on delete cascade,
  at bigint not null,
  primary key (owner, thread_id, family),
  foreign key (owner, thread_id) references public.thread_cards(person_id, thread_id) on delete cascade
);

alter table public.file_places enable row level security;

drop policy if exists file_places_read on public.file_places;
create policy file_places_read on public.file_places for select using (
  exists (select 1 from public.thread_cards c where c.person_id = file_places.owner and c.thread_id = file_places.thread_id)
);
-- Each policy asks through the reader's own view of the folders and the cards, so
-- a place cannot name a folder or a thread its writer may not read.
drop policy if exists file_places_write on public.file_places;
create policy file_places_write on public.file_places for insert with check (
  by_person = auth.uid()
  and exists (select 1 from public.thread_cards c where c.person_id = file_places.owner and c.thread_id = file_places.thread_id)
  and (folder is null or exists (select 1 from public.file_folders f where f.id = file_places.folder))
);
drop policy if exists file_places_update on public.file_places;
create policy file_places_update on public.file_places for update using (
  exists (select 1 from public.thread_cards c where c.person_id = file_places.owner and c.thread_id = file_places.thread_id)
) with check (
  by_person = auth.uid()
  and (folder is null or exists (select 1 from public.file_folders f where f.id = file_places.folder))
);

revoke all on public.file_places from anon;
grant select, insert, update on public.file_places to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.file_folders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.file_places;
exception when duplicate_object then null; end $$;
