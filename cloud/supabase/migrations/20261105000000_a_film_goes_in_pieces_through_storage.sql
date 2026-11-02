-- A FILM TO A TEAMMATE GOES IN PIECES THROUGH STORAGE.
--
-- A file over 10 MB in a conversation goes as 8 MB pieces (main/team/carry-files.mjs).
-- They were rows of base64 in message_files, so a 625 MB film was 79 rows and
-- 830 MB of database. They now go raw into this private bucket, at
-- `<conversation's project id>/<piece name>`, up to 1 GB a file.
--
-- The same doors as message_files: whoever may see the conversation reads and
-- adds; nobody replaces or deletes, since a piece's name is what is in it.
-- Only where Storage exists: the in-process Postgres the tests run every
-- migration in has none unless a test makes a stand-in of it.
--
-- Safe to run twice.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('message-files', 'message-files', false, 10485760)
  on conflict (id) do update set public = false, file_size_limit = 10485760;

  -- The folder is compared as text, so a name that is no project id finds
  -- nothing rather than failing a cast. `objects.name`, because a bare `name`
  -- inside the subquery is the project's.
  drop policy if exists message_pieces_read on storage.objects;
  create policy message_pieces_read on storage.objects for select to authenticated
    using (
      bucket_id = 'message-files'
      and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and public.can_see_project(p.id))
    );

  drop policy if exists message_pieces_add on storage.objects;
  create policy message_pieces_add on storage.objects for insert to authenticated
    with check (
      bucket_id = 'message-files'
      and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'
      and exists (select 1 from public.projects p where p.id::text = (storage.foldername(objects.name))[1] and public.can_see_project(p.id))
    );
end
$$;
