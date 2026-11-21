-- TEAM FEATURES NEED PRO (2026-11-21).
--
-- A team invites people, takes new members and shares threads only while it
-- pays for Pro or is in Pro's free week with a card on file (Stripe's
-- `trialing`). There is no free week without a card, on a call or anywhere
-- else (the owner, 2026-11-21).
--
-- The cloud server keeps `pays` current from each team's bill (Stripe is read
-- there, never here). The rest is set by hand, only when the owner asks:
--   free_until      Pro for free, cloud hours included (cloud/gateway/gateway.mjs teamNow):
--                   insert into public.team_plans (team_id, free_until) values ('<team id>', now() + interval '14 days')
--                     on conflict (team_id) do update set free_until = excluded.free_until;
--   features_until  inviting and sharing only, no cloud hours: the teams let in before this.
--   See who pays:   select t.name, p.* from public.team_plans p join public.teams t on t.id = p.team_id;
--
-- Safe to run twice.

create table if not exists public.team_plans (
  team_id uuid primary key references public.teams(id) on delete cascade,
  pays boolean not null default false,
  status text,
  trial_ends_at timestamptz,
  free_until timestamptz,
  features_until timestamptz,
  rev bigint not null default -1,
  at timestamptz not null default now()
);
alter table public.team_plans add column if not exists features_until timestamptz;
alter table public.team_plans enable row level security;
revoke all on public.team_plans from public, anon, authenticated;
grant all on public.team_plans to service_role;

-- The teams already let into multiplayer had team features for free. They keep
-- inviting and sharing until 2026-12-05, two weeks to start Pro, with no free cloud hours.
insert into public.team_plans (team_id, features_until)
  select id, timestamptz '2026-12-05 00:00:00+00' from public.teams t where public.team_has_multiplayer(t.id)
  on conflict (team_id) do update set features_until = greatest(public.team_plans.features_until, excluded.features_until);

create or replace function public.team_pays(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_plans p where p.team_id = t and (p.pays or p.free_until > now() or p.features_until > now()));
$$;

-- What the app asks to know whether to offer inviting and sharing, or Pro instead.
create or replace function public.my_team_pays() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m where m.person_id = auth.uid() and public.team_pays(m.team_id));
$$;

revoke all on function public.team_pays(uuid), public.my_team_pays() from public, anon, authenticated;
grant execute on function public.my_team_pays() to authenticated;

-- After the invite-only gate and before the daily limit, so a refused invite counts against no limit.
create or replace function public.team_invite_needs_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.team_pays(new.team_id) then
    raise exception 'Inviting teammates needs Pro. Start it in Settings, Team.';
  end if;
  return new;
end
$$;
drop trigger if exists team_invite_a_needs_pro on public.team_invites;
create trigger team_invite_a_needs_pro
  before insert on public.team_invites
  for each row execute function public.team_invite_needs_pro();

-- An invite sent while the team paid is not a way in once it stops. The owner
-- who starts a team is let in.
create or replace function public.team_member_needs_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from 'owner' and not public.team_pays(new.team_id) then
    raise exception 'This team needs Pro to take anyone new. Ask its owner to start it.';
  end if;
  return new;
end
$$;
drop trigger if exists team_member_needs_pro on public.team_members;
create trigger team_member_needs_pro
  before insert on public.team_members
  for each row execute function public.team_member_needs_pro();

-- A team without Pro still shows that you are working, as a private thread's
-- card does, and nothing more. The card is made private rather than refused,
-- so a copy of the app that has not heard yet keeps syncing.
create or replace function public.thread_card_needs_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visible and not public.team_pays(new.team_id) then
    new.visible := false;
    new.title := null; new.project := null; new.problem := null; new.progress := null; new.solution := null;
    new.blocked_by := '[]'::jsonb; new.blocks := '[]'::jsonb; new.task := null;
  end if;
  return new;
end
$$;
drop trigger if exists thread_card_needs_pro on public.thread_cards;
create trigger thread_card_needs_pro
  before insert or update on public.thread_cards
  for each row execute function public.thread_card_needs_pro();

create or replace function public.thread_work_needs_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.team_pays(new.team_id) then
    raise exception 'Sharing threads needs Pro.';
  end if;
  return new;
end
$$;
drop trigger if exists thread_work_needs_pro on public.thread_work;
create trigger thread_work_needs_pro
  before insert or update on public.thread_work
  for each row execute function public.thread_work_needs_pro();
