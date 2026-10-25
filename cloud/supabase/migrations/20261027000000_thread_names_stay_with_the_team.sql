-- THREAD NAMES STAY WITH YOUR TEAM UNTIL YOU SAY (w-64116bb761, 2026-10-24).
--
-- 20261022000100 moved every card to show its work to everyone in its rooms,
-- and reached the hosted cloud two days late, moving cards whose owners had
-- kept thread names to their team. People outside your team now see your
-- name, level and agent count, never a thread name, until you turn that on in
-- Settings. Teammates still see shared threads on the board.
--
-- Safe to run twice.

alter table public.room_profiles alter column show_working set default 'team';

update public.room_profiles set show_working = 'team' where show_working = 'everyone';

-- What a Mac last published under the old setting, cleared until it publishes
-- again. The stamp is left alone, so a Mac that went quiet stays quiet.
alter table public.room_presence disable trigger room_presence_stamped;
update public.room_presence p set working_on = null, activity = '[]'::jsonb
  from public.room_profiles r
  where r.person_id = p.person_id and r.show_working <> 'everyone'
    and (p.working_on is not null or p.activity <> '[]'::jsonb);
alter table public.room_presence enable trigger room_presence_stamped;
