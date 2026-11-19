-- MULTIPLAYER IS INVITE-ONLY FOR NOW (2026-11-19).
--
-- Anyone signed in could make a team and invite people to it. Now a team
-- invites teammates only when it has multiplayer: it was let in by hand, or
-- one of its owners signs in with an email on the list below. A team on its
-- own still works (a paid plan buys its seats for one), and joining a team
-- you were invited to is unchanged.
--
-- To let someone in:   insert into public.multiplayer_people (email) values ('them@company.com');
-- To open it to all:   insert into public.multiplayer_people (email) values ('*');
--
-- Safe to run twice.

create table if not exists public.multiplayer_people (
  email text primary key check (email = lower(btrim(email))),
  added_at timestamptz not null default now()
);
create table if not exists public.multiplayer_teams (
  team_id uuid primary key references public.teams(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.multiplayer_people enable row level security;
alter table public.multiplayer_teams enable row level security;
revoke all on public.multiplayer_people, public.multiplayer_teams from public, anon, authenticated;
grant all on public.multiplayer_people, public.multiplayer_teams to service_role;

-- Teams made before the gate keep what they had.
insert into public.multiplayer_teams (team_id) select id from public.teams on conflict do nothing;

create or replace function public.email_has_multiplayer(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.multiplayer_people m where m.email in ('*', lower(btrim(e))));
$$;

create or replace function public.team_has_multiplayer(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.multiplayer_teams where team_id = t)
      or exists (
        select 1 from public.team_members m join auth.users u on u.id = m.person_id
        where m.team_id = t and m.role = 'owner' and u.email_confirmed_at is not null
          and public.email_has_multiplayer(u.email)
      )
      or exists (select 1 from public.multiplayer_people where email = '*');
$$;

-- What the app asks to know whether to offer inviting: true when a team you
-- are on has multiplayer, or your own email is on the list.
create or replace function public.i_have_multiplayer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m where m.person_id = auth.uid() and public.team_has_multiplayer(m.team_id))
      or exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null and public.email_has_multiplayer(u.email));
$$;

revoke all on function public.email_has_multiplayer(text), public.team_has_multiplayer(uuid), public.i_have_multiplayer() from public, anon;
grant execute on function public.i_have_multiplayer() to authenticated;

-- Named to fire before team_invite_allowed, so a refused invite counts
-- against no daily limit.
create or replace function public.team_invite_needs_multiplayer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.team_has_multiplayer(new.team_id) then
    raise exception 'Multiplayer is invite-only for now, and this team is not on it yet.';
  end if;
  return new;
end
$$;

drop trigger if exists team_invite_a_needs_multiplayer on public.team_invites;
create trigger team_invite_a_needs_multiplayer
  before insert on public.team_invites
  for each row execute function public.team_invite_needs_multiplayer();
