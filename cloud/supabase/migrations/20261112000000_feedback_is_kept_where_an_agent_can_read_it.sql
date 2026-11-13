-- FEEDBACK IS KEPT WHERE AN AGENT CAN READ IT (w-52761c8004).
--
-- functions/feedback keeps each piece of feedback here as well as mailing it,
-- and `npm run feedback` reads it back. What people write can be private, so
-- no policy: only the function, as service_role, and the database's owner
-- (the Supabase sign-in the script uses) can reach it.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  words text not null default '',
  app_version text not null default '',
  os text not null default '',
  install text not null default '',
  mailed boolean not null default false,
  mail_error text
);
create index if not exists feedback_sent_at on public.feedback (sent_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to service_role;

-- The attachments, as the base64 they arrived in: at most 8 MB per piece.
create table if not exists public.feedback_files (
  feedback_id bigint not null references public.feedback(id) on delete cascade,
  position int not null,
  name text not null,
  type text not null,
  bytes int not null,
  data text not null,
  primary key (feedback_id, position)
);
alter table public.feedback_files enable row level security;
revoke all on public.feedback_files from anon, authenticated;
grant select, insert on public.feedback_files to service_role;

-- One call, so a piece is kept whole or not at all.
create or replace function public.keep_feedback(
  the_words text, the_version text, the_os text, the_install text,
  was_mailed boolean, why_not_mailed text, the_files jsonb
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare kept bigint;
begin
  insert into public.feedback (words, app_version, os, install, mailed, mail_error)
  values (coalesce(the_words, ''), coalesce(the_version, ''), coalesce(the_os, ''), coalesce(the_install, ''), coalesce(was_mailed, false), why_not_mailed)
  returning id into kept;
  insert into public.feedback_files (feedback_id, position, name, type, bytes, data)
  select kept, (f.ord - 1)::int, f.value->>'name', coalesce(f.value->>'type', 'application/octet-stream'),
         coalesce((f.value->>'bytes')::int, 0), f.value->>'data'
  from jsonb_array_elements(coalesce(the_files, '[]'::jsonb)) with ordinality as f(value, ord);
  return kept;
end $$;
revoke all on function public.keep_feedback(text, text, text, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.keep_feedback(text, text, text, text, boolean, text, jsonb) to service_role;
