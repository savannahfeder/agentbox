-- THE PHONE CARRIES ON WITH THE COMPUTER SHUT (docs/cloud/PHONE-PLAN.md step 2).
--
-- A reply the computer has not claimed within a minute is started in the
-- cloud by the cloud server, which claims it as `cloud:<run id>`
-- (shared/cloud-kit.mjs), and gives the claim back when the run cannot start.
-- Only the server, with the service role, names who claimed; the computer and
-- the phone still claim and mark taken as before.
-- And a computer that leaves its threads ready for the cloud says so, so the
-- phone can say the cloud carries on rather than "waits for your Mac".

alter table public.phone_commands add column if not exists claimed_by text
  check (claimed_by is null or claimed_by ~ '^cloud:[A-Za-z0-9._-]{1,120}$');

alter table public.phone_projects add column if not exists cloud boolean not null default false;

create or replace function public.phone_command_made() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.claimed_at := null;
  new.claimed_by := null;
  new.taken_at := null;
  new.outcome := null;
  return new;
end $$;

-- As before, and who claimed is named only in the claim itself. A cloud
-- claim whose run could not start is given back, whole, for the computer.
create or replace function public.phone_command_taken() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.taken_at is not null then
    raise exception 'this command was already taken';
  end if;
  if old.claimed_by is not null and new.claimed_at is null and new.claimed_by is null and new.taken_at is null
     and (new.id, new.owner, new.device, new.project, new.item, new.kind, new.payload, new.created_at)
     is not distinct from (old.id, old.owner, old.device, old.project, old.item, old.kind, old.payload, old.created_at) then
    return new;
  end if;
  if old.claimed_at is not null and new.claimed_at is distinct from old.claimed_at then
    raise exception 'this command was already claimed';
  end if;
  if new.claimed_by is distinct from old.claimed_by and not (old.claimed_at is null and new.claimed_at is not null) then
    raise exception 'who claimed a command is said only when it is claimed';
  end if;
  if (new.taken_at is null) <> (new.outcome is null) then
    raise exception 'a command is marked taken with its outcome';
  end if;
  if new.taken_at is null and new.claimed_at is not distinct from old.claimed_at then
    raise exception 'a command is only ever claimed or marked taken';
  end if;
  if (new.id, new.owner, new.device, new.project, new.item, new.kind, new.payload, new.created_at)
     is distinct from (old.id, old.owner, old.device, old.project, old.item, old.kind, old.payload, old.created_at) then
    raise exception 'a command cannot be changed';
  end if;
  return new;
end $$;

-- Signed in, a command is still claimed and marked taken with these alone;
-- `claimed_by` is the service role's.
revoke update on public.phone_commands from authenticated;
grant update (claimed_at, taken_at, outcome) on public.phone_commands to authenticated;
revoke all on function public.phone_command_made(), public.phone_command_taken() from public, anon, authenticated;
