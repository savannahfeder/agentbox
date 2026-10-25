-- YOUR COMPUTER'S SETTINGS ON YOUR PHONE (shared/phone-settings.mjs).
--
--   phone_settings   one row per computer: the copy of its settings that the
--                    phone's Settings pages draw, with no paths and no
--                    instruction text in it, written by that computer;
--   phone_commands   gains `setting`, a change she asks for on her phone. It
--                    belongs to a computer, not a project, so it names
--                    neither a project nor a thread, and every other kind
--                    still names its project.

create table if not exists public.phone_settings (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  device text not null check (device ~ '^[0-9a-f]{12}$'),
  name text not null check (length(name) between 1 and 200),
  settings jsonb not null check (octet_length(settings::text) <= 200000),
  updated_at timestamptz not null default now(),
  primary key (owner, device)
);

alter table public.phone_settings enable row level security;
drop policy if exists phone_settings_own on public.phone_settings;
create policy phone_settings_own on public.phone_settings for all
  using (owner = auth.uid()) with check (owner = auth.uid());

revoke all on public.phone_settings from public, anon, authenticated;
grant select, insert, update, delete on public.phone_settings to authenticated;
grant all on public.phone_settings to service_role;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.phone_commands'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.phone_commands drop constraint %I', c);
  end loop;
end $$;
alter table public.phone_commands alter column project drop not null;
alter table public.phone_commands add constraint phone_commands_kind_check
  check (kind in ('reply', 'new', 'snooze', 'close', 'stop', 'run-now', 'send-now', 'reopen', 'schedule', 'approve', 'setting'));
alter table public.phone_commands add constraint phone_commands_setting_names_no_project
  check ((kind = 'setting') = (project is null) and (kind <> 'setting' or item is null));
