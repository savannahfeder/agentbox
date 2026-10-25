-- ROOMS (alpha, w-3d0fa23ffb). The design and every rule below are in
-- docs/team/ROOMS-PLAN.md, agreed with Codex over four review passes.
--
-- A room is a wall of people working and a chat beside it. Every team has one
-- room, whose members are the team's members read live from team_members.
-- Other rooms list their members in room_members. Nothing here reads `people`
-- across teams: what a stranger in a room sees of you is your room profile.
--
-- Supabase checks inserts and updates against a subscriber's row policies but
-- not deletes, so no table a client subscribes to is ever deleted from while
-- in use, and membership changes are announced by inserting into room_events
-- and access_events.

-- ---------------------------------------------------------------- tables

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'room' check (kind in ('room', 'group')),
  team_id uuid unique references public.teams(id) on delete cascade,
  listed boolean not null default false,
  -- Joined only by an email invite or being added: no link works for it.
  invite_only boolean not null default false,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  check (not listed or kind = 'room'),
  check (not (listed and invite_only)),
  check (team_id is null or (kind = 'room' and not listed))
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, person_id)
);
create index if not exists room_members_person on public.room_members (person_id);

create table if not exists public.room_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- One live link per person per room, so the link says who invited you.
create unique index if not exists room_links_one_live on public.room_links (room_id, created_by) where revoked_at is null;

create table if not exists public.room_email_invites (
  room_id uuid not null references public.rooms(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  invited_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Kept once used, so whoever sent it sees that they joined.
  accepted_at timestamptz,
  primary key (room_id, email)
);

create table if not exists public.room_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  headline text check (headline is null or char_length(headline) <= 60),
  bio text check (bio is null or char_length(bio) <= 160),
  show_working text not null default 'team' check (show_working in ('none', 'team', 'everyone')),
  show_agents boolean not null default true,
  show_level boolean not null default true,
  show_status boolean not null default true,
  -- Whether teammates see what is waiting, running and done on my page.
  show_activity boolean not null default true,
  invisible_until timestamptz,
  status_text text check (status_text is null or char_length(status_text) <= 80),
  status_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_presence (
  person_id uuid not null references public.people(id) on delete cascade,
  device text not null check (device ~ '^[0-9a-f]{12}$'),
  gone boolean not null default false,
  agents_running int not null default 0 check (agents_running between 0 and 1000),
  working_on text check (working_on is null or char_length(working_on) <= 64),
  working_private boolean not null default false,
  working_at timestamptz,
  hours_total numeric not null default 0 check (hours_total >= 0),
  hours_week numeric not null default 0 check (hours_week >= 0),
  week_start date,
  hours_today numeric not null default 0 check (hours_today >= 0),
  day date,
  streak_days int not null default 0 check (streak_days >= 0),
  active_days date[] not null default '{}' check (cardinality(active_days) <= 60),
  hours_by_month jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (person_id, device)
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  by_person uuid references public.people(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  in_reply_to uuid references public.room_messages(id) on delete set null,
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  created_at timestamptz not null default now()
);
create index if not exists room_messages_room_time on public.room_messages (room_id, created_at desc);
create index if not exists room_messages_by_time on public.room_messages (by_person, created_at desc);

create table if not exists public.room_reads (
  room_id uuid not null references public.rooms(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  read_at timestamptz not null,
  primary key (room_id, person_id)
);

create table if not exists public.room_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind text not null check (kind in ('joined', 'left', 'renamed')),
  person_id uuid,
  at timestamptz not null default now()
);
create index if not exists room_events_room on public.room_events (room_id, at desc);

create table if not exists public.access_events (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists access_events_person on public.access_events (person_id, at desc);

-- ---------------------------------------------------------------- membership

-- Every room a person is in: the ones that list them, and their teams' rooms.
create or replace function public.rooms_of(p uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select room_id from public.room_members where person_id = p
  union
  select r.id from public.rooms r join public.team_members tm on tm.team_id = r.team_id where tm.person_id = p
$$;

create or replace function public.in_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and r in (select public.rooms_of(auth.uid()))
$$;

create or replace function public.shares_room(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.rooms_of(auth.uid()) mine
    join public.rooms_of(p) theirs on theirs = mine
  )
$$;

-- Owner of a room: listed as its owner, or an owner of the team whose room it is.
create or replace function public.owns_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = r and person_id = auth.uid() and role = 'owner')
      or exists (select 1 from public.rooms ro where ro.id = r and ro.team_id is not null and public.owns_team(ro.team_id))
$$;

create or replace function public.room_member_count(r uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select person_id from public.room_members where room_id = r
    union
    select tm.person_id from public.rooms ro join public.team_members tm on tm.team_id = ro.team_id where ro.id = r
  ) everyone
$$;

-- A person is visible while they are not invisible.
create or replace function public.person_visible(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.room_profiles pr where pr.person_id = p and pr.invisible_until is not null and pr.invisible_until > now()
  )
$$;

-- ---------------------------------------------------------------- limits

create or replace function public.room_limit(what text, n int, per interval) returns void
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if what = 'messages' then
    select count(*) into used from public.room_messages where by_person = auth.uid() and created_at > now() - per;
  elsif what = 'rooms' then
    select count(*) into used from public.rooms where created_by = auth.uid() and created_at > now() - per;
  elsif what = 'invites' then
    select count(*) into used from public.room_email_invites where invited_by = auth.uid() and created_at > now() - per;
  elsif what = 'joins' then
    select count(*) into used from public.room_members where person_id = auth.uid() and joined_at > now() - per;
  end if;
  if used >= n then raise exception 'too many % for now; try again later', what; end if;
end $$;

-- ---------------------------------------------------------------- triggers

-- The database's own clock, and the writer named by their sign-in.
create or replace function public.room_message_made() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.room_limit('messages', 20, interval '1 minute');
  new.created_at := now();
  -- Only people in the room can be mentioned.
  new.mentions := coalesce((select array_agg(distinct m) from unnest(new.mentions) m
                            where m in (select person_id from public.room_members where room_id = new.room_id
                                        union select tm.person_id from public.rooms ro join public.team_members tm on tm.team_id = ro.team_id where ro.id = new.room_id)), '{}');
  if new.in_reply_to is not null and not exists (select 1 from public.room_messages where id = new.in_reply_to and room_id = new.room_id) then
    raise exception 'a reply must be to a message in the same room';
  end if;
  return new;
end $$;
-- At most fifty email invites a day from one person.
create or replace function public.room_invite_made() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.room_limit('invites', 50, interval '1 day');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists room_invite_made on public.room_email_invites;
create trigger room_invite_made before insert on public.room_email_invites
  for each row execute function public.room_invite_made();

drop trigger if exists room_message_made on public.room_messages;
create trigger room_message_made before insert on public.room_messages
  for each row execute function public.room_message_made();

create or replace function public.room_row_stamped() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists room_profile_stamped on public.room_profiles;
create trigger room_profile_stamped before insert or update on public.room_profiles
  for each row execute function public.room_row_stamped();
drop trigger if exists room_presence_stamped on public.room_presence;
create trigger room_presence_stamped before insert or update on public.room_presence
  for each row execute function public.room_row_stamped();

create or replace function public.room_made_now() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  if tg_op = 'UPDATE' then
    new.kind := old.kind; new.team_id := old.team_id; new.listed := old.listed; new.created_by := old.created_by;
    new.invite_only := old.invite_only;
  end if;
  return new;
end $$;
drop trigger if exists room_made_now on public.rooms;
create trigger room_made_now before insert or update on public.rooms
  for each row execute function public.room_made_now();

-- Joining and leaving are announced to the room and to the person.
create or replace function public.room_membership_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare r uuid; p uuid;
begin
  if tg_op = 'DELETE' then r := old.room_id; p := old.person_id; else r := new.room_id; p := new.person_id; end if;
  if exists (select 1 from public.rooms where id = r) then
    insert into public.room_events (room_id, kind, person_id) values (r, case when tg_op = 'DELETE' then 'left' else 'joined' end, p);
  end if;
  insert into public.access_events (person_id) select p where exists (select 1 from public.people where id = p);
  -- In a room of its own (not a team's), an owner leaving hands it to the
  -- longest member, and the last one out deletes it unless it is listed.
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
drop trigger if exists room_membership_moved on public.room_members;
create trigger room_membership_moved after insert or delete on public.room_members
  for each row execute function public.room_membership_moved();

create or replace function public.team_membership_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid; p uuid;
begin
  if tg_op = 'DELETE' then t := old.team_id; p := old.person_id; else t := new.team_id; p := new.person_id; end if;
  insert into public.room_events (room_id, kind, person_id)
    select id, case when tg_op = 'DELETE' then 'left' else 'joined' end, p from public.rooms where team_id = t;
  insert into public.access_events (person_id) select p where exists (select 1 from public.people where id = p);
  return null;
end $$;
drop trigger if exists team_membership_moved on public.team_members;
create trigger team_membership_moved after insert or delete on public.team_members
  for each row execute function public.team_membership_moved();

create or replace function public.room_renamed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    insert into public.room_events (room_id, kind, person_id) values (new.id, 'renamed', auth.uid());
  end if;
  return null;
end $$;
drop trigger if exists room_renamed on public.rooms;
create trigger room_renamed after update on public.rooms
  for each row execute function public.room_renamed();

-- Every team has its room, named after it.
create or replace function public.team_room_kept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rooms (name, kind, team_id, created_by) values (left(new.name, 40), 'room', new.id, new.created_by)
      on conflict (team_id) do nothing;
  elsif new.name is distinct from old.name then
    update public.rooms set name = left(new.name, 40) where team_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists team_room_kept on public.teams;
create trigger team_room_kept after insert or update on public.teams
  for each row execute function public.team_room_kept();

-- ---------------------------------------------------------------- what the app calls

create or replace function public.my_rooms()
returns table (id uuid, name text, kind text, team_id uuid, listed boolean, invite_only boolean, role text, members int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.kind, r.team_id, r.listed, r.invite_only,
         case when public.owns_room(r.id) then 'owner' else 'member' end,
         public.room_member_count(r.id), r.created_at
  from public.rooms r
  where r.id in (select public.rooms_of(auth.uid()))
  order by r.team_id is null, r.created_at
$$;

-- Everyone in a room, for the wall: ids only; profiles and presence say the rest.
create or replace function public.room_people(r uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select person_id from public.room_members where room_id = r and public.in_room(r)
  union
  select tm.person_id from public.rooms ro join public.team_members tm on tm.team_id = ro.team_id where ro.id = r and public.in_room(r)
$$;

create or replace function public.create_room(p_name text, p_kind text default 'room', p_listed boolean default false, p_people uuid[] default '{}', p_invite_only boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; p uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_kind not in ('room', 'group') then raise exception 'a room is a room or a group'; end if;
  if p_listed and p_kind <> 'room' then raise exception 'only a room can be listed'; end if;
  -- In the alpha, only people on a team can list a room for everyone.
  if p_listed and not exists (select 1 from public.team_members where person_id = auth.uid()) then
    raise exception 'listing a room for everyone needs a team in the alpha';
  end if;
  if cardinality(coalesce(p_people, '{}')) > 11 then raise exception 'a group holds at most twelve people'; end if;
  perform public.room_limit('rooms', 10, interval '1 day');
  foreach p in array coalesce(p_people, '{}') loop
    if p <> auth.uid() and not public.shares_room(p) then raise exception 'you can only add people you share a room with'; end if;
  end loop;
  insert into public.rooms (name, kind, listed, invite_only, created_by) values (btrim(p_name), p_kind, p_listed, coalesce(p_invite_only, false), auth.uid()) returning id into r;
  insert into public.room_members (room_id, person_id, role) values (r, auth.uid(), 'owner');
  insert into public.room_members (room_id, person_id)
    select r, x from unnest(coalesce(p_people, '{}')) x where x <> auth.uid() on conflict do nothing;
  return r;
end $$;

create or replace function public.join_into(r uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if public.in_room(r) then return r; end if;
  perform public.room_limit('joins', 30, interval '1 hour');
  if public.room_member_count(r) >= 500 then raise exception 'this room is full'; end if;
  insert into public.room_members (room_id, person_id) values (r, auth.uid()) on conflict do nothing;
  return r;
end $$;

create or replace function public.join_listed_room(r uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from public.rooms where id = r and listed) then raise exception 'that room is not open to everyone'; end if;
  return public.join_into(r);
end $$;

create or replace function public.join_room_by_link(tok text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select room_id into r from public.room_links where token = tok and revoked_at is null;
  if r is null then raise exception 'that invite link does not work any more'; end if;
  if exists (select 1 from public.rooms where id = r and kind = 'group') then raise exception 'a group is joined by being added'; end if;
  if exists (select 1 from public.rooms where id = r and invite_only) then raise exception 'that room takes only people its members invite'; end if;
  return public.join_into(r);
end $$;

create or replace function public.room_link(r uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  if exists (select 1 from public.rooms where id = r and kind = 'group') then raise exception 'a group has no invite link'; end if;
  if exists (select 1 from public.rooms where id = r and invite_only) then raise exception 'that room takes only people its members invite'; end if;
  select token into tok from public.room_links where room_id = r and created_by = auth.uid() and revoked_at is null;
  if tok is null then
    insert into public.room_links (room_id, created_by) values (r, auth.uid()) returning token into tok;
  end if;
  return tok;
end $$;

create or replace function public.revoke_room_link(r uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  -- Mine, or every link to the room when it is the owner turning them off.
  update public.room_links set revoked_at = now()
  where room_id = r and revoked_at is null and (created_by = auth.uid() or public.owns_room(r));
  insert into public.room_links (room_id, created_by) values (r, auth.uid()) returning token into tok;
  return tok;
end $$;

create or replace function public.my_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create or replace function public.pending_room_invites()
returns table (room_id uuid, room_name text, invited_by uuid, invited_by_name text)
language sql stable security definer set search_path = public as $$
  select i.room_id, r.name, i.invited_by, coalesce(pr.display_name, '')
  from public.room_email_invites i
  join public.rooms r on r.id = i.room_id
  left join public.room_profiles pr on pr.person_id = i.invited_by
  where i.email = public.my_email() and i.accepted_at is null and not public.in_room(i.room_id)
  order by i.created_at
$$;

create or replace function public.accept_room_invite(r uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := public.my_email();
begin
  if e is null then raise exception 'sign in with a confirmed email to join a room'; end if;
  update public.room_email_invites set accepted_at = now() where room_id = r and email = e and accepted_at is null;
  if not found then raise exception 'there is no invite to that room for you'; end if;
  return public.join_into(r);
end $$;

create or replace function public.remove_room_member(r uuid, p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_room(r) then raise exception 'only the room owner can remove someone'; end if;
  delete from public.room_members where room_id = r and person_id = p;
end $$;

create or replace function public.mark_room_read(r uuid, at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  insert into public.room_reads (room_id, person_id, read_at) values (r, auth.uid(), least(at, now()))
  on conflict (room_id, person_id) do update set read_at = greatest(public.room_reads.read_at, excluded.read_at);
end $$;

-- What an invite link shows before you join, to anyone holding the link.
-- Dropped first: a changed return type cannot be replaced in place.
drop function if exists public.room_preview(text);
create or replace function public.room_preview(tok text)
returns table (name text, members int, agents_running int, faces jsonb, invited_by_name text, invited_by_avatar text)
language sql stable security definer set search_path = public as $$
  with r as (select l.room_id, l.created_by from public.room_links l join public.rooms ro on ro.id = l.room_id
             where l.token = tok and l.revoked_at is null and not ro.invite_only),
  everyone as (
    select m.person_id from public.room_members m where m.room_id = (select room_id from r)
    union
    select tm.person_id from public.rooms ro join public.team_members tm on tm.team_id = ro.team_id where ro.id = (select room_id from r)
  ),
  shown as (select e.person_id from everyone e where public.person_visible(e.person_id))
  select ro.name,
         (select count(*)::int from everyone),
         coalesce((select sum(p.agents_running)::int from public.room_presence p
                   where p.person_id in (select person_id from shown) and not p.gone and p.updated_at > now() - interval '15 minutes'), 0),
         coalesce((select jsonb_agg(jsonb_build_object('name', pr.display_name, 'avatar', pr.avatar_url))
                   from (select pr.* from public.room_profiles pr where pr.person_id in (select person_id from shown) order by pr.updated_at desc limit 8) pr), '[]'::jsonb),
         nullif(inviter.display_name, ''), inviter.avatar_url
  from public.rooms ro
  left join public.room_profiles inviter on inviter.person_id = (select created_by from r)
    and inviter.person_id in (select person_id from everyone)
  where ro.id = (select room_id from r)
$$;

-- Rooms open to everyone, for Find rooms.
drop function if exists public.listed_rooms();
create or replace function public.listed_rooms()
returns table (id uuid, name text, members int, here_now int, joined boolean, faces jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ro.id, ro.name, public.room_member_count(ro.id),
         (select count(distinct p.person_id)::int from public.room_presence p
            join public.room_members m on m.person_id = p.person_id and m.room_id = ro.id
           where not p.gone and p.updated_at > now() - interval '15 minutes' and public.person_visible(p.person_id)),
         public.in_room(ro.id),
         coalesce((select jsonb_agg(jsonb_build_object('name', pr.display_name, 'avatar', pr.avatar_url))
                   from (select pr.* from public.room_profiles pr join public.room_members m on m.person_id = pr.person_id and m.room_id = ro.id
                         where public.person_visible(pr.person_id) order by pr.updated_at desc limit 4) pr), '[]'::jsonb),
         ro.created_at
  from public.rooms ro where ro.listed
  order by public.room_member_count(ro.id) desc, ro.created_at
  limit 100
$$;

-- Each one's place among everyone visible, by all-time agent hours: the number
-- only, and only for me and the people I share a room with.
create or replace function public.agentbox_ranks(ps uuid[])
returns table (person_id uuid, rank int)
language sql stable security definer set search_path = public as $$
  with totals as (
    select p.person_id, sum(p.hours_total) as h from public.room_presence p
    where not p.gone and public.person_visible(p.person_id) group by p.person_id
  )
  select x, 1 + (select count(*)::int from totals where h > coalesce((select h from totals t where t.person_id = x), 0))
  from unnest(coalesce(ps, '{}')) x
  where auth.uid() is not null and (x = auth.uid() or (public.shares_room(x) and public.person_visible(x)))
$$;

-- ---------------------------------------------------------------- row policies

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_links enable row level security;
alter table public.room_email_invites enable row level security;
alter table public.room_profiles enable row level security;
alter table public.room_presence enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_reads enable row level security;
alter table public.room_events enable row level security;
alter table public.access_events enable row level security;

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select using (public.in_room(id) or listed);
drop policy if exists rooms_rename on public.rooms;
create policy rooms_rename on public.rooms for update using (public.owns_room(id) and team_id is null) with check (public.owns_room(id) and team_id is null);
drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete using (public.owns_room(id) and team_id is null and not listed);

drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select using (public.in_room(room_id));
drop policy if exists room_members_leave on public.room_members;
create policy room_members_leave on public.room_members for delete using (person_id = auth.uid());

drop policy if exists room_links_read on public.room_links;
create policy room_links_read on public.room_links for select using (public.in_room(room_id));

drop policy if exists room_invites_read on public.room_email_invites;
create policy room_invites_read on public.room_email_invites for select using (public.in_room(room_id));
drop policy if exists room_invites_make on public.room_email_invites;
create policy room_invites_make on public.room_email_invites for insert
  with check (public.in_room(room_id) and invited_by = auth.uid() and accepted_at is null and not exists (select 1 from public.rooms where id = room_id and kind = 'group'));
drop policy if exists room_invites_cancel on public.room_email_invites;
create policy room_invites_cancel on public.room_email_invites for delete using (invited_by = auth.uid() or public.owns_room(room_id));

drop policy if exists room_profiles_read on public.room_profiles;
create policy room_profiles_read on public.room_profiles for select
  using (person_id = auth.uid() or (public.shares_room(person_id) and (invisible_until is null or invisible_until <= now())));
drop policy if exists room_profiles_write on public.room_profiles;
create policy room_profiles_write on public.room_profiles for insert with check (person_id = auth.uid());
drop policy if exists room_profiles_update on public.room_profiles;
create policy room_profiles_update on public.room_profiles for update using (person_id = auth.uid()) with check (person_id = auth.uid());

drop policy if exists room_presence_read on public.room_presence;
create policy room_presence_read on public.room_presence for select
  using (person_id = auth.uid() or (not gone and public.shares_room(person_id) and public.person_visible(person_id)));
drop policy if exists room_presence_write on public.room_presence;
create policy room_presence_write on public.room_presence for insert with check (person_id = auth.uid());
drop policy if exists room_presence_update on public.room_presence;
create policy room_presence_update on public.room_presence for update using (person_id = auth.uid()) with check (person_id = auth.uid());

drop policy if exists room_messages_read on public.room_messages;
create policy room_messages_read on public.room_messages for select using (public.in_room(room_id));
drop policy if exists room_messages_write on public.room_messages;
create policy room_messages_write on public.room_messages for insert with check (public.in_room(room_id) and by_person = auth.uid());

drop policy if exists room_reads_read on public.room_reads;
create policy room_reads_read on public.room_reads for select using (person_id = auth.uid());

drop policy if exists room_events_read on public.room_events;
create policy room_events_read on public.room_events for select using (public.in_room(room_id));

drop policy if exists access_events_read on public.access_events;
create policy access_events_read on public.access_events for select using (person_id = auth.uid());

-- ---------------------------------------------------------------- grants

revoke all on public.rooms, public.room_members, public.room_links, public.room_email_invites,
  public.room_profiles, public.room_presence, public.room_messages, public.room_reads,
  public.room_events, public.access_events from anon, public;

grant select, delete on public.rooms to authenticated;
grant update (name) on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;
grant select on public.room_links to authenticated;
grant select, insert, delete on public.room_email_invites to authenticated;
grant select, insert on public.room_profiles to authenticated;
grant update (display_name, avatar_url, headline, bio, show_working, show_agents, show_level, show_status,
  show_activity, invisible_until, status_text, status_until) on public.room_profiles to authenticated;
grant select, insert on public.room_presence to authenticated;
grant update (gone, agents_running, working_on, working_private, working_at, hours_total, hours_week, week_start,
  hours_today, day, streak_days, active_days, hours_by_month) on public.room_presence to authenticated;
grant select, insert on public.room_messages to authenticated;
grant select on public.room_reads, public.room_events, public.access_events to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.rooms_of(uuid)', 'public.in_room(uuid)', 'public.shares_room(uuid)', 'public.owns_room(uuid)',
    'public.room_member_count(uuid)', 'public.person_visible(uuid)', 'public.room_limit(text, int, interval)',
    'public.room_message_made()', 'public.room_invite_made()', 'public.room_row_stamped()', 'public.room_made_now()', 'public.room_membership_moved()',
    'public.team_membership_moved()', 'public.room_renamed()', 'public.team_room_kept()', 'public.my_rooms()',
    'public.room_people(uuid)', 'public.create_room(text, text, boolean, uuid[], boolean)', 'public.join_into(uuid)',
    'public.join_listed_room(uuid)', 'public.join_room_by_link(text)', 'public.room_link(uuid)', 'public.revoke_room_link(uuid)',
    'public.my_email()', 'public.pending_room_invites()', 'public.accept_room_invite(uuid)',
    'public.remove_room_member(uuid, uuid)', 'public.mark_room_read(uuid, timestamptz)', 'public.room_preview(text)',
    'public.listed_rooms()', 'public.agentbox_ranks(uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
end $$;

grant execute on function public.in_room(uuid), public.shares_room(uuid), public.owns_room(uuid), public.person_visible(uuid),
  public.my_rooms(), public.room_people(uuid), public.create_room(text, text, boolean, uuid[], boolean), public.join_listed_room(uuid),
  public.join_room_by_link(text), public.room_link(uuid), public.revoke_room_link(uuid), public.pending_room_invites(),
  public.accept_room_invite(uuid), public.remove_room_member(uuid, uuid), public.mark_room_read(uuid, timestamptz),
  public.room_preview(text), public.listed_rooms(), public.agentbox_ranks(uuid[])
to authenticated;
-- The one door open without a sign-in: the invite link's preview.
grant execute on function public.room_preview(text) to anon;

-- ---------------------------------------------------------------- realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_messages, public.room_presence, public.room_profiles,
      public.room_events, public.access_events;
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- what exists already

insert into public.rooms (name, kind, team_id, created_by)
  select left(t.name, 40), 'room', t.id, t.created_by from public.teams t
  on conflict (team_id) do nothing;

insert into public.rooms (id, name, kind, listed)
  values ('9e9e9e9e-0000-4000-8000-000000000001', 'General', 'room', true)
  on conflict (id) do nothing;
