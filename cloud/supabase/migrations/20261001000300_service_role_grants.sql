-- THE SERVER'S OWN ROLE NEEDS THE TABLES TOO. Found on 2026-10-01: the live
-- tests' clean-up runs as service_role, and this project grants new tables to
-- nobody by default, so every delete was refused ("permission denied for
-- table teams") and seven throwaway test people were left behind. service_role
-- bypasses row level security; it is never shipped in the app, only used by
-- tests and by whoever administers the project.
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.people, public.teams, public.team_members, public.team_invites,
  public.projects, public.project_people, public.lines, public.private_activity
to service_role;
grant execute on function public.my_teams(), public.can_see_project(uuid), public.accept_invites() to service_role;
