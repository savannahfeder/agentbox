-- A FILE ANYONE WITH ITS LINK CAN READ, AND COMMENT ON ONCE SIGNED IN.
--
-- A person shares one of their files (a document, a page, a picture or a PDF)
-- as a page on the web app: <site>/f/<token>. Nobody signed out reads a table
-- here. They read one live link at a time through file_link_view and
-- file_link_comments_of, by its token, and nothing else: not the owner's email,
-- not their other links, not a stopped link.
--
-- One live link per file on its owner's computer (`source`), so sharing the
-- same file again hands back the same link with the newer copy in it.
--
-- Safe to run twice.

create table if not exists public.file_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  owner uuid not null references public.people(id) on delete cascade,
  source text not null check (char_length(source) between 1 and 400),
  name text not null check (char_length(name) between 1 and 200),
  kind text not null check (kind in ('markdown', 'page', 'image', 'pdf')),
  type text not null check (char_length(type) between 1 and 100),
  body text not null,
  version int not null default 1 check (version >= 1),
  -- The owner's computer compares it with the file on screen, to offer the newer copy.
  hash text not null default '' check (char_length(hash) <= 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stopped_at timestamptz,
  constraint file_link_is_not_huge check (octet_length(body) <= 8400000)
);
create unique index if not exists file_links_one_live on public.file_links (owner, source) where stopped_at is null;
create index if not exists file_links_made on public.file_links (owner, updated_at);

create table if not exists public.file_link_comments (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.file_links(token) on delete cascade,
  by_person uuid not null references public.people(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists file_link_comments_on on public.file_link_comments (token, created_at);
create index if not exists file_link_comments_by on public.file_link_comments (by_person, created_at);

alter table public.file_links enable row level security;
alter table public.file_link_comments enable row level security;
-- Every write and every stranger's read goes through the functions below.
drop policy if exists file_links_own on public.file_links;
create policy file_links_own on public.file_links for select using (owner = auth.uid());

-- Shares the file, or puts the newer copy in its live link. Answers the token.
create or replace function public.share_file(src text, nm text, k text, typ text, b text, v int, h text)
returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text; used int;
begin
  if me is null then raise exception 'sign in to share a file'; end if;
  if k in ('image', 'pdf') and b !~ '^[A-Za-z0-9+/=\s]*$' then raise exception 'a picture or a PDF goes up as base64'; end if;
  select count(*) into used from public.file_links where owner = me and updated_at > now() - interval '10 minutes';
  if used >= 60 then raise exception 'too many shares for now; try again later'; end if;
  update public.file_links set name = nm, kind = k, type = typ, body = b, version = greatest(coalesce(v, 1), 1), hash = coalesce(h, ''), updated_at = now()
    where owner = me and source = src and stopped_at is null
    returning token into tok;
  if tok is null then
    tok := replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 8);
    insert into public.file_links (token, owner, source, name, kind, type, body, version, hash)
      values (tok, me, src, nm, k, typ, b, greatest(coalesce(v, 1), 1), coalesce(h, ''));
  end if;
  return tok;
end $$;

-- The owner's own live link for a file, with how many comments it has.
create or replace function public.my_file_link(src text)
returns table (token text, version int, hash text, created_at timestamptz, updated_at timestamptz, comments int)
language sql stable security definer set search_path = public as $$
  select l.token, l.version, l.hash, l.created_at, l.updated_at,
         (select count(*)::int from public.file_link_comments c where c.token = l.token)
  from public.file_links l
  where l.owner = auth.uid() and l.source = src and l.stopped_at is null
$$;

-- Every live link of this person's, for the one list of what they made public.
create or replace function public.my_file_links()
returns table (token text, source text, name text, kind text, created_at timestamptz, updated_at timestamptz, comments int)
language sql stable security definer set search_path = public as $$
  select l.token, l.source, l.name, l.kind, l.created_at, l.updated_at,
         (select count(*)::int from public.file_link_comments c where c.token = l.token)
  from public.file_links l
  where l.owner = auth.uid() and l.stopped_at is null
  order by l.updated_at desc
  limit 500
$$;

-- Stops a link for good: the page says it was stopped, and its copy is emptied.
create or replace function public.stop_file_link(tok text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in to stop sharing'; end if;
  update public.file_links set stopped_at = now(), body = '', updated_at = now()
    where token = tok and owner = auth.uid() and stopped_at is null;
end $$;

-- What anyone with the link sees. Nothing for a stopped or unknown link.
create or replace function public.file_link_view(tok text)
returns table (name text, kind text, type text, body text, version int, created_at timestamptz, updated_at timestamptz, owner_name text, owner_avatar text, mine boolean)
language sql stable security definer set search_path = public as $$
  select l.name, l.kind, l.type, l.body, l.version, l.created_at, l.updated_at,
         nullif(p.name, ''), p.avatar_url, coalesce(l.owner = auth.uid(), false)
  from public.file_links l join public.people p on p.id = l.owner
  where l.token = tok and l.stopped_at is null
$$;

-- Whether a link was ever made and then stopped, so the page can say so.
create or replace function public.file_link_stopped(tok text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.file_links where token = tok and stopped_at is not null)
$$;

create or replace function public.file_link_comments_of(tok text)
returns table (id uuid, by_name text, by_avatar text, body text, created_at timestamptz, mine boolean, by_owner boolean)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(p.name, ''), 'Someone'), p.avatar_url, c.body, c.created_at,
         coalesce(c.by_person = auth.uid(), false), c.by_person = l.owner
  from public.file_link_comments c
  join public.file_links l on l.token = c.token and l.stopped_at is null
  join public.people p on p.id = c.by_person
  where c.token = tok
  order by c.created_at, c.id
  limit 500
$$;

-- Others' comments on this person's live links since a time, so their computer
-- can put each on the thread the file came from (main/team/link-comments.mjs).
create or replace function public.new_comments_on_my_links(since timestamptz)
returns table (token text, source text, name text, by_name text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.token, l.source, l.name, coalesce(nullif(p.name, ''), 'Someone'), c.body, c.created_at
  from public.file_link_comments c
  join public.file_links l on l.token = c.token and l.stopped_at is null
  join public.people p on p.id = c.by_person
  -- To the millisecond, as the app keeps the newest time it has seen.
  where l.owner = auth.uid() and c.by_person <> l.owner and date_trunc('milliseconds', c.created_at) > since
  order by c.created_at, c.id
  limit 100
$$;

create or replace function public.comment_on_file_link(tok text, b text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out_id uuid; used int; words text := btrim(coalesce(b, ''));
begin
  if me is null then raise exception 'sign in to comment'; end if;
  if regexp_replace(words, '[\s ­ᅟᅠ᠎ -‏ -  -⁤⠀　ㅤ﻿ﾠ]+', '', 'g') = '' then raise exception 'write something first'; end if;
  if char_length(words) > 4000 then raise exception 'a comment is 4000 characters at most'; end if;
  if not exists (select 1 from public.file_links where token = tok and stopped_at is null) then
    raise exception 'this link was stopped';
  end if;
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 minute';
  if used >= 10 then raise exception 'too many comments for now; try again in a minute'; end if;
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 day';
  if used >= 300 then raise exception 'too many comments today; try again tomorrow'; end if;
  insert into public.file_link_comments (token, by_person, body) values (tok, me, words) returning id into out_id;
  return out_id;
end $$;

-- Whoever wrote a comment can take it back, and so can the link's owner.
create or replace function public.remove_file_link_comment(c uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from public.file_link_comments x
    where x.id = c
      and (x.by_person = auth.uid() or exists (select 1 from public.file_links l where l.token = x.token and l.owner = auth.uid()));
end $$;

revoke all on public.file_links, public.file_link_comments from anon, authenticated, public;
grant select on public.file_links to authenticated;

revoke execute on function public.share_file(text, text, text, text, text, int, text), public.my_file_link(text),
  public.stop_file_link(text), public.file_link_view(text), public.file_link_stopped(text),
  public.file_link_comments_of(text), public.comment_on_file_link(text, text), public.remove_file_link_comment(uuid),
  public.new_comments_on_my_links(timestamptz), public.my_file_links()
  from public, anon, authenticated;
grant execute on function public.share_file(text, text, text, text, text, int, text), public.my_file_link(text),
  public.stop_file_link(text), public.comment_on_file_link(text, text), public.remove_file_link_comment(uuid),
  public.new_comments_on_my_links(timestamptz), public.my_file_links()
  to authenticated;
grant execute on function public.file_link_view(text), public.file_link_stopped(text), public.file_link_comments_of(text)
  to anon, authenticated;
