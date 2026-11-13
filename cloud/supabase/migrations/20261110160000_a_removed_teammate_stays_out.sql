-- A teammate the owner removes stays off the team until a current member
-- invites them again: the rule rooms already keep
-- (20261028000000_rooms_shut_the_back_doors.sql). Any member may invite any
-- email, so without it a member could invite their own addresses first and
-- walk back in after removal.

-- An invite works only while the person who sent it is still on the team.
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
    and exists (select 1 from public.team_members m where m.team_id = i.team_id and m.person_id = i.invited_by)
  order by i.created_at
$$;

create or replace function public.accept_invite(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me_email text;
begin
  select lower(u.email) into me_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if me_email is null then raise exception 'sign in with a confirmed email to join a team'; end if;
  delete from public.team_invites i where i.team_id = p_team and lower(i.email) = me_email
    and exists (select 1 from public.team_members m where m.team_id = p_team and m.person_id = i.invited_by);
  if not found then raise exception 'there is no invite to that team for you'; end if;
  insert into public.team_members (team_id, person_id) values (p_team, auth.uid()) on conflict do nothing;
  return p_team;
end $$;

-- Leaving, or being removed, also drops the team invites the person sent and
-- the ones still waiting for them.
create or replace function public.team_membership_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid; p uuid; leaver_email text;
begin
  if tg_op = 'DELETE' then t := old.team_id; p := old.person_id; else t := new.team_id; p := new.person_id; end if;
  insert into public.room_events (room_id, kind, person_id)
    select id, case when tg_op = 'DELETE' then 'left' else 'joined' end, p from public.rooms where team_id = t;
  insert into public.access_events (person_id) select p where exists (select 1 from public.people where id = p);
  if tg_op = 'DELETE' then
    select lower(u.email) into leaver_email from auth.users u where u.id = p;
    update public.room_links set revoked_at = now()
      where created_by = p and revoked_at is null and room_id in (select id from public.rooms where team_id = t);
    delete from public.room_email_invites where accepted_at is null
      and email = leaver_email
      and room_id in (select id from public.rooms where team_id = t);
    delete from public.team_invites
      where team_id = t and (invited_by = p or lower(email) = leaver_email);
  end if;
  return null;
end $$;
