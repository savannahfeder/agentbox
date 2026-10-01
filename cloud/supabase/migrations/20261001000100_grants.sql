-- WHO MAY TOUCH THE TABLES AT ALL, before row level security decides which
-- rows. Newer Supabase projects no longer grant this by default, and the
-- hosted project answered "permission denied" to everything on 2026-10-01.
--
-- Signed-in people get the table rights; the policies in the first migration
-- then decide which rows. Nobody signed out gets anything.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.people, public.teams, public.team_members, public.team_invites,
  public.projects, public.project_people, public.lines, public.private_activity
to authenticated;

grant execute on function public.my_teams(), public.can_see_project(uuid), public.accept_invites() to authenticated;

revoke all on
  public.people, public.teams, public.team_members, public.team_invites,
  public.projects, public.project_people, public.lines, public.private_activity
from anon;
revoke execute on function public.my_teams(), public.can_see_project(uuid), public.accept_invites(), public.person_from_sign_in() from anon, public;
