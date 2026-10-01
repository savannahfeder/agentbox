-- THREAD CARDS: what a teammate sees of your threads (approved 2026-10-01).
--
-- Visibility moved from the project to the thread. Teammates no longer join
-- your projects to see your work; each Mac publishes one card per thread
-- instead, carrying exactly the summary the thread already has (state,
-- priority, project name, problem, progress, solution, what blocks it and what
-- it blocks) and nothing else. A private thread publishes a card with no words
-- at all, so the Team board can still show that you are working.
--
-- The database refuses words on a private card, so a bug in the app cannot
-- leak a private title: the check below fails the write.
create table if not exists public.thread_cards (
  person_id uuid not null references public.people(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  thread_id text not null,
  visible boolean not null default true,
  title text,
  project text,
  state text not null check (state in ('waiting', 'running', 'scheduled', 'done')),
  priority int,
  problem text,
  progress text,
  solution text,
  blocked_by jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (person_id, thread_id),
  constraint private_cards_have_no_words check (
    visible or (title is null and project is null and problem is null and progress is null and solution is null
      and blocked_by = '[]'::jsonb and blocks = '[]'::jsonb)
  )
);

alter table public.thread_cards enable row level security;

create policy cards_read on public.thread_cards for select using (team_id in (select public.my_teams()));
create policy cards_write on public.thread_cards for insert with check (person_id = auth.uid() and team_id in (select public.my_teams()));
create policy cards_update on public.thread_cards for update using (person_id = auth.uid()) with check (person_id = auth.uid() and team_id in (select public.my_teams()));
create policy cards_delete on public.thread_cards for delete using (person_id = auth.uid());

grant select, insert, update, delete on public.thread_cards to authenticated, service_role;
revoke all on public.thread_cards from anon;

alter publication supabase_realtime add table public.thread_cards;

-- A MESSAGE THREAD between two people is a shared record of its own, visible
-- to the two of them only. The flag keeps it out of every project list.
alter table public.projects add column if not exists direct boolean not null default false;
