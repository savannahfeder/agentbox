-- AN INVITATION HAS A DAILY LIMIT (security review, 2026-11-16).
--
-- Every invitation emails the address invited, and anyone signed in may make a
-- team and invite any text, so one throwaway account could send Agentbox's
-- email to thousands of addresses with its own words in the subject. Now:
--   one person sends at most 20 invitations a day, one team at most 50, and
--   taking one back does not give it back;
--   a row is one email address, made now, and not yet sent;
--   an email that fails three times is given up, so it cannot hold the queue.
--
-- Safe to run twice.

alter table public.team_invites add column if not exists email_tries int not null default 0;

-- Every invitation sent, kept a day or two, so a deleted one still counts.
create table if not exists public.team_invite_sends (
  invited_by uuid,
  team_id uuid,
  at timestamptz not null default now()
);
create index if not exists team_invite_sends_by on public.team_invite_sends (invited_by, at);
create index if not exists team_invite_sends_team on public.team_invite_sends (team_id, at);
alter table public.team_invite_sends enable row level security;
revoke all on public.team_invite_sends from public, anon, authenticated;
grant all on public.team_invite_sends to service_role;

create or replace function public.team_invite_allowed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.emailed_at := null;
  new.email_tries := 0;
  if length(new.email) > 254 or new.email !~ '^[^[:space:]@,;<>"]+@[^[:space:]@,;<>"]+\.[^[:space:]@,;<>"]+$' then
    raise exception '% is not an email address', left(new.email, 80);
  end if;
  -- Asking again for someone already invited sends nothing new.
  if exists (select 1 from public.team_invites i where i.team_id = new.team_id and i.email = new.email) then
    return new;
  end if;
  delete from public.team_invite_sends where at < now() - interval '2 days';
  if (select count(*) from public.team_invite_sends s where s.invited_by = new.invited_by and s.at > now() - interval '1 day') >= 20 then
    raise exception 'You have sent 20 invitations today, the most for one day. Try again tomorrow.';
  end if;
  if (select count(*) from public.team_invite_sends s where s.team_id = new.team_id and s.at > now() - interval '1 day') >= 50 then
    raise exception 'This team has sent 50 invitations today, the most for one day. Try again tomorrow.';
  end if;
  insert into public.team_invite_sends (invited_by, team_id) values (new.invited_by, new.team_id);
  return new;
end
$$;

drop trigger if exists team_invite_allowed on public.team_invites;
create trigger team_invite_allowed
  before insert on public.team_invites
  for each row execute function public.team_invite_allowed();

-- The sender marks a row before it sends; each mark is one try.
create or replace function public.team_invite_tried() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.emailed_at is null and new.emailed_at is not null then
    new.email_tries := old.email_tries + 1;
  else
    new.email_tries := old.email_tries;
  end if;
  return new;
end
$$;

drop trigger if exists team_invite_tried on public.team_invites;
create trigger team_invite_tried
  before update on public.team_invites
  for each row execute function public.team_invite_tried();

create or replace function public.team_invites_to_email(how_many int default 20)
returns table (team_id uuid, email text, team text, inviter text)
language sql security definer set search_path = public as $$
  select i.team_id, i.email, t.name, coalesce(nullif(p.name, ''), '')
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.people p on p.id = i.invited_by
  where i.emailed_at is null and i.email_tries < 3 and i.created_at > now() - interval '7 days'
  order by i.created_at
  limit greatest(1, least(how_many, 50));
$$;
revoke all on function public.team_invites_to_email(int) from public, anon, authenticated;
grant execute on function public.team_invites_to_email(int) to service_role;
