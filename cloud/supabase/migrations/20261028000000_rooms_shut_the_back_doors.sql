-- ROOMS SHUT THE BACK DOORS (w-4008458eae, 2026-10-24). Three ways into or out
-- of a room that the first rooms migrations left open, all found in PGlite with
-- every migration applied (tests/a-room-takes-no-one-back-and-shows-strangers-nothing-private):
--
--   1. A removed member walked back in. join_room_by_link read only the token
--      and accept_room_invite only the room and email, so a link or a pending
--      invite outlived its maker leaving the room. room_preview already refused
--      to name an inviter who had left; the two paths now agree, and leaving
--      revokes the leaver's links and drops the invites still waiting for them.
--   2. Any member, a link-joined stranger included, read every invited email:
--      room_invites_read was `in_room`. The app only ever reads invites it sent.
--   3. The internal helpers were revoked only from public and anon. A project on
--      Supabase's stock `grant all on functions to ... authenticated` default
--      kept them callable, as phone_inbox already guards against for its own.
--
-- Safe to run twice; an app from before this keeps working on it.

-- ---------------------------------------------------------------- a removed member stays out

-- A link works only while the person who made it is still in the room.
create or replace function public.join_room_by_link(tok text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid; maker uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select room_id, created_by into r, maker from public.room_links where token = tok and revoked_at is null;
  if r is null or maker is null or r not in (select public.rooms_of(maker)) then
    raise exception 'that invite link does not work any more';
  end if;
  if exists (select 1 from public.rooms where id = r and kind = 'group') then raise exception 'a group is joined by being added'; end if;
  if exists (select 1 from public.rooms where id = r and invite_only) then raise exception 'that room takes only people its members invite'; end if;
  return public.join_into(r);
end $$;

-- An invite works only while the person who sent it is still in the room.
create or replace function public.accept_room_invite(r uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := public.my_email(); inviter uuid;
begin
  if e is null then raise exception 'sign in with a confirmed email to join a room'; end if;
  select invited_by into inviter from public.room_email_invites where room_id = r and email = e and accepted_at is null;
  if not found or inviter is null or r not in (select public.rooms_of(inviter)) then
    raise exception 'there is no invite to that room for you';
  end if;
  update public.room_email_invites set accepted_at = now() where room_id = r and email = e and accepted_at is null;
  return public.join_into(r);
end $$;

-- Leaving a room takes the leaver's own way back with them: the link they made
-- is revoked, and the invite still waiting for them is dropped. Covers both a
-- member leaving and remove_room_member, which both delete from room_members.
create or replace function public.room_membership_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare r uuid; p uuid;
begin
  if tg_op = 'DELETE' then r := old.room_id; p := old.person_id; else r := new.room_id; p := new.person_id; end if;
  if exists (select 1 from public.rooms where id = r) then
    insert into public.room_events (room_id, kind, person_id) values (r, case when tg_op = 'DELETE' then 'left' else 'joined' end, p);
  end if;
  insert into public.access_events (person_id) select p where exists (select 1 from public.people where id = p);
  if tg_op = 'DELETE' then
    update public.room_links set revoked_at = now() where room_id = r and created_by = p and revoked_at is null;
    delete from public.room_email_invites where room_id = r and accepted_at is null
      and email = (select lower(u.email) from auth.users u where u.id = p);
  end if;
  if tg_op = 'DELETE' and exists (select 1 from public.rooms where id = r and team_id is null) then
    if not exists (select 1 from public.room_members where room_id = r) then
      delete from public.rooms where id = r and not listed;
    elsif old.role = 'owner' and not exists (select 1 from public.room_members where room_id = r and role = 'owner') then
      update public.room_members set role = 'owner'
      where room_id = r and person_id = (select person_id from public.room_members where room_id = r order by joined_at, person_id limit 1);
    end if;
  end if;
  return null;
end $$;

-- Taken off a team, taken off the back doors to its rooms the same way.
create or replace function public.team_membership_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid; p uuid;
begin
  if tg_op = 'DELETE' then t := old.team_id; p := old.person_id; else t := new.team_id; p := new.person_id; end if;
  insert into public.room_events (room_id, kind, person_id)
    select id, case when tg_op = 'DELETE' then 'left' else 'joined' end, p from public.rooms where team_id = t;
  insert into public.access_events (person_id) select p where exists (select 1 from public.people where id = p);
  if tg_op = 'DELETE' then
    update public.room_links set revoked_at = now()
      where created_by = p and revoked_at is null and room_id in (select id from public.rooms where team_id = t);
    delete from public.room_email_invites where accepted_at is null
      and email = (select lower(u.email) from auth.users u where u.id = p)
      and room_id in (select id from public.rooms where team_id = t);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- only the sender or the owner reads an invite

drop policy if exists room_invites_read on public.room_email_invites;
create policy room_invites_read on public.room_email_invites for select
  using (invited_by = auth.uid() or public.owns_room(room_id));

-- ---------------------------------------------------------------- the internal helpers are no one's to call

-- Revoked from authenticated too, so the stock default grant cannot leave them
-- open. The public API RPCs keep their grants from the rooms migrations.
do $$
declare f text;
begin
  foreach f in array array[
    'public.rooms_of(uuid)', 'public.room_member_count(uuid)', 'public.room_limit(text, int, interval)',
    'public.room_act(text, int, interval)', 'public.join_into(uuid)', 'public.my_email()',
    'public.room_message_made()', 'public.room_invite_made()', 'public.room_row_stamped()', 'public.room_made_now()',
    'public.room_membership_moved()', 'public.team_membership_moved()', 'public.room_renamed()', 'public.team_room_kept()',
    'public.room_message_is_new()', 'public.room_file_made()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
