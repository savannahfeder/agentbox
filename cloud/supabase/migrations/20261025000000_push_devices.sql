-- THE PHONES YOUR ALERTS GO TO (docs/mobile/PLAN.md, "Alerts").
--
--   push_devices   one row per phone with alerts on: its Expo push token,
--                  written by the phone, read by your own computers, which
--                  send the alert. A token is an address anyone holding it
--                  can send to, so nobody else can read it.

create table if not exists public.push_devices (
  owner uuid not null default auth.uid() references public.people(id) on delete cascade,
  token text not null check (token ~ '^ExponentPushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text not null check (platform in ('ios', 'android')),
  app_version text check (length(app_version) <= 40),
  updated_at timestamptz not null default now(),
  primary key (owner, token)
);

alter table public.push_devices enable row level security;
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices for all
  using (owner = auth.uid()) with check (owner = auth.uid());

revoke all on public.push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.push_devices to authenticated;
grant all on public.push_devices to service_role;
