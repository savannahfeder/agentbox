-- THE FILES A CONVERSATION'S MESSAGES LINK TO (w-140ac855b1, 2026-10-13).
--
-- A picture pasted into a message is saved on the sender's Mac and the message
-- links to it. Only the line used to come here, so every picture sent to a
-- teammate arrived as "missing image". The sender's Mac now puts the file here
-- before the line, and the reader's Mac takes it down (main/team/sync.mts).
--
-- The same doors as a line: whoever may see the project reads and adds, as
-- themselves. A name is stored once and never changed or deleted, so nobody
-- can swap the picture under a message somebody else already read.
create table if not exists public.message_files (
  project_id uuid not null references public.projects(id) on delete cascade,
  -- A plain name, the one in the message's link. The app writes it into a
  -- folder on the reader's Mac, so it may carry no path.
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  by_person uuid not null references public.people(id),
  -- The bytes, as base64. Ten megabytes of file is just under 14 million.
  data text not null check (length(data) <= 14000000),
  created_at timestamptz not null default now(),
  primary key (project_id, name)
);

alter table public.message_files enable row level security;

drop policy if exists message_files_read on public.message_files;
create policy message_files_read on public.message_files for select using (public.can_see_project(project_id));
drop policy if exists message_files_add on public.message_files;
create policy message_files_add on public.message_files for insert with check (
  by_person = auth.uid() and public.can_see_project(project_id)
);

grant select, insert on public.message_files to authenticated;
revoke all on public.message_files from anon;
grant select, insert, update, delete on public.message_files to service_role;
