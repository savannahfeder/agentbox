-- MESSAGES TO A FEW PEOPLE AT ONCE (2026-10-01). A message record was capped
-- at its maker and one other person (20261001000500_security.sql, finding 4),
-- against a teammate making a "direct" record that holds two others and reading
-- what they say to each other. The app closes that door itself now: a message
-- goes only into a record whose people are EXACTLY the ones chosen, its maker
-- among them (main/team/index.mjs, `directWith`), so a record with a stranger
-- in it is never written to. The cap rises to a small group: the maker and up
-- to eleven others.
create or replace function public.direct_stays_between_two() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.projects; others int;
begin
  if tg_table_name = 'projects' then
    if new.direct then
      if new.visibility <> 'people' then raise exception 'a message thread is between named people'; end if;
      select count(*) into others from public.project_people where project_id = new.id and person_id <> new.created_by;
      if others > 11 then raise exception 'a message thread holds at most twelve people'; end if;
    end if;
    return new;
  end if;
  select * into pr from public.projects where id = new.project_id;
  if pr.direct and new.person_id <> pr.created_by then
    select count(*) into others from public.project_people
      where project_id = new.project_id and person_id <> pr.created_by and person_id <> new.person_id;
    if others >= 11 then raise exception 'a message thread holds at most twelve people'; end if;
  end if;
  return new;
end $$;
