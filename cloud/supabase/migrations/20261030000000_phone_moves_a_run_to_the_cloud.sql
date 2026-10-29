-- The phone's "Move to cloud" on a thread running on the computer
-- (main/phone-inbox.mjs ROUTES 'move-to-cloud'). The kind check is replaced
-- whole, as 20261023000000_phone_settings.sql did, and the setting rule that
-- also names `kind` goes back as it was.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.phone_commands'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.phone_commands drop constraint %I', c);
  end loop;
end $$;
alter table public.phone_commands add constraint phone_commands_kind_check
  check (kind in ('reply', 'new', 'snooze', 'close', 'stop', 'run-now', 'send-now', 'reopen', 'schedule', 'approve', 'setting', 'move-to-cloud'));
alter table public.phone_commands add constraint phone_commands_setting_names_no_project
  check ((kind = 'setting') = (project is null) and (kind <> 'setting' or item is null));
