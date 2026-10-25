-- PRESENCE CARRIES NO THREAD LIST (w-0bc0443617, 2026-10-25).
--
-- A person's page had a Today's activity board, and for someone outside your
-- team it was drawn off `room_presence.activity`: up to 36 of their thread
-- names, readable by everyone in their rooms. The board is gone and the app no
-- longer sends the list; this keeps an app from before that change from
-- sending it, and clears what is already there.
--
-- Safe to run twice; an app from before this keeps working on it.

create or replace function public.room_presence_no_thread_list() returns trigger
language plpgsql set search_path = public as $$
begin
  new.activity := '[]'::jsonb;
  return new;
end $$;
revoke all on function public.room_presence_no_thread_list() from public, anon, authenticated;

drop trigger if exists room_presence_no_thread_list on public.room_presence;
create trigger room_presence_no_thread_list before insert or update on public.room_presence
  for each row execute function public.room_presence_no_thread_list();

-- The stamp is left alone, so a Mac that went quiet stays quiet.
alter table public.room_presence disable trigger room_presence_stamped;
update public.room_presence set activity = '[]'::jsonb where activity <> '[]'::jsonb;
alter table public.room_presence enable trigger room_presence_stamped;
