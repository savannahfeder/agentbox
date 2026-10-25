-- DELETE YOUR ACCOUNT, FROM THE PHONE (App Review guideline 5.1.1(v)).
--
-- The caller only. What they wrote goes with them, in shared projects too.
-- A project or team other people still use is handed to one of them, so it
-- keeps an owner; one nobody else uses goes. The rest goes with the person
-- through the tables' own `on delete cascade`. Their files in storage are
-- removed by the app through the storage API first: Supabase refuses a delete
-- of storage rows from SQL.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  delete from public.lines where by_person = me;
  delete from public.message_files where by_person = me;
  update public.team_invites set invited_by = null where invited_by = me;

  -- A team they own with others gets another owner, the longest there.
  update public.team_members tm set role = 'owner'
  from (
    select distinct on (o.team_id) o.team_id, o.person_id
    from public.team_members o
    where o.person_id <> me
      and o.team_id in (select team_id from public.team_members where person_id = me and role = 'owner')
      and not exists (select 1 from public.team_members x where x.team_id = o.team_id and x.role = 'owner' and x.person_id <> me)
    order by o.team_id, o.joined_at, o.person_id
  ) heir
  where tm.team_id = heir.team_id and tm.person_id = heir.person_id;

  -- A project someone else can still see: anyone on it, or else the team's owner.
  update public.projects p set created_by = coalesce(
    (select pp.person_id from public.project_people pp where pp.project_id = p.id and pp.person_id <> me order by pp.person_id limit 1),
    (select tm.person_id from public.team_members tm where tm.team_id = p.team_id and tm.person_id <> me order by (tm.role = 'owner') desc, tm.joined_at limit 1))
  where p.created_by = me
    and (exists (select 1 from public.project_people pp where pp.project_id = p.id and pp.person_id <> me)
      or (p.visibility = 'team' and exists (select 1 from public.team_members tm where tm.team_id = p.team_id and tm.person_id <> me)));
  delete from public.projects where created_by = me;

  update public.teams t set created_by = (
    select tm.person_id from public.team_members tm where tm.team_id = t.id and tm.person_id <> me order by (tm.role = 'owner') desc, tm.joined_at limit 1)
  where t.created_by = me;
  delete from public.teams t
  where exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.person_id = me)
    and not exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.person_id <> me);

  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
