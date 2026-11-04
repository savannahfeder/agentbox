-- ONE VERSION LINE PER FILE.
--
-- Every set of bytes a team's file has had, numbered once, here, so every
-- computer says the same "v6 of 8" (shared/version-line.mjs). A computer never
-- counts versions itself.
--
-- `file` and `name` are hashes the app makes of the file's identity and of the
-- name it was saved under: the database never reads a file's name, and a file
-- in a project somebody cannot see gives them nothing to read.
--
-- A number is only given by add_file_version, under a lock per file, so two
-- computers adding at once cannot take the same one. The same bytes keep their
-- number. Rows are never changed or removed: an old version is never lost.
--
-- Safe to run twice.

create table if not exists public.file_versions (
  team_id uuid not null references public.teams(id) on delete cascade,
  file text not null check (file ~ '^[0-9a-f]{8,64}$'),
  n integer not null check (n >= 1),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  name text check (name is null or name ~ '^[0-9a-f]{8,64}$'),
  by_person uuid not null default auth.uid() references public.people(id) on delete cascade,
  at bigint not null,
  primary key (team_id, file, n),
  unique (team_id, file, hash)
);

alter table public.file_versions enable row level security;

drop policy if exists file_versions_read on public.file_versions;
create policy file_versions_read on public.file_versions for select using (
  team_id in (select public.my_teams())
);

revoke all on public.file_versions from anon, authenticated;
grant select on public.file_versions to authenticated;
grant select, insert on public.file_versions to service_role;

create or replace function public.add_file_version(p_team uuid, p_file text, p_hash text, p_name text, p_at bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare got integer;
begin
  if p_team is null or p_team not in (select public.my_teams()) then
    raise exception 'number a file on a team you are not on';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_team::text || ':' || p_file));
  select n into got from public.file_versions where team_id = p_team and file = p_file and hash = p_hash;
  if got is not null then return got; end if;
  select coalesce(max(n), 0) + 1 into got from public.file_versions where team_id = p_team and file = p_file;
  insert into public.file_versions (team_id, file, n, hash, name, by_person, at)
  values (p_team, p_file, got, p_hash, p_name, auth.uid(), coalesce(p_at, 0));
  return got;
end $$;

revoke execute on function public.add_file_version(uuid, text, text, text, bigint) from anon, public;
grant execute on function public.add_file_version(uuid, text, text, text, bigint) to authenticated, service_role;
