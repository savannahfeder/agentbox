-- A THREAD MAY BE SHARED WITH CHOSEN PEOPLE, NOT ONLY THE WHOLE TEAM.
--
-- w-41ff964775. Until now a thread was Team or Private, so sharing anything
-- shared it with everybody. The rule: a person may want a thread seen by a
-- few people (a manager, say) without showing it to the whole company.
--
-- A card now carries the people it is for, and NO LIST AT ALL is the whole
-- team, which is what every card written before this migration says, so
-- nothing already up there changes meaning. An empty list is refused rather
-- than stored: it would have to mean both "everyone" and "nobody", and the
-- first of those is the one mistake nobody can take back.
--
-- The read rule below is what actually keeps a chosen card off a teammate's
-- Team page: the app asks the table for its team's cards and the table hands
-- back only the ones that person may read.
alter table public.thread_cards add column if not exists people uuid[];
alter table public.thread_cards drop constraint if exists chosen_people_are_somebody;
alter table public.thread_cards add constraint chosen_people_are_somebody
  check (people is null or cardinality(people) > 0);

-- THE READ RULE. Your team's cards, and of those: the ones for the whole team,
-- your own, and the ones that name you.
drop policy if exists cards_read on public.thread_cards;
create policy cards_read on public.thread_cards for select using (
  team_id in (select public.my_teams())
  and (
    people is null
    or person_id = auth.uid()
    or auth.uid() = any (people)
  )
);

-- A card may only name people on the same team as the card, so a thread cannot
-- be shared out of the team by writing a stranger's id into the list.
create or replace function public.people_are_on_team(p uuid[], t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(coalesce(p, '{}'::uuid[])) as person(id)
    where person.id not in (select person_id from public.team_members where team_id = t)
  )
$$;
grant execute on function public.people_are_on_team(uuid[], uuid) to authenticated, service_role;

drop policy if exists cards_write on public.thread_cards;
create policy cards_write on public.thread_cards for insert with check (
  person_id = auth.uid() and team_id in (select public.my_teams())
  and public.people_are_on_team(people, team_id)
);
drop policy if exists cards_update on public.thread_cards;
create policy cards_update on public.thread_cards for update using (person_id = auth.uid())
  with check (
    person_id = auth.uid() and team_id in (select public.my_teams())
    and public.people_are_on_team(people, team_id)
  );
