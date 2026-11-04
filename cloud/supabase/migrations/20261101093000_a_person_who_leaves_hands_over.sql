-- A PERSON WHO LEAVES HANDS THEIR WORK TO SOMEONE. The owner removes them and
-- names who takes their open work, and what happens to each of their AI
-- teammates (given to someone, or paused). That choice is the one thing that
-- crosses: every copy of the app reads it and moves what it holds itself
-- (main/team/departures.mjs). The memory cloud keeps the same rules
-- (main/team/memory-cloud.mjs, removeMember).
--
-- Safe to run twice.

create table if not exists public.team_departures (
  team_id uuid not null references public.teams(id) on delete cascade,
  person_id uuid not null,
  name text not null default '' check (char_length(name) <= 120),
  hand_to uuid not null,
  mates jsonb not null default '[]'::jsonb check (jsonb_typeof(mates) = 'array' and jsonb_array_length(mates) <= 20 and pg_column_size(mates) <= 64000),
  left_at timestamptz not null default now(),
  left_by uuid not null,
  primary key (team_id, person_id)
);

alter table public.team_departures enable row level security;

drop policy if exists departures_read on public.team_departures;
create policy departures_read on public.team_departures for select using (team_id in (select public.my_teams()));

revoke all on public.team_departures from anon, authenticated, public;
grant select on public.team_departures to authenticated;
grant select, insert, update, delete on public.team_departures to service_role;

-- One call, so the record and the removal land together or not at all.
create or replace function public.remove_and_hand_over(p_team uuid, p_who uuid, p_to uuid, p_name text, p_mates jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  if not public.owns_team(p_team) then raise exception 'only the team''s owner can remove somebody'; end if;
  if p_who = auth.uid() then raise exception 'hand over your own work: the owner does that'; end if;
  if not exists (select 1 from public.team_members where team_id = p_team and person_id = p_who) then
    raise exception 'they are not on the team';
  end if;
  if p_to = p_who or not exists (select 1 from public.team_members where team_id = p_team and person_id = p_to) then
    raise exception 'hand work to somebody on the team';
  end if;
  for m in select * from jsonb_array_elements(coalesce(p_mates, '[]'::jsonb)) loop
    if m ? 'to' and jsonb_typeof(m->'to') = 'string' and (
      (m->>'to')::uuid = p_who
      or not exists (select 1 from public.team_members where team_id = p_team and person_id = (m->>'to')::uuid)
    ) then
      raise exception 'give an AI teammate to somebody on the team';
    end if;
  end loop;
  insert into public.team_departures (team_id, person_id, name, hand_to, mates, left_at, left_by)
  values (p_team, p_who, left(coalesce(p_name, ''), 120), p_to, coalesce(p_mates, '[]'::jsonb), now(), auth.uid())
  on conflict (team_id, person_id) do update
    set name = excluded.name, hand_to = excluded.hand_to, mates = excluded.mates, left_at = excluded.left_at, left_by = excluded.left_by;
  delete from public.team_members where team_id = p_team and person_id = p_who;
end;
$$;
revoke all on function public.remove_and_hand_over(uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.remove_and_hand_over(uuid, uuid, uuid, text, jsonb) to authenticated;
