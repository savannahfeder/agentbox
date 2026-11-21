// For a test database whose rule under test is not paying: every team, made
// before or after, pays for Pro (20261121130000_team_features_need_pro.sql),
// as `multiplayer_people '*'` lets every team past the invite-only list.
// tests/team-features-need-pro-or-a-card-trial covers paying itself.
export const EVERY_TEAM_PAYS = `
create or replace function public.a_test_team_pays() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.team_plans (team_id, pays) values (new.id, true) on conflict (team_id) do update set pays = true;
  return new;
end $$;
drop trigger if exists a_test_team_pays on public.teams;
create trigger a_test_team_pays after insert on public.teams for each row execute function public.a_test_team_pays();
insert into public.team_plans (team_id, pays) select id, true from public.teams on conflict (team_id) do update set pays = true;
`;
