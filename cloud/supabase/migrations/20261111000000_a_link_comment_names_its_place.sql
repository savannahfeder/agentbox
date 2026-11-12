-- A COMMENT ON A SHARED LINK CAN NAME ITS PLACE IN THE FILE, as a note in the
-- app does (shared/artifact-marks.mts NotePlace): a moment in a film and a
-- spot on its frame, a spot on a picture, a page, or words quoted from a
-- document. `place` is null for a comment on the whole file.
--
-- Safe to run twice. Run after 20261105000001_a_file_anyone_with_its_link_can_read.sql.

alter table public.file_link_comments add column if not exists place jsonb;

-- The shapes cleanPlace keeps in shared/artifact-marks.mts, and small.
create or replace function public.link_comment_place_is_fine(p jsonb)
returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'object' and pg_column_size(p) <= 2048 and case p->>'kind'
    when 'whole' then true
    when 'pin' then jsonb_typeof(p->'x') = 'number' and jsonb_typeof(p->'y') = 'number'
      and (p->>'x')::numeric between 0 and 1 and (p->>'y')::numeric between 0 and 1
    when 'time' then jsonb_typeof(p->'s') = 'number' and (p->>'s')::numeric between 0 and 86400
    when 'page' then jsonb_typeof(p->'n') = 'number' and (p->>'n')::numeric between 1 and 100000
    when 'quote' then jsonb_typeof(p->'text') = 'string' and char_length(p->>'text') between 1 and 500
    else false end
$$;

alter table public.file_link_comments drop constraint if exists file_link_comments_place_check;
alter table public.file_link_comments add constraint file_link_comments_place_check check (place is null or public.link_comment_place_is_fine(place));

-- The old two-word call stays answered: `p` defaults to null.
drop function if exists public.comment_on_file_link(text, text);
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
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 minute';
  if used >= 10 then raise exception 'too many comments for now; try again in a minute'; end if;
  select count(*) into used from public.file_link_comments where by_person = me and created_at > now() - interval '1 day';
  if used >= 300 then raise exception 'too many comments today; try again tomorrow'; end if;
  if p is not null and not public.link_comment_place_is_fine(p) then raise exception 'that is not a place in the file'; end if;
  insert into public.file_link_comments (token, by_person, body, place) values (tok, me, words, p) returning id into out_id;
  return out_id;
end $$;

drop function if exists public.file_link_comments_of(text);
create or replace function public.file_link_comments_of(tok text)
returns table (id uuid, by_name text, by_avatar text, body text, created_at timestamptz, mine boolean, by_owner boolean, place jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(p.name, ''), 'Someone'), p.avatar_url, c.body, c.created_at,
         coalesce(c.by_person = auth.uid(), false), c.by_person = l.owner, c.place
  from public.file_link_comments c
  join public.file_links l on l.token = c.token and l.stopped_at is null
  join public.people p on p.id = c.by_person
  where c.token = tok
  order by c.created_at, c.id
  limit 500
$$;

drop function if exists public.new_comments_on_my_links(timestamptz);
create or replace function public.new_comments_on_my_links(since timestamptz)
returns table (token text, source text, name text, by_name text, body text, created_at timestamptz, place jsonb)
language sql stable security definer set search_path = public as $$
  select l.token, l.source, l.name, coalesce(nullif(p.name, ''), 'Someone'), c.body, c.created_at, c.place
  from public.file_link_comments c
  join public.file_links l on l.token = c.token and l.stopped_at is null
  join public.people p on p.id = c.by_person
  -- To the millisecond, as the app keeps the newest time it has seen.
  where l.owner = auth.uid() and c.by_person <> l.owner and date_trunc('milliseconds', c.created_at) > since
  order by c.created_at, c.id
  limit 100
$$;

revoke execute on function public.comment_on_file_link(text, text, jsonb), public.new_comments_on_my_links(timestamptz), public.file_link_comments_of(text)
  from public, anon, authenticated;
grant execute on function public.comment_on_file_link(text, text, jsonb), public.new_comments_on_my_links(timestamptz) to authenticated;
grant execute on function public.file_link_comments_of(text) to anon, authenticated;
