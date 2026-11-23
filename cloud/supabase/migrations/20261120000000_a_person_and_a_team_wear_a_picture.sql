-- YOUR PHOTO AND YOUR TEAM'S LOGO, picked in Settings.
--
-- They go in a public bucket so every copy of the app, the phone and the phone
-- website draw them from a short link: room_profiles.avatar_url holds 500
-- characters, so a picture cannot ride in the row. A file's name is a hash of
-- the picture, so a link is not guessable and one picture is stored once.
--   people/<your id>/<hash>.<ext>   yours alone to add
--   teams/<team id>/<hash>.<ext>    its owner's alone to add
-- Nobody replaces or deletes: a new picture is a new name.
--
-- Safe to run twice.

alter table public.teams add column if not exists logo_url text;
alter table public.teams drop constraint if exists teams_logo_is_a_link;
alter table public.teams add constraint teams_logo_is_a_link
  check (logo_url is null or (char_length(logo_url) <= 500 and logo_url ~ '^https://'));

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('pictures', 'pictures', true, 1048576)
  on conflict (id) do update set public = true, file_size_limit = 1048576;

  drop policy if exists pictures_add on storage.objects;
  create policy pictures_add on storage.objects for insert to authenticated
    with check (
      bucket_id = 'pictures'
      and name ~ '^(people|teams)/[0-9a-f-]{36}/[0-9a-f]{32}\.(png|jpg)$'
      and (
        ((storage.foldername(objects.name))[1] = 'people' and (storage.foldername(objects.name))[2] = auth.uid()::text)
        or ((storage.foldername(objects.name))[1] = 'teams'
            and exists (select 1 from public.teams t where t.id::text = (storage.foldername(objects.name))[2] and public.owns_team(t.id)))
      )
    );
end
$$;
