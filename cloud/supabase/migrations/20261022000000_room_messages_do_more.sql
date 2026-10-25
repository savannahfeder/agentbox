-- ROOM MESSAGES DO MORE: reactions, editing and deleting your own message,
-- marking a room unread from a message, and files on a message (voice notes
-- and attachments). Who may read is the rooms migration's rule: whoever is in
-- the room. Nobody writes as somebody else, and only a message's author
-- changes it.
--
-- Realtime carries inserts and updates through row level security but never
-- deletes, so turning a reaction off and deleting a message are both updates.

-- ---------------------------------------------------------------- tables

alter table public.room_messages add column if not exists edited_at timestamptz;
alter table public.room_messages add column if not exists deleted_at timestamptz;
-- A deleted message keeps its place in the chat, with no words in it.
alter table public.room_messages drop constraint if exists room_messages_body_check;
alter table public.room_messages add constraint room_messages_body_check
  check (deleted_at is not null or char_length(btrim(body)) between 1 and 4000);

create table if not exists public.room_reactions (
  message_id uuid not null references public.room_messages(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  is_on boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (message_id, person_id, emoji)
);
create index if not exists room_reactions_room on public.room_reactions (room_id, updated_at);

-- The same shape as message_files: a plain name, since the reader's Mac writes
-- it into a folder, stored once and never replaced.
create table if not exists public.room_files (
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  -- Unlike message_files, General outlives everyone in it, so a file there
  -- must not stop its sender's account from being deleted.
  by_person uuid not null references public.people(id) on delete cascade,
  -- 10 MiB of file, the app's limit, counted in decoded bytes: base64 without
  -- its padding stretches the same length of text two bytes further. Members
  -- insert here directly, so this is the limit that holds.
  data text not null check (length(data) <= 13981016 and octet_length(decode(data, 'base64')) <= 10485760),
  created_at timestamptz not null default now(),
  primary key (room_id, name)
);
create index if not exists room_files_by_time on public.room_files (by_person, created_at desc);

-- Edits and reactions change a row in place, so the row cannot count them.
create table if not exists public.room_acts (
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('edits', 'reactions')),
  at timestamptz not null default now()
);
create index if not exists room_acts_person on public.room_acts (person_id, kind, at desc);

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
  elsif what = 'files' then
    select count(*) into used from public.room_files where by_person = auth.uid() and created_at > now() - per;
  elsif what in ('edits', 'reactions') then
    select count(*) into used from public.room_acts where person_id = auth.uid() and kind = what and at > now() - per;
  end if;
  if used >= n then raise exception 'too many % for now; try again later', what; end if;
end $$;

create or replace function public.room_act(what text, n int, per interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.room_limit(what, n, per);
  delete from public.room_acts where person_id = auth.uid() and at < now() - interval '1 hour';
  insert into public.room_acts (person_id, kind) values (auth.uid(), what);
end $$;

-- ---------------------------------------------------------------- triggers

-- A new message is neither edited nor deleted, whatever the client sent.
create or replace function public.room_message_is_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.edited_at := null;
  new.deleted_at := null;
  return new;
end $$;
drop trigger if exists room_message_is_new on public.room_messages;
create trigger room_message_is_new before insert on public.room_messages
  for each row execute function public.room_message_is_new();

create or replace function public.room_file_made() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.room_limit('files', 30, interval '10 minutes');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists room_file_made on public.room_files;
create trigger room_file_made before insert on public.room_files
  for each row execute function public.room_file_made();

-- ---------------------------------------------------------------- what the app calls

create or replace function public.edit_room_message(m uuid, p_body text, p_mentions uuid[] default '{}')
returns public.room_messages
language plpgsql security definer set search_path = public as $$
declare msg public.room_messages;
begin
  -- Locked, so a delete cannot land between these checks and the update and
  -- have the edit write its words back into a deleted message.
  select * into msg from public.room_messages where id = m for update;
  if not found or not public.in_room(msg.room_id) then raise exception 'there is no such message in your rooms'; end if;
  if msg.by_person is distinct from auth.uid() then raise exception 'only the person who wrote a message can edit it'; end if;
  if msg.deleted_at is not null then raise exception 'that message was deleted'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'a message is 1 to 4000 characters'; end if;
  perform public.room_act('edits', 20, interval '1 minute');
  update public.room_messages set body = p_body, edited_at = now(),
    -- Only people in the room can be mentioned, as when it was sent.
    mentions = coalesce((select array_agg(distinct x) from unnest(coalesce(p_mentions, '{}')) x
                         where x in (select person_id from public.room_members where room_id = msg.room_id
                                     union select tm.person_id from public.rooms ro join public.team_members tm on tm.team_id = ro.team_id where ro.id = msg.room_id)), '{}')
  where id = m and deleted_at is null
  returning * into msg;
  return msg;
end $$;

-- The author's own files that the message linked to go with it.
create or replace function public.delete_room_message(m uuid) returns void
language plpgsql security definer set search_path = public as $$
declare msg public.room_messages;
begin
  select * into msg from public.room_messages where id = m for update;
  if not found or not public.in_room(msg.room_id) then raise exception 'there is no such message in your rooms'; end if;
  if msg.by_person is distinct from auth.uid() then raise exception 'only the person who wrote a message can delete it'; end if;
  if msg.deleted_at is not null then return; end if;
  update public.room_messages set deleted_at = now(), body = '', mentions = '{}' where id = m;
  delete from public.room_reactions where message_id = m;
  delete from public.room_files f
  where f.room_id = msg.room_id and f.by_person = auth.uid()
    and f.name in (select (regexp_matches(msg.body, '\]\(attachments/([A-Za-z0-9][A-Za-z0-9_.-]{0,159})\)', 'g'))[1]);
end $$;

-- The room is the message's, never the caller's word for it.
create or replace function public.react_room_message(m uuid, p_emoji text, p_on boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare msg public.room_messages;
begin
  -- Shared, so a delete waits rather than clearing reactions this then adds back.
  select * into msg from public.room_messages where id = m for share;
  if not found or not public.in_room(msg.room_id) then raise exception 'there is no such message in your rooms'; end if;
  if msg.deleted_at is not null then raise exception 'that message was deleted'; end if;
  if char_length(coalesce(p_emoji, '')) not between 1 and 16 or btrim(p_emoji) = '' then raise exception 'a reaction is one emoji'; end if;
  perform public.room_act('reactions', 60, interval '1 minute');
  if coalesce(p_on, true) then
    insert into public.room_reactions (message_id, room_id, person_id, emoji, is_on, updated_at)
    values (m, msg.room_id, auth.uid(), p_emoji, true, now())
    on conflict (message_id, person_id, emoji) do update set is_on = true, updated_at = now();
  else
    update public.room_reactions set is_on = false, updated_at = now()
    where message_id = m and person_id = auth.uid() and emoji = p_emoji;
  end if;
end $$;

-- Unlike mark_room_read, this may move the read point back.
create or replace function public.mark_room_unread(r uuid, at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  if at is null then raise exception 'say which message to mark unread from'; end if;
  insert into public.room_reads (room_id, person_id, read_at) values (r, auth.uid(), least(at, now()))
  on conflict (room_id, person_id) do update set read_at = excluded.read_at;
end $$;

-- ---------------------------------------------------------------- row policies

alter table public.room_reactions enable row level security;
alter table public.room_files enable row level security;
alter table public.room_acts enable row level security;

drop policy if exists room_reactions_read on public.room_reactions;
create policy room_reactions_read on public.room_reactions for select using (public.in_room(room_id));

drop policy if exists room_files_read on public.room_files;
create policy room_files_read on public.room_files for select using (public.in_room(room_id));
drop policy if exists room_files_add on public.room_files;
create policy room_files_add on public.room_files for insert with check (by_person = auth.uid() and public.in_room(room_id));

-- ---------------------------------------------------------------- grants

revoke all on public.room_reactions, public.room_files, public.room_acts from anon, authenticated, public;
grant select on public.room_reactions to authenticated;
grant select, insert on public.room_files to authenticated;
grant select, insert, update, delete on public.room_reactions, public.room_files to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.room_limit(text, int, interval)', 'public.room_act(text, int, interval)', 'public.room_message_is_new()',
    'public.room_file_made()', 'public.edit_room_message(uuid, text, uuid[])', 'public.delete_room_message(uuid)',
    'public.react_room_message(uuid, text, boolean)', 'public.mark_room_unread(uuid, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
end $$;

grant execute on function public.edit_room_message(uuid, text, uuid[]), public.delete_room_message(uuid),
  public.react_room_message(uuid, text, boolean), public.mark_room_unread(uuid, timestamptz)
to authenticated;

-- ---------------------------------------------------------------- realtime

-- room_messages is published already, so an edit or a delete arrives as an
-- update. Files are not published: they are fetched when played.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_reactions;
  end if;
exception when duplicate_object then null;
end $$;
