-- WHAT PEOPLE MARK ON THE FILES OF A SHARED THREAD: comments with their place,
-- resolves, approvals, and who has seen what.
--
-- The rule is the card's, as for thread_work and thread_comments: each policy asks
-- whether the reader can see the card row, so a thread shared with chosen people
-- reaches only them, and taking a thread private deletes these with it.
--
-- The id comes from the writer's copy, so a mark sent twice because the answer was
-- lost lands once. The mark itself is not believed by anyone who reads it: every
-- copy cleans it (shared/artifact-marks.mjs, cleanMark).
--
-- Safe to run twice.

create table if not exists public.thread_file_marks (
  owner uuid not null,
  thread_id text not null,
  by_person uuid not null default auth.uid() references public.people(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  mark jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, thread_id, by_person, id),
  foreign key (owner, thread_id) references public.thread_cards(person_id, thread_id) on delete cascade,
  constraint thread_file_mark_is_not_huge check (pg_column_size(mark) <= 24000)
);

alter table public.thread_file_marks enable row level security;

drop policy if exists thread_file_marks_read on public.thread_file_marks;
create policy thread_file_marks_read on public.thread_file_marks for select using (
  exists (select 1 from public.thread_cards c where c.person_id = thread_file_marks.owner and c.thread_id = thread_file_marks.thread_id)
);
drop policy if exists thread_file_marks_write on public.thread_file_marks;
create policy thread_file_marks_write on public.thread_file_marks for insert with check (
  by_person = auth.uid()
  and exists (select 1 from public.thread_cards c where c.person_id = thread_file_marks.owner and c.thread_id = thread_file_marks.thread_id)
);

revoke all on public.thread_file_marks from anon;
grant select, insert on public.thread_file_marks to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.thread_file_marks;
exception when duplicate_object then null; end $$;
