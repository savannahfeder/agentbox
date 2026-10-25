-- WHAT ELSE HER PHONE MAY ASK HER COMPUTER TO DO (main/phone-inbox.mjs ROUTES):
-- stop an agent, run a thread now, send a waiting message now, reopen a
-- stopped thread, put a thread off to a moment, and answer a permission card
-- (with the fingerprint of the card she read, which her computer checks). Her computer checks each
-- (shared/phone-snapshot.mjs checkCommand) and does it with the window's own
-- handler.
--
-- And the phone names a command itself, so a send whose answer was lost on a
-- poor network and is sent again is the same command, once
-- (`on conflict (id) do nothing`). Everything else about a command is as it
-- was: dated by the database, never born taken, never changed.
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
  check (kind in ('reply', 'new', 'snooze', 'close', 'stop', 'run-now', 'send-now', 'reopen', 'schedule', 'approve'));

grant insert (id, device, project, item, kind, payload) on public.phone_commands to authenticated;
