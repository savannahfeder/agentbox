-- WHO IS SUBSCRIBED (docs/cloud/PLAN.md, "Plans").
--
--   cloud_plans   one row per account: the plan the cloud server is holding
--                 it to, and `give`, the plan you want it on. The server's
--                 ledger in S3 is still what a run start reads, in the same
--                 write that counts the runs against the plan; this is the
--                 copy a person and an owner can see, and the one place a
--                 plan is given without an AWS sign-in.
--
-- Who is subscribed, by address:
--   select p.email, c.plan, c.source, c.at from public.cloud_plans c
--     join public.people p on p.id = c.person order by c.at desc;
--
-- Give someone Pro. The server takes it up within five minutes, writes the
-- plan back here, and clears `give`:
--   insert into public.cloud_plans (person, give)
--     select id, 'pro' from public.people where email = 'them@example.com'
--     on conflict (person) do update set give = 'pro';

create table if not exists public.cloud_plans (
  person uuid primary key references public.people(id) on delete cascade,
  -- The plan names live in cloud/gateway/plans.mjs, which the server checks
  -- `give` against, so a new plan needs no change here.
  plan text not null default 'none',
  source text check (source in ('stripe', 'given')),
  give text,
  -- The ledger's count of plan changes. A write older than the row's own is
  -- refused, so one that arrives late cannot put back a plan left behind.
  rev bigint not null default 0,
  at timestamptz not null default now()
);

alter table public.cloud_plans enable row level security;
-- A person reads their own plan and writes nothing: the server writes as the
-- service role, so no sign-in can give itself a plan.
drop policy if exists cloud_plans_own on public.cloud_plans;
create policy cloud_plans_own on public.cloud_plans
  for select using (person = auth.uid());

revoke all on public.cloud_plans from public, anon, authenticated;
grant select on public.cloud_plans to authenticated;
grant all on public.cloud_plans to service_role;
