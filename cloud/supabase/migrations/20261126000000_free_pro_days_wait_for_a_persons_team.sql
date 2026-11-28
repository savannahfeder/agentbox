-- FREE PRO DAYS CAN WAIT FOR A PERSON'S TEAM (2026-11-26).
--
-- Free days are set on a team (team_plans.free_until), so someone let in
-- before they have made a team had nothing to put them on. Days given to an
-- email wait here, and become free Pro on the first team that person makes,
-- counted from the day they make it. Set by hand, only when the owner asks:
--
--   insert into public.free_pro_people (email, days) values ('them@company.com', 7) on conflict do nothing;
--   See who is waiting: select * from public.free_pro_people where used_at is null;
--
-- Safe to run twice.

create table if not exists public.free_pro_people (
  email text primary key check (email = lower(btrim(email))),
  days int not null check (days > 0),
  added_at timestamptz not null default now(),
  used_at timestamptz,
  team_id uuid references public.teams(id) on delete set null
);
alter table public.free_pro_people enable row level security;
revoke all on public.free_pro_people from public, anon, authenticated;
grant all on public.free_pro_people to service_role;

create or replace function public.free_pro_reaches_a_new_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d int;
begin
  if new.role is distinct from 'owner' then return new; end if;
  update public.free_pro_people f set used_at = now(), team_id = new.team_id
    from auth.users u
    where u.id = new.person_id and u.email_confirmed_at is not null
      and f.email = lower(btrim(u.email)) and f.used_at is null
    returning f.days into d;
  if d is not null then
    insert into public.team_plans (team_id, free_until) values (new.team_id, now() + make_interval(days => d))
      on conflict (team_id) do update set free_until = greatest(public.team_plans.free_until, excluded.free_until);
  end if;
  return new;
end
$$;
revoke all on function public.free_pro_reaches_a_new_team() from public, anon, authenticated;

drop trigger if exists free_pro_reaches_a_new_team on public.team_members;
create trigger free_pro_reaches_a_new_team
  after insert on public.team_members
  for each row execute function public.free_pro_reaches_a_new_team();
