-- A GROUP KEEPS ITS DECISIONS: a message marked a decision, or pinned as the
-- week's priorities, read by whoever is in the group. A project's decision is
-- kept under the team's own group with the project's name on it, because a
-- project has no place of its own in the cloud. It, and one filed from a
-- conversation (message id `chat:<uid>`), has no message in the room, so only
-- then is the caller's word taken for what was said and by whom.
--
-- Anyone in the group may mark or take back. A person writes only through the
-- function, so nobody can rewrite the words on a marked message. Taking back is
-- an update, because realtime carries no deletes.
--
-- Safe to run twice.

create table if not exists public.room_decisions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id text not null check (char_length(message_id) between 1 and 200),
  kind text not null check (kind in ('decision', 'priority')),
  project text check (char_length(project) <= 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  said_by uuid,
  marked_by uuid not null,
  is_on boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (room_id, message_id, kind)
);

alter table public.room_decisions enable row level security;

drop policy if exists room_decisions_read on public.room_decisions;
create policy room_decisions_read on public.room_decisions for select using (public.in_room(room_id));

revoke all on public.room_decisions from anon, authenticated, public;
grant select on public.room_decisions to authenticated;
grant select, insert, update, delete on public.room_decisions to service_role;

create or replace function public.mark_room_decision(
  r uuid, p_message text, p_kind text, p_body text default null, p_said_by uuid default null, p_project text default null, p_on boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare msg public.room_messages; words text; who uuid;
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  if p_kind not in ('decision', 'priority') then raise exception 'a mark is a decision or priorities'; end if;
  if not coalesce(p_on, true) then
    update public.room_decisions set is_on = false, updated_at = now()
    where room_id = r and message_id = p_message and kind = p_kind;
    return;
  end if;
  perform public.room_act('reactions', 60, interval '1 minute');
  if p_project is not null or p_message like 'chat:%' then
    words := p_body;
    -- Named only if they are in the room, so a stranger's name cannot be put on it.
    who := case when p_said_by in (select public.room_people(r)) then p_said_by end;
  else
    select * into msg from public.room_messages where id::text = p_message and room_id = r for share;
    if not found or msg.deleted_at is not null then raise exception 'there is no such message in this room'; end if;
    words := msg.body;
    who := msg.by_person;
  end if;
  insert into public.room_decisions (room_id, message_id, kind, project, body, said_by, marked_by, is_on, updated_at)
  values (r, p_message, p_kind, p_project, words, who, auth.uid(), true, now())
  on conflict (room_id, message_id, kind) do update
    set body = excluded.body, said_by = excluded.said_by, project = excluded.project, marked_by = excluded.marked_by, is_on = true, updated_at = now();
end $$;

revoke all on function public.mark_room_decision(uuid, text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.mark_room_decision(uuid, text, text, text, uuid, text, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_decisions;
  end if;
exception when duplicate_object then null;
end $$;
