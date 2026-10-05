// THE ONE CONVERSATION SCREEN. Every chat in this app is drawn here.
//
// This was the body of AgentThread and it drew exactly one kind of chat: a
// Claude Code session that had been imported. The user's own tasks, which are
// most of what gets opened, showed a single field instead and hid the rest
// behind the time under the title. Both now come through here. What differs
// between them is where the events are READ (AgentThread reads a transcript on
// disk, ItemThread reads the row's own ledger and its session traces); what
// they look like, how they fold, where they open and what a work line does are
// this file's, once.
//
// EVERYTHING BELOW WAS CHOSEN EARLIER AND IS UNCHANGED BY THE MOVE:
//
//   Shape B, "the conversation with the work in it": what it SAID at reading
//   size, what it RAN quiet underneath, in the order it happened. Nothing is
//   picked over, so nothing can be picked wrong.
//
//   IT OPENS AT THE BOTTOM. The newest thing said is the thing she came for.
//   Instantly, never smoothly — nothing animates.
//
//   Round two: option 3, frosted, semi-transparent and blurred. The values
//   live in the stylesheet under `.agent-thread`, not here.
//
// Round three: consecutive tool calls fold into one line, and what is never
// folded is a failure.

import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Face, TeamContext, firstName } from '../team/people';
import { activitySummary, keepActivityKeyLocal } from '../activity-summary';
import { actWhen, actWords } from '../act-line';
import { herTurnEnds, herTurnStarts } from '../her-turns';
import { holdAtBottom } from '../thread-bottom';
import { clock, dayHeading } from '../thread-history';
import { chatLayout } from '../team/chat-layout';
import { ChatFold } from '../team/ChatFold';
import { AgentAnswers } from '../team/ChatAgents';
import {
  conversationGap, fileInChange, gapIndex, groupWork, outputCut, runFailures, runOverflow, runSummary,
} from '../../../shared/agents.mjs';
import type { AgentEvent, AgentTurn, AgentWork } from '../types';

// How much of an output stands open before she asks for the rest. The chosen
// drawings show five or six lines: enough to see what came back, short
// enough that four of them in a row do not bury the sentence underneath.
const OUTPUT_LINES = 6;

// What the thread draws, after the runs have been folded. Every node carries
// the index it had in the raw list, which is what the open-map is keyed on.
type Indexed<T> = T & { i: number };
export type ThreadNode =
  | Indexed<AgentEvent>
  | { kind: 'run'; at: number; items: Indexed<AgentWork>[]; i?: undefined };

// THE WAY FROM A LINE IN THE CHAT INTO THE CODE.
//
// The thread does not know what a change is and must not learn: it draws two
// completely different conversations (a Claude Code transcript and one of her
// own tasks) and the artifact only exists for one of them. So the caller hands
// down the list of paths the change holds and what to do with one, and this
// file's whole part is to draw the chip and match the line to the list.
//
// A CHIP IS A PROMISE THE FILE OPENS. Nothing becomes one unless the change
// actually holds it, which is the same rule the attachment row on the card has
// followed since 08-19: a chip that opens the wrong file is worse than no chip
// at all, because nothing on screen says it is wrong.
export interface CodeInThread {
  // Every path in the run's change, in the change's own shape.
  paths: string[];
  // Open the change at one of them.
  open: (path: string) => void;
}

export function Thread({ events, omitted = 0, onWhole, onOpenOrigin, onSendNow, name, landOn, md, code, chat = false }: {
  // CUT THE AGENT'S CURRENT STEP so a message of hers that is waiting on it is
  // answered now (w-f37a34def6). Absent where nothing can be cut.
  onSendNow?: () => unknown;
  events: AgentEvent[];
  /** A conversation with a person: what is not on screen is the oldest part,
   *  so its line sits at the top, the way a chat's history does. */
  chat?: boolean;
  // How many messages are not on screen, when the middle of a long
  // conversation was cut. The app on a task, which is never long enough to cut.
  omitted?: number;
  // ASK FOR THE MIDDLE BACK. Required rather than optional, and that is the
  // whole of it: a window with no door is what put hundreds of messages out
  // of reach behind a line that could not be pressed. Whoever draws a thread has
  // to have somewhere for that line to go.
  onWhole: () => void;
  // Open the row a message carrying `on` was said on. Nothing draws that line
  // without it, so a thread with no parent simply never sets `on`.
  onOpenOrigin?: () => void;
  // NO COUNT LINE OVER THE CONVERSATION.
  //
  // It looked pressable and was a plain div, so it read as a door onto the rest
  // of a conversation that was already whole on the screen. The one line in a
  // thread that IS a door stays, and it says so in words: "Show the 63 messages
  // in between". A count on top of that is a second, false one.
  //
  // ThreadWaiting keeps a head, because that one is a sentence saying the page
  // is still loading, not a tally of what is already drawn.
  // Whose messages these are, on every block that is not hers.
  name: string;
  // What "this is a different conversation" means. Changing it lands her at the
  // bottom again; anything else must not yank the page while she reads back.
  landOn: string;
  md: (text: string) => ReactNode;
  // The change this conversation made, when there is one. Absent means every
  // work line stays the plain line it has always been.
  code?: CodeInThread | null;
}) {
  // Which work lines are open, and how far. Kept per conversation, not globally.
  const [open, setOpen] = useState<Map<number, number>>(new Map());
  // Which folded RUNS she has opened, by the index of their first line. Runs
  // are aggregated, and a run she opened stays open while she reads.
  const [runsOpen, setRunsOpen] = useState<Set<number>>(new Set());
  const foot = useRef<HTMLDivElement>(null);
  // A TEAMMATE'S MESSAGE is theirs, not "You": drawn with their face and name.
  const team = useContext(TeamContext);
  const teammateOf = (e: AgentEvent) => {
    const by = (e as { by?: string }).by;
    return team && by && by !== team.me ? team.byId.get(by) ?? { id: by, email: '', name: 'A teammate', avatarUrl: null } : null;
  };

  useEffect(() => {
    setOpen(new Map());
    setRunsOpen(new Set());
  }, [landOn]);

  // Send now was pressed and the agent has not taken her words yet. One flag
  // for the thread: the cut answers every message waiting, not only one.
  const [cutting, setCutting] = useState(false);
  const waiting = events.some((e) => e.kind !== 'work' && e.pending && !e.held);
  useEffect(() => { if (!waiting) setCutting(false); }, [waiting]);

  // AT THE BOTTOM, ON THE NEWEST THING SAID. That is the whole reason for this
  // shape.
  //
  // THE BOTTOM IS THE SCROLLING BOX'S BOTTOM, NOT THIS COMPONENT'S. Below the
  // thread and inside the same box sit the files this row named and the row's
  // own buttons, so bringing the thread's own foot into view left 120px out of
  // sight on every session measured, and 1,713px on the one that carries two
  // embedded document previews under its thread, because those load in an
  // iframe and grow the page after the scroll has already fired (measured
  // 2026-08-20, `scripts/measure-thread-open.mjs`).So the hold is on the box,
  // and it sticks there until she scrolls up (../thread-bottom).
  //
  // ONE ARMING PER CONVERSATION, AND THE CONVERSATION IS `landOn`. This used to
  // depend on `events.length` as well, with a ref guarding against re-arming,
  // and the pair of them cancelled each other out: React runs the previous
  // effect's cleanup before the next one, so the FIRST time a message arrived
  // the hold was released, and the guard then declined to put it back. On a row
  // with a worker on it that is the first poll, seconds after she opens it. The
  // stick lives on the box rather than on the render, so it does not need to be
  // rebuilt every time somebody says something.
  useEffect(() => {
    const box = foot.current?.closest('.focus-scroll') as HTMLElement | null;
    return holdAtBottom(box);
  }, [landOn]);

  // Where the missing middle is: after the opening, which is always kept. Drawn
  // where the gap actually is rather than as a note at the top, because that is
  // where she meets it.
  //
  // THE RULE IS `gapIndex`, BESIDE THE CUT ITSELF. It used to be a loop here
  // with a second, different count, and the two drifted: see the note on
  // `gapIndex` in shared/agents.mjs for the 56 rows that put the line in the
  // wrong place. One rule, one file, and they cannot disagree again.
  const gapAfter = chat ? -2 : gapIndex(events, omitted);

  // HER PLACE ON THE PAGE, ACROSS THE MIDDLE COMING BACK.
  //
  // Opening the gap inserts messages ABOVE where she is reading, and a page that
  // grows above the fold moves everything she was looking at down by however
  // tall the new part is. So the distance from her position to the BOTTOM is
  // recorded before the press and restored after it, which leaves every line she
  // could see exactly where it was. It is the same box `holdAtBottom` writes to,
  // and the two never disagree: if she was resting at the end, bottom-distance
  // zero and the stick both mean the end.
  const anchor = useRef<number | null>(null);
  const scrollBox = () => foot.current?.closest('.focus-scroll') as HTMLElement | null;
  const openGap = () => {
    const box = scrollBox();
    anchor.current = box ? box.scrollHeight - box.scrollTop : null;
    onWhole();
  };
  useLayoutEffect(() => {
    const from = anchor.current;
    if (from === null) return;
    anchor.current = null;
    const box = scrollBox();
    if (box) box.scrollTop = Math.max(0, box.scrollHeight - from);
  }, [events]);

  // CONSECUTIVE TOOL CALLS FOLD INTO ONE LINE, aggregated behind one toggle
  // rather than each drawn on its own. The rule and
  // the threshold live in shared/work-lines.mjs with the histogram that set
  // them. Each node keeps the index it had in the raw list, because that is
  // what the open-map is keyed on and what the gap below is measured against.
  const nodes = groupWork(events.map((e, i) => ({ ...e, i })), { min: 1 }) as ThreadNode[];
  // WHICH OF HER MESSAGES OPEN A CHAPTER, and so wear the rule above them. The
  // whole of when is in ../her-turns.ts; the cut middle counts as a break.
  const cutAt = nodes.findIndex((e) => (e.kind === 'run' ? e.items[e.items.length - 1]?.i : e.i) === gapAfter);
  const turnStarts = herTurnStarts(nodes, cutAt);
  const turnEnds = herTurnEnds(nodes, cutAt);
  // A CONVERSATION WITH A PERSON IS LAID OUT AS A CHAT (w-2e8aa16f0f): a face
  // in a column, one head per run of messages, a line for each day. Which
  // message opens what is ../team/chat-layout.ts; a folded run is work to it.
  const slots = chat ? chatLayout(nodes.map((e) => (e.kind === 'run' ? { kind: 'work', at: e.at } : e))) : null;
  // What a message's head says beside the name, in either layout: sending, the
  // way to cut the agent's step, and which row the words were said on.
  const headFacts = (e: AgentTurn, time: string) => <>
    {/* SENT, AND THE AGENT HAS NOT TAKEN IT YET (w-1ef03d6f27).
        It stands where the time stands, because it is the same
        fact: a message with no time on it has not happened to
        anybody but her yet. The real time replaces it when the
        agent picks the message up, which is the only moment at
        which the row knows one. */}
    {/* AND WHETHER Z STILL REACHES IT: three seconds, then
        `steer` has it. See `held` in types.ts (w-5281ef1221). */}
    {/* AND, ONCE IT IS IN LINE, THAT IT IS WAITING ON THE STEP THE
        AGENT IS IN, which can be a command minutes long, with
        the one way to stop waiting (w-f37a34def6). */}
    {e.pending
      ? <span className="msg-when msg-sending">{e.held ? 'Sending… press Z to undo' : cutting ? 'Sending now…' : onSendNow ? 'Waiting for its current step' : 'Sending…'}</span>
      : <span className="msg-when">{time}</span>}
    {e.pending && !e.held && !cutting && onSendNow && (
      <button type="button" className="msg-now" onClick={() => { setCutting(true); onSendNow(); }}>
        Send now
      </button>
    )}
    {/* WHICH ROW THESE WORDS ARE ON, when they are not on this
        one. It rides the message's own head rather than a box
        above the conversation (w-23db941885), so the way back
        to the row it was typed on survives without a second
        component owning the top of the screen. */}
    {e.on && (
      <button type="button" className="msg-on" onClick={onOpenOrigin}>
        on {e.on}
      </button>
    )}
  </>;

  return (
    <div className="thread">
      {chat && omitted > 0 && (
        <button type="button" className="thread-gap thread-gap-top" onClick={openGap}>
          {`Show ${omitted} earlier message${omitted === 1 ? '' : 's'}`}
        </button>
      )}
      {nodes.map((e, n) => {
        // A folded run answers to the index of its first line, so opening one
        // survives the thread reloading under her while an agent works.
        const key = e.kind === 'run' ? (e.items[0]?.i ?? -1) : e.i;
        // AND THE GAP ANSWERS TO THE LAST LINE IN THE NODE, not the first. The
        // seam can fall on work rather than on a message now, and consecutive
        // work is folded into one run: matching on `key` would look for the seam
        // at the run's opening line and never find it, taking the door off the
        // screen on exactly the rows that need it.
        const ends = e.kind === 'run' ? (e.items[e.items.length - 1]?.i ?? -1) : e.i;
        const stepLine = (k: number, next: number) => setOpen((was) => {
          const map = new Map(was);
          if (next === SHUT) map.delete(k); else map.set(k, next);
          return map;
        });
        // WHAT THIS BLOCK HOLDS, SAID ON THE BLOCK ITSELF. The thread is a
        // flex column and every event was wrapped in an anonymous div, so
        // `.did + .did` and its neighbours never matched anything: a work line
        // is never the sibling of another work line, only the child of a
        // wrapper that is. Every spacing rule written against those selectors
        // was dead, and the 22px column gap was the only thing setting the
        // rhythm. Naming the wrapper is what lets the rhythm be set at all.
        const slot = slots?.[n];
        const holds = e.kind === 'run' ? 'is-run'
          : e.kind === 'work' ? (e.yours ? 'is-act' : 'is-work')
          : slot && !slot.head ? 'is-msg is-chat-cont'
          : e.same ? 'is-msg-same' : 'is-msg';
        return (
        <div key={`${e.at}-${key}-${n}`} className={`thread-block ${holds} ${ends === gapAfter ? 'has-gap' : ''}`}>
          {slot?.day && <div className="chat-day">{slot.day}</div>}
          {e.kind === 'work' && e.yours
            ? <ActLine act={e} />
            : e.kind === 'run'
            ? <RunLine
                items={e.items}
                open={runsOpen.has(key)}
                onToggle={() => setRunsOpen((was) => {
                  const next = new Set(was);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                lineState={(k) => open.get(k) ?? SHUT}
                onStepLine={stepLine}
                code={code}
              />
            : e.kind === 'work'
            ? <WorkLine
                work={e}
                state={open.get(key) ?? SHUT}
                onStep={(next) => stepLine(key, next)}
                code={code}
              />
            : slot ? (<>
              {/* A MESSAGE BETWEEN PEOPLE (w-2e8aa16f0f). The face holds the
              // column; a message that carries on a run keeps the column for its
              // time, shown on pointing. None of the agent thread's chapters:
              // no rule above or below your words and no larger type, because
              // a turn means nothing between two people. */}
              <div className={`msg chat-msg${slot.head ? '' : ' cont'}${e.pending ? ' sending' : ''}`}>
                <div className="chat-gutter">{slot.head
                  ? <Face person={teammateOf(e) ?? (team?.me ? team.byId.get(team.me) : null)} me={!teammateOf(e) && e.who === 'you'} agent={e.who === 'it'} size="lg" />
                  : <span className="chat-gt">{clock(e.at)}</span>}</div>
                {slot.head && (
                  <div className="msg-head">
                    <span className="msg-who">{teammateOf(e)?.name ?? (e.who === 'you' ? 'You' : name)}</span>
                    {headFacts(e, clock(e.at))}
                  </div>
                )}
                <ChatFold>{md(e.text ?? '')}</ChatFold>
              </div>
              {/* AN AGENT IT MENTIONED ANSWERS UNDER IT (w-7b9cb8636a). */}
              <AgentAnswers text={e.text ?? ''} md={md} />
            </>) : (
              // A CONTINUATION THAT OPENS THE OTHER SIDE OF THE GAP IS NOT A
              // CONTINUATION OF ANYTHING SHE CAN SEE. `same` means one agent
              // still talking, so the block wears no name and no time; across
              // the cut, whatever it was continuing is in the missing middle,
              // and it hangs off whichever message the opening ended on. That
              // was most of the cut conversations measured. `resumed` is the window
              // saying so, and here it gets its name back. The fold is
              // untouched, so the header still counts it as one message with
              // the half she cannot see.
              <div className={`msg ${e.who === 'you' && !teammateOf(e) ? 'yours' : ''} ${turnStarts[n] ? 'turn' : ''} ${turnEnds[n] ? 'turn-end' : ''}${e.same && !e.resumed ? 'same' : ''} ${e.pending ? 'sending' : ''}`}>
                {(!e.same || e.resumed) && (
                  <div className="msg-head">
                    <span className="msg-who">{teammateOf(e)
                      ? <><Face person={teammateOf(e)} />{firstName(teammateOf(e))}</>
                      : e.who === 'you' ? 'You' : name}</span>
                    {headFacts(e, when(e.at))}
                  </div>
                )}
                <div className="msg-body">{md(e.text ?? '')}</div>
              </div>
            )}
          {ends === gapAfter && (
            <button type="button" className="thread-gap" onClick={openGap}>
              {conversationGap(omitted)}
            </button>
          )}
        </div>
        );
      })}
      <div ref={foot} />
    </div>
  );
}

// THE PAGE, BEFORE IT HAS ARRIVED. Not a spinner and not a sentence on an
// empty screen: the shape of a conversation, still and quiet, so the pane is
// never blank and the words land where the grey already is.
//
// The pattern is fixed rather than random. It is 827px tall against the 793px
// pane she reads at (measured), so the page is full and carries on past the
// fold the way a real conversation does; and being fixed, the same row opens
// the same way twice, which a random one does not.
const WAITING: Array<{ who: 'you' | 'them'; lines: number[] } | { work: number }> = [
  { who: 'them', lines: [96, 88, 61] },
  { work: 54 },
  { work: 38 },
  { who: 'you', lines: [72] },
  { who: 'them', lines: [93, 84, 90, 47] },
  { work: 46 },
  { who: 'them', lines: [88, 71] },
  { work: 61 },
  { who: 'them', lines: [91, 86, 94, 79, 52] },
  { who: 'you', lines: [83, 44] },
  { who: 'them', lines: [90, 76, 58] },
];

export function ThreadWaiting({ head }: { head: ReactNode }) {
  return (
    <div className="thread thread-waiting" aria-busy="true">
      <div className="thread-head">{head}</div>
      {WAITING.map((row, i) => ('work' in row ? (
        <div key={i} className="sk-did" style={{ width: `${row.work}%` }} />
      ) : (
        <div key={i} className={`sk-msg ${row.who === 'you' ? 'yours' : ''}`}>
          <div className="sk-name" />
          {row.lines.map((w, j) => <div key={j} className="sk-line" style={{ width: `${w}%` }} />)}
        </div>
      )))}
    </div>
  );
}

// THE MARK IS DRAWN, NOT TYPED.
//
// It was `›` and `⌄`, two typographic characters, and that was the fault. A
// glyph has whatever size, weight and side bearing the font
// gives it, it sits on the font's baseline rather than on the line it belongs
// to, and the two characters are not the same shape rotated: `›` is a quote
// mark and `⌄` is an arrowhead. Measured before the change: the mark's box was
// 9 x 16.5 inside a 19.5 line and the glyph itself was drawn well above the
// verb's centre.
//
// Drawn, it is one shape at one size, turned a quarter for open, and centred on
// the line rather than sat on a baseline. It does not animate turning, because
// nothing in this app animates.
const chevron = (
  <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true" focusable="false">
    <path
      d="M2.6 1.2 L5.6 4 L2.6 6.8"
      fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// Measured over seven imported sessions the same day: 535 work lines in
// 162 runs, three of them 20 lines long. Folding every run of three or more
// takes 413 of those lines off the screen and leaves 204, and the threshold is
// out of the histogram rather than out of taste (shared/work-lines.mjs).
//
// WHAT IS NEVER FOLDED IS A FAILURE. The closed line says how many of the calls
// inside it failed, in the same colour a single failed line uses, because a
// fold she has to open to find bad news in is worse than the wall it replaced.
function RunLine({ items, open, onToggle, lineState, onStepLine, code }: {
  items: (AgentWork & { i: number })[];
  open: boolean;
  onToggle: () => void;
  lineState: (key: number) => number;
  onStepLine: (key: number, next: number) => void;
  code?: CodeInThread | null;
}) {
  const failed = runFailures(items);
  return (
    <div className={`did-run ${open ? 'open' : ''}`}>
      <button className="did-head did-run-head" onKeyDown={keepActivityKeyLocal} aria-expanded={open} title={runSummary(items)} onClick={onToggle}>
        <span className="did-run-mark">{chevron}</span>
        <span className="did-verb">{activitySummary(items)}</span>
        {!!failed && <span className="did-run-bad">{failed}</span>}
      </button>
      {open && (
        <div className="did-run-body">
          {items.map((w) => (
            <WorkLine
              key={w.i}
              work={w}
              state={lineState(w.i)}
              onStep={(next) => onStepLine(w.i, next)}
              code={code}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ONE THING IT RAN, IN THREE STATES, which is what the chosen sheet
// draws: shut it is a single line saying what it did and which one; opened it
// carries the first few lines of what came back; and if there is more than
// that, one more press has all of it. Three rather than two because the whole
// reason a run of these can sit between her question and its answer is that
// each one is a LINE, and a line that opens onto forty is not one.
const SHUT = 0;
const OPEN = 1;
const ALL = 2;

function WorkLine({ work, state, onStep, code }: {
  work: AgentWork;
  state: number;
  onStep: (next: number) => void;
  code?: CodeInThread | null;
}) {
  const all = (work.output ?? '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
  // A line could read `ran grep -o '"id":""' work-items.jso…`, two
  // characters short of whole, and pressing it could not show the rest.
  //
  // `full` only ever travelled when OUR shortening changed the string (a `cd`
  // prelude peeled off, a path trimmed). A command that needed no shortening
  // and simply ran past the end of the column arrived with `full` empty, so the
  // ellipsis was the end of it. Measured over 1,532 traces on 2026-08-24 at
  // the 44 characters of command the column fits: 68,524 work lines, 39,258 cut
  // by the box, and 13,522 of those unrecoverable. The median cut line loses 55
  // characters, so this is not a near miss.
  //
  // THE BROWSER IS ASKED RATHER THAN A WIDTH GUESSED. `scrollWidth` past
  // `clientWidth` is the box saying it clipped, which is exact at any
  // window, and re-asked when the window changes size. A fixed
  // character budget would be right on one Mac, which is the fault
  // `shortPath`'s `home` argument already exists to avoid.
  const cmd = useRef<HTMLElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = cmd.current;
    if (!el) { setClipped(false); return undefined; }
    const check = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    check();
    const watch = new ResizeObserver(check);
    watch.observe(el);
    return () => watch.disconnect();
  }, [work.subject]);
  // What it did is a line whether or not anything came back from it, so a work
  // line with no output is still a line and simply does not open. A line whose
  // SUBJECT was shortened opens too, even with nothing back from it, because
  // the whole string is then the only thing behind the press — and so does a
  // line the box cut, for the same reason.
  const canOpen = all.length > 0 || !!work.full || clipped;
  // THE WHOLE STRING, wherever it is. `full` when our own shortening dropped
  // something, and the subject itself when the box is the only thing that cut
  // it: that string is already whole, it simply did not fit.
  const whole = work.full || (clipped ? work.subject : '');
  const shown = state === ALL ? all : all.slice(0, OUTPUT_LINES);
  const rest = all.length - shown.length;
  // WHICH FILE IN THE CHANGE THIS LINE IS, or null. Null is the ordinary case
  // and it draws exactly what it drew before this existed.
  const inChange = code && work.file ? fileInChange(code.paths, work.file) : null;
  const note = canOpen && state === SHUT && work.lines > 1
    ? <span className="did-note">{work.lines} lines</span>
    : null;

  return (
    <div className={`did ${work.failed ? 'bad' : ''} ${state !== SHUT ? 'open' : ''}`}>
      {/* THE ROW IS TWO CONTROLS WHEN THE FILE OPENS, AND THEY DO DIFFERENT
          THINGS. Pressing the line still folds it open onto what came back;
          pressing the file opens the code. The chip is a sibling of the fold
          rather than a child of it because a button inside a button is not a
          thing a browser will draw, so the head gives up the subject on the
          lines that have a chip and keeps it on every other line. */}
      <div className="did-line">
      <button
        className="did-head"
        onKeyDown={keepActivityKeyLocal}
        onClick={() => onStep(state === SHUT ? OPEN : SHUT)}
        disabled={!canOpen}
      >
        {/* Both halves of that are gone: the line no longer hangs, so the chevron sits on
           the reading column, and a line with no chevron starts its verb there instead of
           behind an empty 8px box. That empty box is exactly what read as indented on
           w-c61a4f5ad3. See the note by `--did-hang` in styles.css.
         */}
        {canOpen && <span className="did-mark">{chevron}</span>}
        <span className="did-verb">{work.verb}</span>
        {work.subject && !inChange && <code className="did-cmd" ref={cmd}>{work.subject}</code>}
        {!inChange && note}
      </button>
      {inChange && (
        <button
          type="button"
          className="did-file"
          title={`Open ${inChange} in the code`}
          onClick={() => code!.open(inChange)}
        >
          <span className="did-file-mark" aria-hidden="true" />
          <code className="did-cmd" ref={inChange ? cmd : undefined}>{work.subject || inChange}</code>
        </button>
      )}
      {inChange && note}
      </div>

      {/* THE WHOLE STRING, WHERE IT IS RECOVERABLE. 61% of the work lines measured were
          cut by the ellipsis and the six worst showed 2% of themselves, all of
          them a real command behind a `cd` into an absolute path. The head now
          shows the command itself; this is where the rest of the line went, and
          it wraps rather than clips because here there is room. */}
      {state !== SHUT && !!whole && <pre className="did-full">{whole}</pre>}
      {state !== SHUT && all.length > 0 && <pre className="did-out">{shown.join('\n')}</pre>}
      {state === OPEN && rest > 0 && (
        <button className="did-more" onClick={() => onStep(ALL)}>show all {all.length} lines</button>
      )}

      {/* WHAT WAS NOT KEPT, SAID OUT LOUD. One session held 8MB
          of output, so an output is capped where it is read. A cap that does
          not say it is a cap is the app quietly rounding off, which is the
          thing she notices and stops trusting. */}
      {state === ALL && !!outputCut(all.length, work.lines) && (
        <div className="did-cut">{outputCut(all.length, work.lines)}</div>
      )}
      {!!work.more && <div className="did-cut">{runOverflow(work.more)}</div>}
    </div>
  );
}

/**
 * SOMETHING YOU DID, as one point on a short timeline (w-49b4e45403): a small
 * ring, a few words ("Snoozed until tomorrow 9:00am"), and the time in the
 * header's mono caps. A pick fills the ring and shows the option brighter.
 *
 * Not a work line: nothing opens, it never folds into the agent's run, and it
 * carries its own time, because when you put something off is the point of
 * seeing it. The first build was a grey sentence with a long time after it and
 * was turned down as ugly; this is the drawing chosen after (round4-single).
 */
export function ActLine({ act }: { act: AgentWork }) {
  // A TEAMMATE'S ACTION is theirs: their first name where "You" would be.
  const team = useContext(TeamContext);
  const who = team && act.by && act.by !== team.me ? team.byId.get(act.by) ?? { id: act.by, email: '', name: 'A teammate', avatarUrl: null } : null;
  const words = actWords(act, who ? firstName(who) : null);
  return (
    <div className={`act-line ${words.picked ? 'is-pick' : ''}`}>
      <span className="act-said">
        {words.lead}
        {words.choice && <span className="act-choice"> {words.choice}</span>}
      </span>
      <span className="act-when">{actWhen(act.at)}</span>
    </div>
  );
}

// A time she can place. Same rule the ledger follows: the day, then the clock,
// and never a bare weekday five days later.
function when(at: number) {
  if (!at) return '';
  return `${dayHeading(at)} ${clock(at)}`;
}
