-- A FILM CAN BE SHARED BY ITS LINK.
--
-- A film is too big for a link's row, so its link carries only a short list,
-- {"pieces":N,"size":S,"hash":H}, and the film goes raw into the private
-- link-files bucket as 8 MB pieces at `<token>/<hash>/<n>` (main/file-link.mts).
-- Anyone may read a piece while its link is live and holds that hash; a
-- stopped link, or a piece of a copy the link no longer holds, reads as
-- nothing. Only the link's owner adds or deletes pieces, and nobody replaces one.
--
-- Safe to run twice.

alter table public.file_links drop constraint if exists file_links_kind_check;
alter table public.file_links add constraint file_links_kind_check check (kind in ('markdown', 'page', 'image', 'pdf', 'video'));

create or replace function public.share_file(src text, nm text, k text, typ text, b text, v int, h text)
returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text; used int;
begin
  if me is null then raise exception 'sign in to share a file'; end if;
  if k in ('image', 'pdf') and b !~ '^[A-Za-z0-9+/=\s]*$' then raise exception 'a picture or a PDF goes up as base64'; end if;
  if k = 'video' and (b !~ '^\{"pieces":[1-9][0-9]{0,2},"size":[0-9]{1,10},"hash":"[0-9a-f]{40}"\}$' or b !~ ('"hash":"' || coalesce(h, '') || '"')) then
    raise exception 'a film goes up as the list of its pieces';
  end if;
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

-- Whether anyone may read this piece: its link is live, a film, and holds this copy.
create or replace function public.link_piece_is_live(piece text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.file_links l
    where l.token = split_part(piece, '/', 1) and l.stopped_at is null and l.kind = 'video'
      and l.hash = split_part(piece, '/', 2) and piece ~ '^[A-Za-z0-9_-]{16,64}/[0-9a-f]{40}/[0-9]{1,3}$'
  )
$$;

-- Whether this person owns the link a piece goes under; `live`: and it is not stopped.
-- A stopped link's owner still sees its pieces, so they can clear them.
create or replace function public.link_piece_is_mine(piece text, live boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.file_links l
    where l.token = split_part(piece, '/', 1) and l.owner = auth.uid() and (not live or l.stopped_at is null)
  ) and piece ~ '^[A-Za-z0-9_-]{16,64}/[0-9a-f]{40}/[0-9]{1,3}$'
$$;

revoke execute on function public.link_piece_is_live(text), public.link_piece_is_mine(text, boolean) from public, anon, authenticated;
grant execute on function public.link_piece_is_live(text), public.link_piece_is_mine(text, boolean) to anon, authenticated;

-- Only where Storage exists: the in-process Postgres the tests run every
-- migration in has none unless a test makes a stand-in of it.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('link-files', 'link-files', false, 10485760)
  on conflict (id) do update set public = false, file_size_limit = 10485760;

  drop policy if exists link_pieces_read on storage.objects;
  create policy link_pieces_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'link-files' and (public.link_piece_is_live(objects.name) or public.link_piece_is_mine(objects.name, false)));

  drop policy if exists link_pieces_add on storage.objects;
  create policy link_pieces_add on storage.objects for insert to authenticated
    with check (bucket_id = 'link-files' and public.link_piece_is_mine(name, true));

  drop policy if exists link_pieces_drop on storage.objects;
  create policy link_pieces_drop on storage.objects for delete to authenticated
    using (bucket_id = 'link-files' and owner = auth.uid());
end
$$;
