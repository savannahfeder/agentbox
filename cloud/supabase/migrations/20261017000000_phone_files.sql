-- THE PICTURES, FILMS, SOUNDS AND PAGES YOUR THREADS NAME, FOR YOUR PHONE WITH
-- THE COMPUTER CLOSED (main/phone-uploads.mjs).
--
-- A private bucket. Each person's files are in a folder named by their own id,
-- under the computer that sent them: `<owner>/<device>/<sha256>.<ext>`. Only
-- that person reads, adds or deletes there; nobody may replace a file, since a
-- name is what is in it. The phone reads a file by a link it asks for, signed
-- for an hour.
--
-- Only where Storage exists: the in-process Postgres the tests run every
-- migration in has none unless a test makes a stand-in of it.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('phone-files', 'phone-files', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;

  drop policy if exists phone_files_read on storage.objects;
  create policy phone_files_read on storage.objects for select to authenticated
    using (bucket_id = 'phone-files' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists phone_files_add on storage.objects;
  create policy phone_files_add on storage.objects for insert to authenticated
    with check (
      bucket_id = 'phone-files'
      and (storage.foldername(name))[1] = auth.uid()::text
      and name ~ '^[0-9a-f-]{36}/[0-9a-f]{12}/[0-9a-f]{64}\.[a-z0-9]{1,8}$'
    );

  drop policy if exists phone_files_drop on storage.objects;
  create policy phone_files_drop on storage.objects for delete to authenticated
    using (bucket_id = 'phone-files' and (storage.foldername(name))[1] = auth.uid()::text);
end
$$;
