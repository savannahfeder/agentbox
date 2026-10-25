-- ROOMS SHOW EVERYONE (w-3d0fa23ffb, 2026-10-22): room-mates outside your team
-- see your work, and everyone in a room is named, invisible or not on Rooms yet.
--
-- Safe to run twice. An app from before this keeps working on it, and this
-- app keeps working on a cloud that has not had it yet.

-- What you work on reaches everyone in your rooms unless you say otherwise.
-- Everyone was on the old default a day after Rooms opened, so they move too.
alter table public.room_profiles alter column show_working set default 'everyone';
update public.room_profiles set show_working = 'everyone', updated_at = now() where show_working = 'team';

-- What is waiting, running and done today, for room-mates outside my team:
-- only threads my team could already read, and only while I show my work and
-- my activity to everyone in my rooms. My Mac sends it; nothing here builds it.
alter table public.room_presence add column if not exists activity jsonb not null default '[]'::jsonb;
alter table public.room_presence drop constraint if exists room_presence_activity_check;
alter table public.room_presence add constraint room_presence_activity_check
  check (jsonb_typeof(activity) = 'array' and jsonb_array_length(activity) <= 36 and pg_column_size(activity) <= 16384);
grant update (activity) on public.room_presence to authenticated;

-- Everyone in a room, by name and face only, for the chat to say who wrote
-- what: people who are invisible keep their name on their messages, and people
-- with no card yet are named. Nothing about their work or their status.
-- `has_card` is whether they have turned Rooms on; their wall card says so.
create or replace function public.room_names(r uuid)
returns table (person_id uuid, name text, avatar_url text, has_card boolean)
language sql stable security definer set search_path = public as $$
  select m.p, coalesce(nullif(pr.display_name, ''), pe.name, ''), coalesce(pr.avatar_url, pe.avatar_url), pr.person_id is not null
  from public.room_people(r) as m(p)
  left join public.room_profiles pr on pr.person_id = m.p
  left join public.people pe on pe.id = m.p
  where public.in_room(r)
$$;

revoke all on function public.room_names(uuid) from public, anon;
grant execute on function public.room_names(uuid) to authenticated;
