-- A SHARED LINK SAYS WHO CAN OPEN IT AND WHAT THEY CAN DO, AND KEEPS ITS HISTORY.
--
-- Until now anyone with a link could read it and, signed in, comment. Now the
-- owner picks:
--   access  'anyone' (anyone with the link) or 'people' (only the people added)
--   can     what the link itself lets them do: 'view', 'comment' or 'edit'
-- and adds people by email, each with their own 'view', 'comment' or 'edit'.
-- A person gets the most either gives them. Only a document or a table
-- (kind 'markdown') can be edited on its page; elsewhere edit counts as comment.
-- Signed out, a person may read what the link lets them read, but a comment or
-- an edit carries a name, so writing asks them to sign in.
--
-- Every copy a document or a page holds is kept in file_link_versions, so its
-- owner and its editors can look back and restore one. One person's edits within
-- ten minutes of each other are one version, as typing saves every second.
--
-- An edit made on the page is marked changed_on_web until the owner's computer
-- has written it into their files as the next version (main/team/link-edits.mts).
--
-- Safe to run twice.

alter table public.file_links add column if not exists access text not null default 'anyone';
alter table public.file_links add column if not exists can text not null default 'comment';
alter table public.file_links add column if not exists rev int not null default 1;
alter table public.file_links add column if not exists changed_by uuid references public.people(id) on delete set null;
alter table public.file_links add column if not exists changed_on_web boolean not null default false;
alter table public.file_links drop constraint if exists file_links_access_check;
alter table public.file_links add constraint file_links_access_check check (access in ('anyone', 'people'));
alter table public.file_links drop constraint if exists file_links_can_check;
alter table public.file_links add constraint file_links_can_check check (can in ('view', 'comment', 'edit'));

create table if not exists public.file_link_people (
  token text not null references public.file_links(token) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  can text not null check (can in ('view', 'comment', 'edit')),
  added_at timestamptz not null default now(),
  primary key (token, email)
);

create table if not exists public.file_link_versions (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.file_links(token) on delete cascade,
  rev int not null,
  body text not null,
  hash text not null default '',
  by_person uuid references public.people(id) on delete set null,
  how text not null check (how in ('shared', 'edited', 'restored')),
  created_at timestamptz not null default now(),
  at timestamptz not null default now(),
  constraint file_link_version_is_not_huge check (octet_length(body) <= 8400000)
);
create index if not exists file_link_versions_of on public.file_link_versions (token, at desc);

alter table public.file_link_people enable row level security;
alter table public.file_link_versions enable row level security;
revoke all on public.file_link_people, public.file_link_versions from anon, authenticated, public;

-- A document's or a page's copy as it already was, so its history starts with it.
insert into public.file_link_versions (token, rev, body, hash, by_person, how, created_at, at)
  select l.token, l.rev, l.body, l.hash, l.owner, 'shared', l.updated_at, l.updated_at
  from public.file_links l
  where l.stopped_at is null and l.kind in ('markdown', 'page')
    and not exists (select 1 from public.file_link_versions v where v.token = l.token);

create or replace function public.link_rank(c text) returns int
language sql immutable as $$
  select case c when 'view' then 1 when 'comment' then 2 when 'edit' then 3 when 'owner' then 4 else 0 end
$$;

-- What this person may do with a live link: 'owner', 'edit', 'comment', 'view', or null for nothing.
create or replace function public.file_link_can_of(tok text) returns text
language plpgsql stable security definer set search_path = public as $$
declare l public.file_links; me uuid := auth.uid(); mail text; best int := 0; got text;
begin
  select * into l from public.file_links where token = tok and stopped_at is null;
  if not found then return null; end if;
  if me is not null and l.owner = me then return 'owner'; end if;
  if l.access = 'anyone' then best := public.link_rank(l.can); end if;
  if me is not null then
    select lower(u.email) into mail from auth.users u where u.id = me and u.email_confirmed_at is not null;
    if mail is not null then
      select p.can into got from public.file_link_people p where p.token = tok and p.email = mail;
      best := greatest(best, public.link_rank(got));
    end if;
  end if;
  if best = 3 and l.kind <> 'markdown' then best := 2; end if;
  return case best when 1 then 'view' when 2 then 'comment' when 3 then 'edit' else null end;
end $$;

-- Which door a link is for this person: open, sign-in, no-access, stopped or unknown.
create or replace function public.file_link_door(tok text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.file_links where token = tok and stopped_at is null) then
    return case when exists (select 1 from public.file_links where token = tok) then 'stopped' else 'unknown' end;
  end if;
  if public.file_link_can_of(tok) is not null then return 'open'; end if;
  return case when auth.uid() is null then 'sign-in' else 'no-access' end;
end $$;

drop function if exists public.file_link_view(text);
create function public.file_link_view(tok text)
returns table (name text, kind text, type text, body text, version int, created_at timestamptz, updated_at timestamptz,
               owner_name text, owner_avatar text, mine boolean, can text, rev int, changed_by_name text, anyone boolean)
language sql stable security definer set search_path = public as $$
  -- `anyone`: the site's own /raw address reads it signed out, so the page may frame it from there.
  select l.name, l.kind, l.type, l.body, l.version, l.created_at, l.updated_at,
         nullif(p.name, ''), p.avatar_url, coalesce(l.owner = auth.uid(), false),
         public.file_link_can_of(l.token), l.rev,
         case when l.changed_by is not null and l.changed_by <> l.owner then coalesce(nullif(c.name, ''), 'Someone') end,
         l.access = 'anyone'
  from public.file_links l
  join public.people p on p.id = l.owner
  left join public.people c on c.id = l.changed_by
  where l.token = tok and l.stopped_at is null and public.file_link_can_of(l.token) is not null
$$;

-- A viewer reads the file only; comments are for those who may write one.
create or replace function public.file_link_comments_of(tok text)
returns table (id uuid, by_name text, by_avatar text, body text, created_at timestamptz, mine boolean, by_owner boolean, place jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(p.name, ''), 'Someone'), p.avatar_url, c.body, c.created_at,
         coalesce(c.by_person = auth.uid(), false), c.by_person = l.owner, c.place
  from public.file_link_comments c
  join public.file_links l on l.token = c.token and l.stopped_at is null
  join public.people p on p.id = c.by_person
  where c.token = tok and public.link_rank(public.file_link_can_of(tok)) >= 2
  order by c.created_at, c.id
  limit 500
$$;

-- `p`, a place in the file, as 20261111000000_a_link_comment_names_its_place.sql gave it.
create or replace function public.comment_on_file_link(tok text, b text, p jsonb default null)
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
  if public.link_rank(public.file_link_can_of(tok)) < 2 then raise exception 'this link lets you read it, not comment'; end if;
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 minute';
  if used >= 10 then raise exception 'too many comments for now; try again in a minute'; end if;
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 day';
  if used >= 300 then raise exception 'too many comments today; try again tomorrow'; end if;
  if p is not null and not public.link_comment_place_is_fine(p) then raise exception 'that is not a place in the file'; end if;
  insert into public.file_link_comments (token, by_person, body, place) values (tok, me, words, p) returning id into out_id;
  return out_id;
end $$;

-- Puts a copy in the link's history: one person's edits close together are one version.
create or replace function public.keep_file_link_version(tok text, r int, b text, h text, who uuid, how_ text)
returns void
language plpgsql security definer set search_path = public as $$
declare last public.file_link_versions;
begin
  select * into last from public.file_link_versions where token = tok order by at desc, rev desc limit 1;
  if how_ = 'edited' and found and last.how = 'edited' and last.by_person = who and last.at > now() - interval '10 minutes' then
    update public.file_link_versions set rev = r, body = b, hash = h, at = now() where id = last.id;
  else
    insert into public.file_link_versions (token, rev, body, hash, by_person, how) values (tok, r, b, h, who, how_);
  end if;
  delete from public.file_link_versions where id in (
    select id from public.file_link_versions where token = tok order by at desc, rev desc offset 100
  );
end $$;

create or replace function public.share_file(src text, nm text, k text, typ text, b text, v int, h text)
returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text; used int; was text; r int;
begin
  if me is null then raise exception 'sign in to share a file'; end if;
  if k in ('image', 'pdf') and b !~ '^[A-Za-z0-9+/=\s]*$' then raise exception 'a picture or a PDF goes up as base64'; end if;
  if k = 'video' and (b !~ '^\{"pieces":[1-9][0-9]{0,2},"size":[0-9]{1,10},"hash":"[0-9a-f]{40}"\}$' or b !~ ('"hash":"' || coalesce(h, '') || '"')) then
    raise exception 'a film goes up as the list of its pieces';
  end if;
  select count(*) into used from public.file_links where owner = me and updated_at > now() - interval '10 minutes';
  if used >= 60 then raise exception 'too many shares for now; try again later'; end if;
  select token, hash into tok, was from public.file_links where owner = me and source = src and stopped_at is null for update;
  if tok is not null then
    update public.file_links set name = nm, kind = k, type = typ, body = b, version = greatest(coalesce(v, 1), 1), hash = coalesce(h, ''),
        updated_at = now(), rev = rev + case when was is distinct from coalesce(h, '') then 1 else 0 end,
        changed_by = case when was is distinct from coalesce(h, '') then null else changed_by end,
        changed_on_web = false
      where token = tok returning rev into r;
    if k in ('markdown', 'page') and was is distinct from coalesce(h, '') then
      perform public.keep_file_link_version(tok, r, b, coalesce(h, ''), me, 'shared');
    end if;
  else
    tok := replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 8);
    insert into public.file_links (token, owner, source, name, kind, type, body, version, hash)
      values (tok, me, src, nm, k, typ, b, greatest(coalesce(v, 1), 1), coalesce(h, ''));
    if k in ('markdown', 'page') then perform public.keep_file_link_version(tok, 1, b, coalesce(h, ''), me, 'shared'); end if;
  end if;
  return tok;
end $$;

-- An editor's words, saved over the copy they started from. `base` is the rev
-- they started from: a save over someone else's newer copy is refused, and the
-- page merges the two and saves again.
create or replace function public.edit_file_link(tok text, b text, base int)
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.file_links; h text; r int;
begin
  if me is null then raise exception 'sign in to edit'; end if;
  select * into l from public.file_links where token = tok and stopped_at is null for update;
  if not found then raise exception 'this link was stopped'; end if;
  if public.link_rank(public.file_link_can_of(tok)) < 3 then raise exception 'this link does not let you edit'; end if;
  if l.kind <> 'markdown' then raise exception 'only a document or a table can be edited on its page'; end if;
  if b is null or octet_length(b) > 6000000 then raise exception 'this is too big to save'; end if;
  if l.rev <> base then raise exception 'changed since you opened it'; end if;
  if b = l.body then return l.rev; end if;
  h := left(encode(sha256(convert_to(b, 'UTF8')), 'hex'), 40);
  update public.file_links set body = b, hash = h, rev = rev + 1, updated_at = now(), changed_by = me, changed_on_web = true
    where token = tok returning rev into r;
  perform public.keep_file_link_version(tok, r, b, h, me, 'edited');
  return r;
end $$;

-- The link's history, newest first, for its owner and its editors. No copies in it: one is read at a time.
create or replace function public.file_link_history(tok text)
returns table (id uuid, rev int, how text, by_name text, by_owner boolean, at timestamptz, current boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.rev, v.how, coalesce(nullif(p.name, ''), 'Someone'), v.by_person = l.owner, v.at, v.hash = l.hash and v.rev = l.rev
  from public.file_link_versions v
  join public.file_links l on l.token = v.token and l.stopped_at is null
  left join public.people p on p.id = v.by_person
  where v.token = tok and public.link_rank(public.file_link_can_of(tok)) >= 3
  order by v.at desc, v.rev desc
  limit 100
$$;

create or replace function public.file_link_version(tok text, v uuid)
returns text
language sql stable security definer set search_path = public as $$
  select x.body from public.file_link_versions x
  where x.id = v and x.token = tok and public.link_rank(public.file_link_can_of(tok)) >= 3
$$;

create or replace function public.restore_file_link_version(tok text, v uuid, base int)
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.file_links; old public.file_link_versions; r int;
begin
  if me is null then raise exception 'sign in to restore a version'; end if;
  select * into l from public.file_links where token = tok and stopped_at is null for update;
  if not found then raise exception 'this link was stopped'; end if;
  if public.link_rank(public.file_link_can_of(tok)) < 3 then raise exception 'this link does not let you edit'; end if;
  select * into old from public.file_link_versions where id = v and token = tok;
  if not found then raise exception 'that version is gone'; end if;
  if l.rev <> base then raise exception 'changed since you opened it'; end if;
  if old.hash = l.hash then return l.rev; end if;
  update public.file_links set body = old.body, hash = old.hash, rev = rev + 1, updated_at = now(), changed_by = me, changed_on_web = true
    where token = tok returning rev into r;
  perform public.keep_file_link_version(tok, r, old.body, old.hash, me, 'restored');
  return r;
end $$;

-- Who the owner added, with the name of each one who has an account.
create or replace function public.file_link_people_of(tok text)
returns table (email text, can text, name text, avatar text, added_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.email, x.can, nullif(p.name, ''), p.avatar_url, x.added_at
  from public.file_link_people x
  join public.file_links l on l.token = x.token and l.owner = auth.uid() and l.stopped_at is null
  left join lateral (select pp.name, pp.avatar_url from public.people pp where lower(pp.email) = x.email limit 1) p on true
  where x.token = tok
  order by x.added_at, x.email
$$;

create or replace function public.set_file_link_access(tok text, acc text, c text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if acc not in ('anyone', 'people') or c not in ('view', 'comment', 'edit') then raise exception 'that is not a way to share'; end if;
  update public.file_links set access = acc, can = c where token = tok and owner = auth.uid() and stopped_at is null;
  if not found then raise exception 'this link was stopped'; end if;
end $$;

-- Adds a person by email, changes what they can do, or with `c` null takes them off.
create or replace function public.set_file_link_person(tok text, mail text, c text)
returns void
language plpgsql security definer set search_path = public as $$
declare m text := lower(btrim(coalesce(mail, ''))); n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from public.file_links where token = tok and owner = auth.uid() and stopped_at is null) then
    raise exception 'this link was stopped';
  end if;
  if c is null then
    delete from public.file_link_people where token = tok and email = m;
    return;
  end if;
  if c not in ('view', 'comment', 'edit') then raise exception 'that is not a way to share'; end if;
  if char_length(m) > 254 or m !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'that is not an email address'; end if;
  select count(*) into n from public.file_link_people where token = tok;
  if n >= 200 and not exists (select 1 from public.file_link_people where token = tok and email = m) then
    raise exception 'a link holds 200 people at most';
  end if;
  insert into public.file_link_people (token, email, can) values (tok, m, c)
    on conflict (token, email) do update set can = excluded.can;
end $$;

drop function if exists public.my_file_link(text);
create function public.my_file_link(src text)
returns table (token text, version int, hash text, created_at timestamptz, updated_at timestamptz, comments int,
               access text, can text, rev int, changed_on_web boolean, changed_by_name text)
language sql stable security definer set search_path = public as $$
  select l.token, l.version, l.hash, l.created_at, l.updated_at,
         (select count(*)::int from public.file_link_comments c where c.token = l.token),
         l.access, l.can, l.rev, l.changed_on_web,
         case when l.changed_by is not null and l.changed_by <> l.owner then coalesce(nullif(p.name, ''), 'Someone') end
  from public.file_links l
  left join public.people p on p.id = l.changed_by
  where l.owner = auth.uid() and l.source = src and l.stopped_at is null
$$;

-- This person's links whose copy was changed on the web and is not yet in their files.
create or replace function public.my_links_changed_on_web()
returns table (token text, source text, name text, rev int, hash text, version int, changed_by_name text)
language sql stable security definer set search_path = public as $$
  select l.token, l.source, l.name, l.rev, l.hash, l.version, coalesce(nullif(p.name, ''), 'Someone')
  from public.file_links l
  left join public.people p on p.id = l.changed_by
  where l.owner = auth.uid() and l.stopped_at is null and l.changed_on_web
  order by l.updated_at
  limit 50
$$;

-- The owner's computer wrote copy `r` into their files as version `v`. A newer edit since stays marked.
create or replace function public.file_link_brought_home(tok text, r int, v int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update public.file_links set changed_on_web = false, version = greatest(coalesce(v, version), 1)
    where token = tok and owner = auth.uid() and stopped_at is null and rev = r;
end $$;

create or replace function public.stop_file_link(tok text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in to stop sharing'; end if;
  update public.file_links set stopped_at = now(), body = '', updated_at = now()
    where token = tok and owner = auth.uid() and stopped_at is null;
  if found then
    delete from public.file_link_versions where token = tok;
    delete from public.file_link_people where token = tok;
  end if;
end $$;

-- A film's piece reads only for someone the link lets in.
create or replace function public.link_piece_is_live(piece text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.file_links l
    where l.token = split_part(piece, '/', 1) and l.stopped_at is null and l.kind = 'video'
      and l.hash = split_part(piece, '/', 2) and piece ~ '^[A-Za-z0-9_-]{16,64}/[0-9a-f]{40}/[0-9]{1,3}$'
      and public.file_link_can_of(l.token) is not null
  )
$$;

revoke execute on function public.link_rank(text), public.file_link_can_of(text), public.file_link_door(text),
  public.file_link_view(text), public.keep_file_link_version(text, int, text, text, uuid, text),
  public.edit_file_link(text, text, int), public.file_link_history(text), public.file_link_version(text, uuid),
  public.restore_file_link_version(text, uuid, int), public.file_link_people_of(text),
  public.set_file_link_access(text, text, text), public.set_file_link_person(text, text, text),
  public.my_file_link(text), public.my_links_changed_on_web(), public.file_link_brought_home(text, int, int)
  from public, anon, authenticated;
grant execute on function public.file_link_door(text), public.file_link_view(text), public.file_link_history(text),
  public.file_link_version(text, uuid)
  to anon, authenticated;
grant execute on function public.edit_file_link(text, text, int), public.restore_file_link_version(text, uuid, int),
  public.file_link_people_of(text), public.set_file_link_access(text, text, text), public.set_file_link_person(text, text, text),
  public.my_file_link(text), public.my_links_changed_on_web(), public.file_link_brought_home(text, int, int)
  to authenticated;
