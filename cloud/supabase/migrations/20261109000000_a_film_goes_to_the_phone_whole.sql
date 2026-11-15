-- A FILM GOES TO THE PHONE WHOLE, UP TO 500 MB.
--
-- The phone-files bucket took 25 MB a file, so every finished cut an agent
-- named reached the phone as "too big for your phone". The computer now sends
-- films up to 500 MB (UPLOAD_LIMITS.filmBytes in main/phone-uploads.mts) and
-- everything else still up to 25 MB. The project's own storage limit, set in
-- the dashboard, must be at least this; a film it turns away reads as too big.
--
-- Safe to run twice.
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    return;
  end if;
  update storage.buckets set file_size_limit = 524288000 where id = 'phone-files';
end
$$;
