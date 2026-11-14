-- THE FOUNDER'S THANK-YOU NOTE, ONCE TO EACH NEW ACCOUNT (w-5efd743952).
--
-- A daily job calls functions/founder-note, which asks founder_note_due who
-- signed up 3 to 7 days ago and writes to each of them once. The function's
-- address and key are in the vault (founder_note_url, founder_note_key), put
-- there by scripts/set-up-founder-note.mjs, so the key is not in this public
-- file.

create table if not exists public.founder_notes (
  person_id uuid primary key references public.people(id) on delete cascade,
  sent_at timestamptz not null default now()
);
-- Which of the two versions in functions/_shared/founder-note.mjs it was.
alter table public.founder_notes add column if not exists version text check (version in ('name', 'lowercase'));
alter table public.founder_notes enable row level security;
-- No policy: only the function, as service_role, reads or writes it.
revoke all on public.founder_notes from anon, authenticated;
grant select, insert, delete on public.founder_notes to service_role;

-- Confirmed addresses only, so an unconfirmed sign-up never bounces. The
-- sender and anyone who shares a team with them are left out. The name is the
-- one given at sign-up, since people.name falls back to the start of the
-- address.
create or replace function public.founder_note_due(owners uuid[], oldest_days int, youngest_days int, how_many int)
returns table (id uuid, email text, name text)
language sql stable security definer set search_path = '' as $$
  with sender as (select unnest(owners) as id)
  select p.id, u.email::text, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
  from public.people p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null
    and p.created_at <= now() - make_interval(days => youngest_days)
    and p.created_at > now() - make_interval(days => oldest_days)
    and not exists (select 1 from public.founder_notes n where n.person_id = p.id)
    and not exists (select 1 from sender s where s.id = p.id)
    and not exists (
      select 1 from public.team_members mine
      join public.team_members theirs on theirs.team_id = mine.team_id
      where mine.person_id = p.id and theirs.person_id in (select s.id from sender s)
    )
  order by p.created_at
  limit least(how_many, 50);
$$;
revoke all on function public.founder_note_due(uuid[], int, int, int) from public, anon, authenticated;
grant execute on function public.founder_note_due(uuid[], int, int, int) to service_role;

-- 17:00 UTC is the morning in the US. Scheduling the same name again
-- replaces the job, so this file can be applied twice. The tests' database
-- has no pg_cron, so there it is skipped.
do $do$
begin
  if (select count(*) from pg_available_extensions where name in ('pg_cron', 'pg_net')) < 2 then
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.schedule(
    'founder-note',
    '0 17 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'founder_note_url'),
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-founder-note-key', (select decrypted_secret from vault.decrypted_secrets where name = 'founder_note_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
end
$do$;
