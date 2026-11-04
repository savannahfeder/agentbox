-- WHO HAS OPENED A CONVERSATION, AND WHEN: one mark per person per row, so the
-- sender can read "Seen by Dev, 1:55pm" under their message.
--
-- The rule is the lines' rule: read on a project you may see, and write only
-- your own mark there. The time is the server's, so a mark cannot be dated.
--
-- Safe to run twice.

create table if not exists public.conversation_reads (
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id text not null check (item_id ~ '^w-[0-9a-f]{10}$'),
  person_id uuid not null default auth.uid() references public.people(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (project_id, item_id, person_id)
);

create or replace function public.conversation_read_stamped() returns trigger
language plpgsql as $$
begin
  new.seen_at := now();
  return new;
end $$;

drop trigger if exists conversation_read_stamped on public.conversation_reads;
create trigger conversation_read_stamped before insert or update on public.conversation_reads
  for each row execute function public.conversation_read_stamped();

alter table public.conversation_reads enable row level security;

drop policy if exists conversation_reads_read on public.conversation_reads;
create policy conversation_reads_read on public.conversation_reads for select using (public.can_see_project(project_id));
drop policy if exists conversation_reads_add on public.conversation_reads;
create policy conversation_reads_add on public.conversation_reads for insert with check (
  person_id = auth.uid() and public.can_see_project(project_id)
);
drop policy if exists conversation_reads_move on public.conversation_reads;
create policy conversation_reads_move on public.conversation_reads for update
  using (person_id = auth.uid())
  with check (person_id = auth.uid() and public.can_see_project(project_id));

revoke all on public.conversation_reads from anon;
grant select, insert, update on public.conversation_reads to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.conversation_reads;
exception when duplicate_object then null; end $$;
