-- TEAM SETTINGS (2026-10-01): the owner renames the team, removes people and
-- cancels invites; anyone can leave. Before this nobody could do any of it:
-- teams had no update rule and team_members and team_invites no delete rule.

-- Whether the signed-in person owns a team. Security definer, so a rule on
-- team_members can ask it without reading team_members through its own rule.
create or replace function public.owns_team(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = t and person_id = auth.uid() and role = 'owner'
  );
$$;
revoke all on function public.owns_team(uuid) from public;
grant execute on function public.owns_team(uuid) to authenticated;

drop policy if exists teams_rename on public.teams;
create policy teams_rename on public.teams for update
  using (public.owns_team(id)) with check (public.owns_team(id));

drop policy if exists members_leave_or_remove on public.team_members;
create policy members_leave_or_remove on public.team_members for delete
  using (person_id = auth.uid() or public.owns_team(team_id));

drop policy if exists invites_cancel on public.team_invites;
create policy invites_cancel on public.team_invites for delete
  using (public.owns_team(team_id) or invited_by = auth.uid());
