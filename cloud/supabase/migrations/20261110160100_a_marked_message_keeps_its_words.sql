-- A decision marked from a message in the room always carries that message's
-- words and author. The caller's words were taken whenever a project name came
-- with the call, so a project name sent beside a real message id rewrote it.

create or replace function public.mark_room_decision(
  r uuid, p_message text, p_kind text, p_body text default null, p_said_by uuid default null, p_project text default null, p_on boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare msg public.room_messages; words text; who uuid; proj text;
begin
  if not public.in_room(r) then raise exception 'you are not in that room'; end if;
  if p_kind not in ('decision', 'priority') then raise exception 'a mark is a decision or priorities'; end if;
  if not coalesce(p_on, true) then
    update public.room_decisions set is_on = false, updated_at = now()
    where room_id = r and message_id = p_message and kind = p_kind;
    return;
  end if;
  perform public.room_act('reactions', 60, interval '1 minute');
  select * into msg from public.room_messages where id::text = p_message and room_id = r for share;
  if found then
    if msg.deleted_at is not null then raise exception 'there is no such message in this room'; end if;
    words := msg.body;
    who := msg.by_person;
  elsif p_project is not null or p_message like 'chat:%' then
    words := p_body;
    proj := p_project;
    -- Named only if they are in the room, so a stranger's name cannot be put on it.
    who := case when p_said_by in (select public.room_people(r)) then p_said_by end;
  else
    raise exception 'there is no such message in this room';
  end if;
  insert into public.room_decisions (room_id, message_id, kind, project, body, said_by, marked_by, is_on, updated_at)
  values (r, p_message, p_kind, proj, words, who, auth.uid(), true, now())
  on conflict (room_id, message_id, kind) do update
    set body = excluded.body, said_by = excluded.said_by, project = excluded.project, marked_by = excluded.marked_by, is_on = true, updated_at = now();
end $$;

revoke all on function public.mark_room_decision(uuid, text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.mark_room_decision(uuid, text, text, text, uuid, text, boolean) to authenticated;
