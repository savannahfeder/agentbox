-- YOUR THREADS ON YOUR PHONE, WITH THE COMPUTER CLOSED (docs/cloud/PHONE-PLAN.md, step 1).
--
-- Three tables, each one person's own and nobody else's: not a team's, not a
-- project's. Separate from the team tables on purpose (Codex's review of the
-- plan, finding 4): a personal row never passes through a team rule, so no
-- team policy can widen who reads it.
--
--   phone_projects   the projects she chose to have on her phone, each under
--                    the computer it lives on (`device`), so two computers on
--                    one account never overwrite each other's project of the
--                    same name (Codex's review of step 1, finding 4);
--   phone_threads    one readable copy of each of their threads, written by
--                    that computer, read by her phone (plan finding 5: the
--                    phone never folds raw ledger lines);
--   phone_commands   what she does on her phone (reply, start a thread,
--                    snooze, close), each with its own id, left for the one
--                    computer the project lives on, waiting until it takes it
--                    through the app's own reply path (plan findings 6, 7).
--
-- A COMMAND IS WRITTEN ONCE AND MARKED TAKEN ONCE (step 1 review, finding 5).
-- Nothing but its two "taken" columns may ever change, those only from empty
-- to set, and never back: a phone cannot rewrite what it asked for after the
-- computer read it, nor unmark a command to have it done twice. A trigger
-- holds that whatever the grants say, because a Supabase project made before
-- 2025 grants every new table to every role by default, and a column grant
-- added on top of that takes nothing away.

create table if not exists public.phone_projects (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  device text not null check (device ~ '^[0-9a-f]{12}$'),
  project text not null check (length(project) between 1 and 120),
  name text not null check (length(name) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (owner, device, project)
);

create table if not exists public.phone_threads (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  device text not null check (device ~ '^[0-9a-f]{12}$'),
  project text not null check (length(project) between 1 and 120),
  item text not null check (length(item) between 1 and 80),
  -- The thread as that computer last saw it (shared/phone-snapshot.mjs): its
  -- title, state and conversation. A megabyte at most.
  snapshot jsonb not null check (octet_length(snapshot::text) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (owner, device, project, item),
  foreign key (owner, device, project) references public.phone_projects (owner, device, project) on delete cascade
);
create index if not exists phone_threads_recent on public.phone_threads (owner, updated_at desc);

create table if not exists public.phone_commands (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  device text not null check (device ~ '^[0-9a-f]{12}$'),
  project text not null check (length(project) between 1 and 120),
  -- Absent only for a new thread.
  item text check (item is null or length(item) between 1 and 80),
  kind text not null check (kind in ('reply', 'new', 'snooze', 'close')),
  payload jsonb not null default '{}' check (octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  -- Set by the computer once it has done it (or refused it, and why).
  taken_at timestamptz,
  outcome text check (outcome is null or length(outcome) <= 300),
  check ((taken_at is null) = (outcome is null))
);
create index if not exists phone_commands_waiting on public.phone_commands (owner, device, created_at) where taken_at is null;

-- Dated by the database, never by the phone, and never born taken.
create or replace function public.phone_command_made() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.taken_at := null;
  new.outcome := null;
  return new;
end $$;
drop trigger if exists phone_command_made on public.phone_commands;
create trigger phone_command_made before insert on public.phone_commands
  for each row execute function public.phone_command_made();

-- Marked taken once, and nothing else about it ever changes.
create or replace function public.phone_command_taken() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.taken_at is not null then
    raise exception 'this command was already taken';
  end if;
  if new.taken_at is null or new.outcome is null then
    raise exception 'a command is only ever marked taken';
  end if;
  if (new.id, new.owner, new.device, new.project, new.item, new.kind, new.payload, new.created_at)
     is distinct from (old.id, old.owner, old.device, old.project, old.item, old.kind, old.payload, old.created_at) then
    raise exception 'a command cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists phone_command_taken on public.phone_commands;
create trigger phone_command_taken before update on public.phone_commands
  for each row execute function public.phone_command_taken();

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

-- A command is added and read by its owner, and marked taken by them. It is
-- never deleted by anyone signed in: it goes with its owner.
drop policy if exists phone_commands_read on public.phone_commands;
create policy phone_commands_read on public.phone_commands for select using (owner = auth.uid());
drop policy if exists phone_commands_add on public.phone_commands;
create policy phone_commands_add on public.phone_commands for insert
  with check (owner = auth.uid());
drop policy if exists phone_commands_take on public.phone_commands;
create policy phone_commands_take on public.phone_commands for update
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Everything any default gave, taken away first; then exactly what is needed.
revoke all on public.phone_projects, public.phone_threads, public.phone_commands from public, anon, authenticated;
grant select, insert, update, delete on public.phone_projects to authenticated;
grant select, insert, update, delete on public.phone_threads to authenticated;
grant select on public.phone_commands to authenticated;
grant insert (device, project, item, kind, payload) on public.phone_commands to authenticated;
grant update (taken_at, outcome) on public.phone_commands to authenticated;
grant all on public.phone_projects, public.phone_threads, public.phone_commands to service_role;
revoke all on function public.phone_command_made(), public.phone_command_taken() from public, anon, authenticated;

-- The computer hears a command the moment the phone sends it; the phone hears
-- a thread change the moment the computer writes it. Realtime reads under
-- the same row level security, so each hears only their own.
alter publication supabase_realtime add table public.phone_commands;
alter publication supabase_realtime add table public.phone_threads;
