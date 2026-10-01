-- A NEW PROJECT COULD NOT BE SHARED. Found by the live run of
-- tests/team-cloud-backends-agree.test.mjs on 2026-10-01: "new row violates
-- row-level security policy for table projects".
--
-- Sharing writes with INSERT ... ON CONFLICT DO UPDATE, and Postgres holds the
-- proposed row to the SELECT policy as well. That policy asked
-- can_see_project(id), which looks the project up in this same table, where a
-- row still being inserted is not yet visible, so every first share failed.
-- The policy now judges the row by its own columns.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select using (
  team_id in (select public.my_teams())
  and (visibility = 'team'
       or created_by = auth.uid()
       or exists (select 1 from public.project_people pp where pp.project_id = id and pp.person_id = auth.uid()))
);
