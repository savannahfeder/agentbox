-- AN INVITATION IS EMAILED TO THE PERSON INVITED (w-1e52420829, 2026-11-13).
--
-- Inviting someone wrote a row here and told nobody. The person learned of it
-- only by signing in to Agentbox with that address. Now the row's arrival
-- calls functions/team-invite, which sends the email and marks the row.
--
-- It is off until two secrets are in the vault, as the thank-you note is:
--   team_invite_url   the function's address
--   team_invite_key   what it is knocked with (the function's TEAM_INVITE_KEY)

alter table public.team_invites add column if not exists emailed_at timestamptz;

-- Every invitation made before this was told about some other way, or not at
-- all; none of them is emailed late.
update public.team_invites set emailed_at = created_at where emailed_at is null;

-- The invitations still to email, with the names the email says. A week old
-- and never sent is given up on, so a broken sender does not retry for ever.
create or replace function public.team_invites_to_email(how_many int default 20)
returns table (team_id uuid, email text, team text, inviter text)
language sql security definer set search_path = public as $$
  select i.team_id, i.email, t.name, coalesce(nullif(p.name, ''), '')
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.people p on p.id = i.invited_by
  where i.emailed_at is null and i.created_at > now() - interval '7 days'
  order by i.created_at
  limit greatest(1, least(how_many, 50));
$$;
revoke all on function public.team_invites_to_email(int) from public, anon, authenticated;
grant execute on function public.team_invites_to_email(int) to service_role;

-- The invitation is what matters: a sender that is not set up, or is down,
-- never holds it up or fails it.
create or replace function public.team_invite_made() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target text;
  knock text;
begin
  select decrypted_secret into target from vault.decrypted_secrets where name = 'team_invite_url';
  select decrypted_secret into knock from vault.decrypted_secrets where name = 'team_invite_key';
  if target is null or knock is null then
    return new;
  end if;
  perform net.http_post(
    url := target,
    headers := jsonb_build_object('content-type', 'application/json', 'x-team-invite-key', knock),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  return new;
end
$$;

drop trigger if exists team_invite_made on public.team_invites;
create trigger team_invite_made
  after insert on public.team_invites
  for each row execute function public.team_invite_made();
