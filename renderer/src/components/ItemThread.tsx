// HER OWN TASK, AS A CONVERSATION — the other half of the one chat screen.
//
// WHAT WAS THERE BEFORE. A task drew exactly one field: the newest of the
// result, the checkpoint and the ask. Everything else was behind the time under
// the title, in a list of one-line sentences. That is the shape that made a
// worker's checkpoint erase the ask the user had typed, on the user's own
// screen, and it is the same shape the agent rows were taken out of in August,
// for the same reason.
//
// So this reads the row's ledger and the traces its workers left, hands both to
// item-thread.ts, and draws the result with the SAME component the Claude Code
// sessions use. The newest answer is the last message in it, at full size and
// at the bottom, which is where the thread opens.
//
// AND IT DRAWS THE RUN THAT IS HAPPENING RIGHT NOW, in the stream, at the
// moment each line was typed. Those lines used to be in a block of their own
// above the conversation. While a session is up this re-reads the trace every
// few seconds and the new lines arrive at the foot of the thread.
//
// NOTHING NEW IS STORED AND NOTHING IS WRITTEN. Two files that already exist
// are read, and the marks a Z left on this Mac (../undo-marks).

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { changePathFor, type Change } from '../code-artifact';
import { filedOnTurn } from '../filed-in-thread';
import { itemThread, type PendingSaid } from '../item-thread';
import { resultLeads } from '../recap';
import { withoutTrailingWork } from '../trailing-work';
import { marksFor, readUndoMarks, UNDO_MARKS_EVENT, type UndoMark } from '../undo-marks';
import type { LedgerLine } from '../thread-history';
import type { TraceSession } from '../notes';
import type { RunningSession, WorkItem } from '../types';
import { ActLine, Thread, ThreadWaiting } from './Thread';
import { ThreadsMade, type MadeRow } from './ThreadsMade';

// THE BACKSTOP, NOT THE HEARTBEAT.
//
// This used to be the only thing that moved the screen, and the note here said
// eight seconds was fast enough because a real run writes 6.6 lines a minute.
// That is the wrong test. What is felt is not the average, it is the wait:
// measured over 1,664 traces, the gap before a line of agent prose has
// a median of 8 seconds and a 90th of 35, and this timer was adding up to
// another 8 on top of every one of them.
//
// The app has known the instant a worker writes a line the whole time. The
// supervisor fires its change hook on every stdout line and `main/ipc.mjs`
// coalesces those into one `zero:changed` push every 400ms. So the read is
// hung off that push now, and this timer stays only for the things no push
// covers: a trace written by an Agentbox in another window, and a session whose
// last line arrived before the pane was opened.
const REFRESH_MS = 8_000;

// Who is talking, when it is not her. The app has one word for this everywhere
// else it says it out loud, and a second word for the same thing on the same
// screen is the kind of drift this row exists to end.
const THEM = 'The agent';

export function ItemThread({ item, engine, session, opening, sending, filed = [], onOpenFiled, onApproveFiled, onOpenOrigin, onSendNow, md, clean, onOpenDoc, chat = false, onQuote, onHandToAgent }: {
  item: WorkItem;
  // THE THREADS THIS ONE FILED, EACH ON THE TURN THAT FILED IT (w-2e13752a85).
  // They used to be one block under the whole conversation, which left the
  // morning's three threads standing over the composer all evening. The rule
  // for which turn is ../filed-in-thread.ts, and it reads the moment each one
  // was created against the moments in this conversation; `at` is that moment.
  filed?: Array<MadeRow & { at: number }>;
  onOpenFiled?: (id: string) => void;
  // The press that starts one, beside its name (w-9cf2b43110).
  onApproveFiled?: (id: string) => void;
  // IN A CHAT ONLY: put a message's words in the reply box as a quote, and turn
  // this conversation into work. The second was a line under the whole
  // conversation and is an action on one message now (w-560647d4db).
  onQuote?: (text: string) => void;
  onHandToAgent?: () => void;
  // CUT THE RUNNING STEP so her waiting message is answered now (w-f37a34def6).
  // Handed in: this view draws a conversation and never writes anything.
  onSendNow?: () => unknown;
  /** A conversation with a person: drawn as a chat (item-thread.ts). */
  chat?: boolean;
  // WHICH CODING AGENT THIS ROW RUNS ON, main's answer off the snapshot. One
  // sentence in the conversation turns on it -- `blocked` after one of Claude
  // Code's eight commands is an ANSWER, and on the other engine the same reply
  // was an ordinary message and `blocked` means what it always meant.
  // thread-history.ts holds the whole of why. Null on every Mac with one coding
  // agent, where the thread reads exactly as it always did.
  engine?: string | null;
  // Non-null while a worker is on this row right now.
  session: RunningSession | null;
  // THE USER'S ASK, WHEN IT WAS TYPED ON THE ROW ABOVE THIS ONE.
  //
  // It is the first message of the conversation, in full, rather than a quoted
  // box over the top of it.
  //
  // It is a message and not a heading, so it obeys everything a message obeys:
  // it wears the user's name and the time it was sent, and the pane lands at
  // the newest thing said rather than on it. That last part matters because a
  // long ask leading the pane wastes the most valuable space on the screen.
  // First in the conversation is not the same as first on the screen.
  opening?: { text: string; at: number; on: string } | null;
  // WHAT SHE SENT IN THE LAST FEW SECONDS AND THE LEDGER DOES NOT HAVE YET.
  //
  // A reply to a running worker is handed to the session first and written to
  // the row only once the agent acknowledges it, which it does at its next
  // break; until then this thread, which is drawn off the row, had nothing of
  // hers in it.
  //
  // App.tsx holds them, because it is what does the sending, and drops each one
  // when the send fails. What drops them on success is the ledger itself: the
  // committed copy arrives on the next read and cancels this one inside
  // `itemThread`, so there is no moment where neither is on the screen.
  sending?: PendingSaid[];
  // Open the row the opening message was said on.
  onOpenOrigin?: () => void;
  md: (text: string) => ReactNode;
  // Open a file beside the conversation, optionally standing on one file
  // inside it. This is what a chip on a work line presses.
  onOpenDoc?: (src: string, at?: string) => void;
  // What the pane has already taken off a message: the live options list, which
  // is drawn on the composer, and the "## Gist" heading old workers wrote. The
  // pane owns that knowledge, not this component, because both belong to
  // surfaces that sit outside the thread.
  clean: (text: string) => string;
}) {
  const [ledger, setLedger] = useState<{ lines: LedgerLine[]; error?: string } | null>(null);
  const [sessions, setSessions] = useState<TraceSession[]>([]);
  // EVERY FILE THIS ROW'S RUNS CHANGED, so a line in the conversation that says
  // it edited one can become a chip into it. Empty on the great majority of
  // rows, because most runs answer a question or draw a page and change no code
  // at all; then nothing in the thread is a chip and the conversation is
  // exactly what it was.
  const [changed, setChanged] = useState<string[]>([]);
  // WHETHER THE MIDDLE OF THIS CONVERSATION WAS ASKED BACK. Held per row and
  // dropped when she leaves it, so no thread is ever born at full length: the
  // window is still what a long row opens with, and this is the door out of it.
  // It survives the poll while a worker writes, because losing the messages she
  // just went looking for every eight seconds is the same fault wearing a
  // timer.
  const [whole, setWhole] = useState(false);
  useEffect(() => { setWhole(false); }, [item.product, item.id]);

  // THE Zs PRESSED ON THIS TASK, each drawn as one of her actions
  // (../undo-marks, w-c78d1e1607). Read again the moment a new one is left, so
  // the Z that brought her back to this thread is already on it.
  const [undoMarks, setUndoMarks] = useState<UndoMark[]>(() => readUndoMarks());
  useEffect(() => {
    const reread = () => setUndoMarks(readUndoMarks());
    window.addEventListener(UNDO_MARKS_EVENT, reread);
    return () => window.removeEventListener(UNDO_MARKS_EVENT, reread);
  }, []);

  // THE CONVERSATION IS EMPTIED WHEN SHE CHANGES ROWS, AND AT NO OTHER TIME.
  //
  // This used to sit at the top of the read below, whose deps include
  // `item.updatedAt`, so every write to the row she was reading blanked her
  // screen to the loading skeleton and drew the whole thread again a moment
  // later. The write that does that most is the one this row is about: her own
  // reply committing. So the sequence she saw when she answered a working agent
  // was nothing, then nothing, then the conversation flashing away and coming
  // back with her message in it.
  //
  // Emptying is only right when what is on the screen belongs to another task.
  // A re-read of the same row keeps what is drawn until the new lines arrive,
  // which is what makes a pending message survive its own commit.
  useEffect(() => {
    setLedger(null);
    setSessions([]);
    setChanged([]);
  }, [item.product, item.id]);

  // Read fresh every time she opens a task: a worker may have written three
  // lines since the pane was drawn, and a conversation is the one surface where
  // being one event behind is worse than being slow.
  useEffect(() => {
    let live = true;
    const read = () => {
      api.itemHistory({ product: item.product, id: item.id })
        .then((r) => { if (live) setLedger({ lines: r?.lines ?? [], error: r?.ok ? undefined : r?.error }); })
        .catch((err) => { if (live) setLedger({ lines: [], error: String((err as Error)?.message ?? err) }); });
      api.sessionTrace({ product: item.product, id: item.id })
        .then((r) => { if (live) setSessions(r?.sessions ?? []); })
        .catch(() => { if (live) setSessions([]); });
      // The change is re-read on the same beat as the trace, because the run
      // that is writing the trace is the run that will write the change, and it
      // writes it the moment it exits. Without this she would have to leave the
      // row and come back before a file she watched being edited became
      // pressable.
      api.codeChange({ product: item.product, src: changePathFor(item.id) })
        .then((r) => {
          if (!live) return;
          const files = (r?.ok ? (r.change as Change | undefined)?.files : null) ?? [];
          setChanged(files.map((f) => f.path).filter(Boolean));
        })
        .catch(() => { if (live) setChanged([]); });
    };
    read();
    // Only while something is running. A finished row does not change under
    // her, and a timer on every open task is a poll per row she reads.
    if (!session) return () => { live = false; };
    // ON THE PUSH, NOT ON THE TIMER. `zero:changed` fires within 400ms of the
    // worker writing anything at all, which is the difference between a work
    // line appearing when it happens and appearing up to eight seconds later.
    // The read itself is unchanged and already guards against overlapping.
    const off = api.onChanged(read);
    const timer = setInterval(read, REFRESH_MS);
    return () => { live = false; off(); clearInterval(timer); };
  }, [item.product, item.id, item.updatedAt, session?.startedAt]);

  if (!ledger) return <ThreadWaiting head="Reading this conversation…" />;
  if (ledger.error) return <div className="thread-wait">{ledger.error}</div>;

  // WHAT THE RUNNING AGENT IS TYPING THIS SECOND. It rides on the snapshot,
  // which is refetched on the same 400ms push the read above is hung off, so
  // this string grows on her screen while the sentence is being written
  // instead of appearing whole a median of eight seconds later. Null on
  // every row with nothing running on it.
  const saying = session?.saying && session.sayingAt
    ? { text: session.saying, at: session.sayingAt, run: session.startedAt }
    : null;
  const built = itemThread(ledger.lines, sessions, saying, { whole, engine, pending: sending, chat, undone: marksFor(undoMarks, item.product, item.id) });
  const said = built.events.map((e) => (e.kind === 'work' ? e : { ...e, text: clean(e.text ?? '') }));
  /* * WHILE AN AGENT IS WORKING, THE LAST THING ON THE PAGE IS THE THINKING
     COMPONENT, AND THE COMMANDS UNDER IT ARE ITS OWN.

     The live mark (./Live.tsx) already carries the running command as its word,
     a `+3` for the ones behind it, and the whole list when she opens it. The
     thread was ALSO drawing every one of those as a work line directly above it,
     so the same command was on her screen twice, in two shapes, a few pixels
     apart, and the one that moved was not the one nearer the bottom.

     SO THE TRAILING RUN OF WORK GOES, AND ONLY THE TRAILING RUN. The rule:
     steps with text after them stay where they are, because they
     are what the agent did before it said something and the mark has moved on
     from them. What is removed is exactly the stretch the mark is currently
     speaking for: the work since the last thing anybody said.

     ONLY WHILE A SESSION IS UP. The moment the run ends there is no mark to
     stand in for them, so they come straight back as the record of what the run
     did, and nothing is lost by hiding them meanwhile.

     The rule itself is in ../trailing-work.ts, where a test can reach it.
  */
  const shown = session ? withoutTrailingWork(said) : said;
  // The opening ask goes in front of everything, as a message. It is never windowed
  // away, because the window keeps the opening of a conversation and this IS
  // the opening.
  const events = opening
    ? [{ at: opening.at, who: 'you' as const, text: opening.text, on: opening.on }, ...shown]
    : shown;
  const { omitted, outcome, after } = built;
  if (!said.length && !opening && !outcome) return <div className="thread-wait">Nothing has been said here yet.</div>;

  // WHICH TURN EACH FILED THREAD BELONGS TO. Measured against `events`, which
  // is the list handed to `Thread` below, because the indexes it answers with
  // are that list's. Everything belonging to the newest turn comes back in
  // `atFoot` and is drawn under the checkpoint, which is that turn's last word.
  const made = filedOnTurn(events, filed);
  const madeList = (rows: typeof filed) => (
    <ThreadsMade rows={rows} label="Filed from this thread" onOpen={(id) => onOpenFiled?.(id)} onApprove={onApproveFiled} />
  );

  // THE ANSWER, WHOLE, AT THE FOOT OF THE CONVERSATION.
  //
  // A row still in flight keeps the label, which is the only thing telling the
  // two apart. What changed is where they sit. They used to be instead of the
  // conversation; they are now under it, and the thread above no longer draws
  // this message twice.
  const answer = outcome && (
    resultLeads(item) && outcome.field === 'result'
      ? <div className="outcome">{md(clean(outcome.text))}</div>
      : (
        <div className="appendix appendix-foot">
          <div className="appendix-label">{outcome.field === 'result' ? 'Result' : 'Latest checkpoint'}</div>
          {md(clean(outcome.text))}
        </div>
      )
  );

  return (
    <>
      <Thread
        events={events}
        omitted={omitted}
        chat={chat}
        name={THEM}
        landOn={item.id}
        onWhole={() => setWhole(true)}
        onOpenOrigin={onOpenOrigin}
        // Only a running Claude Code step can be cut; Codex takes her message
        // at its next step whatever is pressed.
        onSendNow={session && (session.engine ?? engine) !== 'codex'
          ? onSendNow
          : undefined}
        md={md}
        code={changed.length && onOpenDoc
          ? { paths: changed, open: (path) => onOpenDoc(changePathFor(item.id), path) }
          : null}
        tail={(i) => { const rows = made.onTurn.get(i); return rows ? madeList(rows) : null; }}
        {...(chat ? {
          // ONLY IN A CHAT. The chips, the bar on pointing and the quote are
          // drawing A's, and a thread with an agent keeps exactly the screen it
          // had (w-560647d4db). `reactions` is folded off the row itself, so
          // every press a teammate pushed is on screen the moment the pull
          // lands, with nothing counted here.
          reactions: item.reactions,
          onReact: (on: string, emoji: string, off: boolean) => {
            api.teamReact({ product: item.product, id: item.id, on, emoji, off });
          },
          onQuote,
          onHandToAgent,
        } : {})}
      />
      {answer}
      {/* What you did after that answer, under it and in order. */}
      {after.length > 0 && (
        <div className={`act-after${chat ? ' is-chat' : ''}`}>
          {after.map((act, i) => <ActLine key={`${act.at}-${i}`} act={act} />)}
        </div>
      )}
      {/* AND WHAT THE NEWEST TURN FILED, under its own last word. */}
      {madeList(made.atFoot)}
    </>
  );
}
