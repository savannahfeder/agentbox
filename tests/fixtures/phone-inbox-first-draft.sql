-- YOUR THREADS ON YOUR PHONE, WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
--
-- Three tables, each one person's own and nobody else's: not a team's, not a
-- project's. Separate from the team tables on purpose (Codex's review of the
-- plan, finding 4): a personal row never passes through a team rule, so no
-- team policy can widen who reads it.
--
--   phone_projects   the projects she chose to have on her phone;
--   phone_threads    one readable copy of each of their threads, written by
--                    her Mac, read by her phone (finding 5: the phone never
--                    folds raw ledger lines);
--   phone_commands   what she does on her phone (reply, start a thread,
--                    snooze, close), each with its own id, waiting until her
--                    Mac takes it through the app's own reply path (findings
--                    6, 7). The phone writes these and nothing else.

create table if not exists public.phone_projects (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  project text not null check (length(project) between 1 and 120),
  name text not null check (length(name) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (owner, project)
);

create table if not exists public.phone_threads (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  project text not null check (length(project) between 1 and 120),
  item text not null check (length(item) between 1 and 80),
  -- The thread as her Mac last saw it (shared/phone-snapshot.mjs): its
  -- title, state and conversation. A megabyte at most.
  snapshot jsonb not null check (octet_length(snapshot::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (owner, project, item)
);
create index if not exists phone_threads_recent on public.phone_threads (owner, updated_at desc);

create table if not exists public.phone_commands (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  project text not null check (length(project) between 1 and 120),
  -- Absent only for a new thread.
  item text check (item is null or length(item) between 1 and 80),
  kind text not null check (kind in ('reply', 'new', 'snooze', 'close')),
  payload jsonb not null default '{}' check (octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  -- Set by her Mac once it has done it (or refused it, and why).
  taken_at timestamptz,
  outcome text check (outcome is null or length(outcome) <= 300)
);
create index if not exists phone_commands_waiting on public.phone_commands (owner, created_at) where taken_at is null;

alter table public.phone_projects enable row level security;
alter table public.phone_threads enable row level security;
alter table public.phone_commands enable row level security;

-- Each row is its owner's: read, written and removed by them alone.
drop policy if exists phone_projects_own on public.phone_projects;
create policy phone_projects_own on public.phone_projects for all
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists phone_threads_own on public.phone_threads;
create policy phone_threads_own on public.phone_threads for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- A command is added and read by its owner. Marking one taken is the only
-- change ever made to it, and only the two columns that say so may change.
drop policy if exists phone_commands_read on public.phone_commands;
create policy phone_commands_read on public.phone_commands for select using (owner = auth.uid());
drop policy if exists phone_commands_add on public.phone_commands;
create policy phone_commands_add on public.phone_commands for insert
  with check (owner = auth.uid() and taken_at is null and outcome is null);
drop policy if exists phone_commands_take on public.phone_commands;
create policy phone_commands_take on public.phone_commands for update
  using (owner = auth.uid()) with check (owner = auth.uid());

grant select, insert, update, delete on public.phone_projects to authenticated;
grant select, insert, update, delete on public.phone_threads to authenticated;
grant select, insert on public.phone_commands to authenticated;
grant update (taken_at, outcome) on public.phone_commands to authenticated;
revoke all on public.phone_projects, public.phone_threads, public.phone_commands from anon;
grant all on public.phone_projects, public.phone_threads, public.phone_commands to service_role;

-- The Mac hears a command the moment the phone sends it; the phone hears a
-- thread change the moment the Mac writes it.
alter publication supabase_realtime add table public.phone_commands;
alter publication supabase_realtime add table public.phone_threads;
