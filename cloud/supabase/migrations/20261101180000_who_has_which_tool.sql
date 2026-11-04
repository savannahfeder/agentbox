-- WHO ON THE TEAM HAS WHICH TOOL CONNECTED, so a teammate knows who to ask. Tool
-- ids only (shared/team-connections.mjs): tokens and what a tool returned stay on
-- each person's own computer. people_update_self keeps the row yours at both ends,
-- and the existing read policy already shows a person only to their team.
alter table public.people add column if not exists connections text[] not null default '{}';

alter table public.people drop constraint if exists people_connections_are_a_short_list;
alter table public.people add constraint people_connections_are_a_short_list
  check (cardinality(connections) <= 40 and array_to_string(connections, ',') ~ '^[a-z0-9,-]*$');

grant update (connections) on public.people to authenticated;
