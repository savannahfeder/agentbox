-- AGENTBOX FOR TEAMS: THE SHARED PART.
--
-- The app keeps every project as a ledger of lines on each person's Mac. A
-- shared project's lines also live here, so every teammate's Mac can pull the
-- lines it has not seen. Nothing else about a project is here: its folders,
-- its code and its documents stay on the Macs.
--
-- Private projects never reach this database. For the Team page they publish
-- one title-free line per open task (private_activity): who, what state, when
-- it moved. Never its title, never its project.
--
-- Every table is behind row level security. A person sees only their team, and
-- only the shared projects they are on.

create extension if not exists pgcrypto;

-- People. One row per signed-in person, made from their Google profile.
create table if not exists public.people (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- A team, and who is on it. One team for now; the tables allow more.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.people(id),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, person_id)
);

-- An email invited to a team. Signing in with that email joins the team.
create table if not exists public.team_invites (
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  invited_by uuid references public.people(id),
  created_at timestamptz not null default now(),
  primary key (team_id, email)
);

-- A shared project. Its id is the id in project.json on every Mac.
create table if not exists public.projects (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  visibility text not null default 'team' check (visibility in ('team', 'people')),
  created_by uuid not null references public.people(id),
  created_at timestamptz not null default now()
);

-- Who is on a project shared with specific people. Ignored for 'team'.
create table if not exists public.project_people (
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (project_id, person_id)
);

-- The ledger lines of shared projects. `uid` is the line's own id, so a line
-- pushed twice is stored once. `seq` is the order the server saw them in,
-- which is what a Mac pulls by.
create table if not exists public.lines (
  seq bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  uid text not null unique,
  by_person uuid not null references public.people(id),
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists lines_project_seq on public.lines (project_id, seq);

-- The Team page's view of private work: no title, no project.
create table if not exists public.private_activity (
  person_id uuid not null references public.people(id) on delete cascade,
  task_key text not null,
  state text not null check (state in ('run', 'wait', 'sched', 'done')),
  moved_at timestamptz not null,
  primary key (person_id, task_key)
);

-- WHO MAY SEE WHAT. Security definer so the policies can ask without
-- recursing through each other's row level security.
create or replace function public.my_teams() returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where person_id = auth.uid()
$$;

create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p
      and pr.team_id in (select public.my_teams())
      and (pr.visibility = 'team'
           or pr.created_by = auth.uid()
           or exists (select 1 from public.project_people pp
                      where pp.project_id = p and pp.person_id = auth.uid()))
  )
$$;

alter table public.people enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_people enable row level security;
alter table public.lines enable row level security;
alter table public.private_activity enable row level security;

-- People: yourself, and anyone on a team with you.
create policy people_read on public.people for select using (
  id = auth.uid() or id in (select person_id from public.team_members where team_id in (select public.my_teams()))
);
create policy people_update_self on public.people for update using (id = auth.uid());

-- Teams: the ones you are on. Anyone signed in may start one.
create policy teams_read on public.teams for select using (id in (select public.my_teams()));
create policy teams_create on public.teams for insert with check (created_by = auth.uid());

create policy members_read on public.team_members for select using (team_id in (select public.my_teams()));
-- You may add yourself to a team you made (its first owner); everyone else
-- joins through an invite, by the function below.
create policy members_self_owner on public.team_members for insert with check (
  person_id = auth.uid() and team_id in (select id from public.teams where created_by = auth.uid())
);

create policy invites_read on public.team_invites for select using (team_id in (select public.my_teams()));
create policy invites_create on public.team_invites for insert with check (
  team_id in (select public.my_teams()) and invited_by = auth.uid()
);

-- Projects: create in your team; read what you may see; change what you made.
create policy projects_read on public.projects for select using (public.can_see_project(id));
create policy projects_create on public.projects for insert with check (
  created_by = auth.uid() and team_id in (select public.my_teams())
);
create policy projects_update on public.projects for update using (created_by = auth.uid());

create policy project_people_read on public.project_people for select using (public.can_see_project(project_id));
create policy project_people_write on public.project_people for insert with check (
  project_id in (select id from public.projects where created_by = auth.uid())
);
create policy project_people_remove on public.project_people for delete using (
  project_id in (select id from public.projects where created_by = auth.uid())
);

-- Lines: read and add on projects you may see, always as yourself. Never
-- changed or deleted: a ledger only grows.
create policy lines_read on public.lines for select using (public.can_see_project(project_id));
create policy lines_add on public.lines for insert with check (
  by_person = auth.uid() and public.can_see_project(project_id)
);

-- Private activity: your team reads it; you write only your own.
create policy activity_read on public.private_activity for select using (
  person_id in (select person_id from public.team_members where team_id in (select public.my_teams()))
);
create policy activity_write on public.private_activity for insert with check (person_id = auth.uid());
create policy activity_update on public.private_activity for update using (person_id = auth.uid());
create policy activity_delete on public.private_activity for delete using (person_id = auth.uid());

-- A new sign-in becomes a person, named from their Google profile.
create or replace function public.person_from_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.people (id, email, name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists person_from_sign_in on auth.users;
create trigger person_from_sign_in after insert on auth.users
  for each row execute function public.person_from_sign_in();

-- Join every team that invited your email. Called by the app after sign-in.
create or replace function public.accept_invites() returns setof uuid
language plpgsql security definer set search_path = public as $$
declare me_email text;
begin
  select email into me_email from public.people where id = auth.uid();
  if me_email is null then return; end if;
  insert into public.team_members (team_id, person_id)
    select team_id, auth.uid() from public.team_invites where lower(email) = lower(me_email)
    on conflict do nothing;
  return query select team_id from public.team_members where person_id = auth.uid();
end $$;

-- New lines reach the other Macs as they are written.
alter publication supabase_realtime add table public.lines;
alter publication supabase_realtime add table public.private_activity;
