-- A TASK'S CARD CARRIES WHO GAVE IT AND WHEN IT IS DUE, so everyone on the team
-- can list every task, who has it, when it is due and what it is blocked on
-- (shared/thread-cards.mjs heldTaskCard). Its holder publishes it, and only
-- when its giver let the team read it; the card's write and read rules already
-- cover the column.
--
-- Safe to run twice.

alter table public.thread_cards add column if not exists task jsonb;

alter table public.thread_cards drop constraint if exists a_task_on_a_card_is_small;
alter table public.thread_cards add constraint a_task_on_a_card_is_small check (task is null or pg_column_size(task) <= 2000);
