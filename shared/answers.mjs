// HAS THE AGENT FINISHED ACTING ON WHAT SHE SAID? One rule, read by the
// supervisor (Node) and the inbox (Vite), because the two used to answer it
// differently and both used to answer it wrong.
//
// An answer is a fact with two states and the ledger only ever recorded one of
// them. She writes `answer`, a worker is spawned to carry it, and then the
// worker finishes and leaves the row exactly as it found it: `open`, her answer
// still on it, because the thread is alive and closing it is the wrong move
// (one row was filed on a one-word status question with a whole workstream
// inside it). Nothing on disk said the answer had been DEALT WITH. The only
// record was `_handledAnswers`, in supervisor memory, invisible to the
// renderer and wiped by every "Resume interrupted agents".
//
// So a finished thread was indistinguishable from a stranded one, and read as
// the worse of the two everywhere: out of her inbox, red in In progress, and
// respawnable forever. Twelve of her ro).
//
// `answeredThrough` is that missing fact, written on the item by the supervisor
// when a session finishes: the ts of the answer it acted on. It is compared
// against `wrote.answer.ts` rather than stored as a flag, so her NEXT answer
// carries a later ts and the row goes live again on its own, with nothing to
// clear and nothing to remember to clear.
//
// AND THE SESSION MUST HAVE LEFT A WORD ON THE ROW, which is the half that was
// missing until 2026-08-14 and is the whole of what she saw.
//
// The mark above is written from the SESSION's outcome: its process exited with
// a result and no error. That is a fact about a child process, not about her
// row. A session that spawned, read the brief and exited having written nothing
// satisfies it, and the row is then declared finished-and-delivered while
// carrying the exact words it carried before she spoke.).
//
// It happened five times in her store in two days. On it took 22 seconds: she
// replied at 12:32:19, a session exited at 12:32:42 having touched nothing, and
// the row was back in front of her.
//
// The delivery this rule was written for always had the word in it. Eleven of
// the twelve rows that named the original bug had a RESULT written after her
// answer, and the titles were the reports. So the word is not a new condition,
// it is the one that was assumed: news is news because somebody wrote it.
//
// A WORD IS ONE SHE CAN READ. This branch delivers finished work to her inbox,
// so the only writes that make it news are the ones the row shows her: the
// result, and the title and body a session rewrites when the answer changed
// what they say (instructions.md). Everything else is invisible from where she
// sits, and a row that comes back with nothing readably new is the whole
// complaint however busy the session was.
//
// A `note` is the checkpoint the NEXT session reads, not something she sees,
// and it is excluded for that reason. It cost one real row: on (2026-08-13) she
// answered at 12:32:54, a session wrote a note at 12:57:13 and no result, and
// the row was handed back to her carrying a result written ten minutes BEFORE
// she spoke.
//
// Status is not a word either. Claiming a row and releasing it writes `status`
// twice and says nothing, which is exactly the session this catches. The two
// statuses that would count, `done` and `blocked`, route on their own branches
// in list-rules.ts and never reach this rule.
const SPOKEN = ['result', 'title', 'body'];

export function agentSpokeSince(item, since) {
  return SPOKEN.some((field) => {
    const w = item?.wrote?.[field];
    return !!w && w.source === 'agent' && (w.ts ?? 0) > since;
  });
}

export function answerSettled(item) {
  const answer = item?.answer;
  if (!answer || answer === '(withdrawn)') return false;
  const ts = item?.wrote?.answer?.ts ?? 0;
  if (!(ts > 0 && (item?.answeredThrough ?? 0) >= ts)) return false;
  return agentSpokeSince(item, ts);
}

// The moment of the answer a session was spawned to carry, which is what gets
// written down when it finishes. The app for a row nobody has answered.
export function answerTs(item) {
  return item?.wrote?.answer?.ts ?? 0;
}

// SHE STOPPED THIS ROW AND HAS NOT SPOKEN SINCE. Stop writes `blocked` in her
// hand (zero:stop-session), and it promises the row stays in her inbox until
// she replies, resumes it or sends it back. A reply she wrote BEFORE the stop
// is not one of those, though a kill hands it back to the queue: that is how a
// stopped run came straight back ten seconds later (2026-10-01).
// tests/a-stopped-agent-stays-stopped-until-she-resumes-it.test.mjs
export function stoppedByHer(item) {
  const status = item?.wrote?.status;
  return item?.status === 'blocked' && status?.source === 'founder'
    && answerTs(item) <= (status.ts ?? 0);
}
