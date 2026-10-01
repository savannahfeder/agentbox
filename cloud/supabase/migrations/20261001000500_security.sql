-- THE DOORS A REVIEW FOUND OPEN ON 2026-10-01, closed in one place.
--
-- Tested in tests/team-cloud-keeps-each-team-to-itself.test.mjs, which runs
-- every migration in order against an in-process Postgres.
--
--   1. A STRANGER COULD JOIN ANY TEAM. Signed-in people could rewrite every
--      column of their own people row, email included, and accept_invites()
--      matched invites against that column and never used one up. A person may
--      now change only their name and face; an invite is matched against the
--      email the sign-in service confirmed, and it is deleted once accepted.
--   2. A TEAM COULD BE BACKDATED, and the app picked the oldest team you were
--      on, so an attacker who invited you moved your work into their team the
--      next time the app started. created_at is the database's own clock now,
--      and joining is one team at a time, by the person, never at start.
--   4. A MESSAGE THREAD COULD HOLD THREE PEOPLE. Its maker can put anyone on a
--      project, so one could make a "direct" record holding two teammates and
--      read what they said to each other. A direct project now holds its maker
--      and at most one other person.
--   8. A PROJECT COULD BE MOVED INTO A TEAM ITS MAKER IS NOT ON.

-- 1. PEOPLE CHANGE THEIR NAME AND FACE, NOTHING ELSE.
revoke insert, update, delete on public.people from authenticated;
grant update (name, avatar_url) on public.people to authenticated;
drop policy if exists people_update_self on public.people;
create policy people_update_self on public.people for update using (id = auth.uid()) with check (id = auth.uid());

-- The invites waiting for you: those to the email the sign-in service
-- confirmed, for teams you are not already on. Read through this function
-- because the invites table shows its rows to the inviting team only.
create or replace function public.pending_invites()
returns table (team_id uuid, team_name text, invited_by uuid, invited_by_name text)
language sql stable security definer set search_path = public as $$
  select i.team_id, t.name, i.invited_by, p.name
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.people p on p.id = i.invited_by
  where lower(i.email) = (select lower(u.email) from auth.users u
                          where u.id = auth.uid() and u.email_confirmed_at is not null)
    and not exists (select 1 from public.team_members m where m.team_id = i.team_id and m.person_id = auth.uid())
  order by i.created_at
$$;

-- Join ONE team, because the person said yes to its invite. The invite is
-- used up here, so it cannot be spent twice.
create or replace function public.accept_invite(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me_email text;
begin
  select lower(u.email) into me_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if me_email is null then raise exception 'sign in with a confirmed email to join a team'; end if;
  delete from public.team_invites where team_id = p_team and lower(email) = me_email;
  if not found then raise exception 'there is no invite to that team for you'; end if;
  insert into public.team_members (team_id, person_id) values (p_team, auth.uid()) on conflict do nothing;
  return p_team;
end $$;

-- Builds from before this migration call accept_invites() at every start. It
-- now joins nothing and answers the teams you are already on, so an older copy
-- keeps working and can never be pulled into a team without a yes.
create or replace function public.accept_invites() returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where person_id = auth.uid()
$$;

-- 2. A TEAM IS AS OLD AS THE DATABASE SAYS, whatever its maker sent.
create or replace function public.team_made_now() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  return new;
end $$;
drop trigger if exists team_made_now on public.teams;
create trigger team_made_now before insert or update on public.teams
  for each row execute function public.team_made_now();

-- 4. A DIRECT PROJECT IS ITS MAKER AND ONE OTHER PERSON. Its maker always sees
-- it (can_see_project), so project_people may hold one person besides them.
create or replace function public.direct_stays_between_two() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.projects; others int;
begin
  if tg_table_name = 'projects' then
    if new.direct then
      if new.visibility <> 'people' then raise exception 'a message thread is between two people'; end if;
      select count(*) into others from public.project_people where project_id = new.id and person_id <> new.created_by;
      if others > 1 then raise exception 'a message thread is between two people'; end if;
    end if;
    return new;
  end if;
  select * into pr from public.projects where id = new.project_id;
  if pr.direct and new.person_id <> pr.created_by and exists (
    select 1 from public.project_people
    where project_id = new.project_id and person_id <> pr.created_by and person_id <> new.person_id
  ) then
    raise exception 'a message thread is between two people';
  end if;
  return new;
end $$;
drop trigger if exists direct_stays_between_two on public.projects;
create trigger direct_stays_between_two before insert or update on public.projects
  for each row execute function public.direct_stays_between_two();
drop trigger if exists direct_stays_between_two on public.project_people;
create trigger direct_stays_between_two before insert or update on public.project_people
  for each row execute function public.direct_stays_between_two();

-- 8. A PROJECT STAYS IN A TEAM ITS MAKER IS ON.
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (created_by = auth.uid())
  with check (created_by = auth.uid() and team_id in (select public.my_teams()));

grant execute on function public.pending_invites(), public.accept_invite(uuid) to authenticated, service_role;
revoke execute on function public.pending_invites(), public.accept_invite(uuid), public.team_made_now(), public.direct_stays_between_two() from anon, public;
