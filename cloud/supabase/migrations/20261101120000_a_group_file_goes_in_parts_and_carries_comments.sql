-- A GROUP'S FILE GOES IN PARTS AND CARRIES ITS COMMENTS.
--
-- A file over one room file goes as 8 MB parts and a short list under its own
-- name (shared/room-file-parts.mjs), so a 200 MB film is 26 rows: the files
-- limit is raised to take one film and the files around it.
--
-- Comments, replies, resolves and approvals on a room's files, as
-- thread_file_marks keeps them for a shared thread. The id comes from the
-- writer's copy, so a mark sent twice lands once, and nobody believes a mark
-- they read: every copy cleans it (shared/artifact-marks.mjs, cleanMark).
--
-- Safe to run twice.

create or replace function public.room_file_made() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.room_limit('files', 80, interval '10 minutes');
  new.created_at := now();
  return new;
end $$;

create table if not exists public.room_file_marks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  by_person uuid not null default auth.uid() references public.people(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  mark jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, by_person, id),
  constraint room_file_mark_is_not_huge check (pg_column_size(mark) <= 24000)
);
create index if not exists room_file_marks_room on public.room_file_marks (room_id, created_at);

alter table public.room_file_marks enable row level security;

drop policy if exists room_file_marks_read on public.room_file_marks;
create policy room_file_marks_read on public.room_file_marks for select using (public.in_room(room_id));
drop policy if exists room_file_marks_write on public.room_file_marks;
create policy room_file_marks_write on public.room_file_marks for insert with check (
  by_person = auth.uid()
  and public.in_room(room_id)
);

revoke all on public.room_file_marks from anon, public;
grant select, insert on public.room_file_marks to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.room_file_marks;
exception when duplicate_object then null; when undefined_object then null; end $$;
