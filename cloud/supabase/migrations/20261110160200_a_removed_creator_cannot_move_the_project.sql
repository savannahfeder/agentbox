-- A project's creator updates it only while still on its team. Removal keeps
-- created_by, and an update that reads no column skips the read policy, so a
-- removed creator could move the project into a team of their own.

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (created_by = auth.uid() and team_id in (select public.my_teams()))
  with check (created_by = auth.uid() and team_id in (select public.my_teams()));
