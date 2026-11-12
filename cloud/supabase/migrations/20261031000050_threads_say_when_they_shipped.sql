-- WHEN A THREAD SHIPPED, ON THE CARD A TEAMMATE READS, so the team can see what
-- shipped this week without asking. A person's mark or the app's own merge note
-- sets it on the owner's copy (shippedAtOf, shared/thread-cards.mjs). The write
-- rules on the card already cover it.
--
-- Safe to run twice.

alter table public.thread_cards add column if not exists shipped_at timestamptz;
