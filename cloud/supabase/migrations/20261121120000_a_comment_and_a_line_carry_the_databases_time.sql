-- A COMMENT AND A LINE CARRY THE DATABASE'S TIME.
--
-- Whether a helper's comment reaches the owner's agent is judged by when it was
-- written and when the ask was handed back, and both times are these columns.
-- A client could send its own value, so a helper could backdate a comment or
-- date a hand-back years ahead. The app never sends either column, so honest
-- copies see no change.
--
-- Safe to run twice.

create or replace function public.stamp_created_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists thread_comments_stamp on public.thread_comments;
create trigger thread_comments_stamp before insert on public.thread_comments
  for each row execute function public.stamp_created_at();

drop trigger if exists lines_stamp on public.lines;
create trigger lines_stamp before insert on public.lines
  for each row execute function public.stamp_created_at();
