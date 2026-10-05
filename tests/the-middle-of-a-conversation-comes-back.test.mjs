// THE MIDDLE OF A CONVERSATION IS REACHABLE.
//
// Two problems, both confirmed on a real store by rebuilding every row's
// thread exactly as the pane draws it:
//
// THE MIDDLE WAS GONE FOR GOOD. Many rows hid part of the conversation, often
// including messages the user wrote, behind a line reading "N messages in
// between, not shown", and that line was a plain div. There was nothing to
// press.
//
//   THE LINE WAS IN THE WRONG PLACE. `threadWindow` keeps the first three
//   BLOCKS. The renderer decided where to print the notice by counting MESSAGES
//   and skipping `same` continuations, so the moment a run's second sentence
//   landed in the opening the two disagreed. Nearly half of the cut rows
//   printed the notice away from the seam, the worst by 30 messages.
//
// So: the gap says what pressing it does, pressing it brings every message
// back, and where it stands is decided by the same function that made the gap.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRAIL_OPENING, TRAIL_TURNS, WORK_TOTAL,
  conversationGap, gapIndex, saidCount, threadWindow,
} from '../shared/agents.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const said = (at, who = 'it', over = {}) => ({ at, who, text: `message ${at}`, ...over });
const ran = (at) => ({ kind: 'work', at, verb: 'ran', subject: `cmd ${at}`, output: '', lines: 0, failed: false });

/* ----------------------------- the door itself ---------------------------- */
describe('the line where the middle is', () => {
  it('says what pressing it does, rather than that the middle is gone', () => {
    expect(conversationGap(13)).toBe('Show the 13 messages in between');
    expect(conversationGap(1)).toBe('Show the 1 message in between');
  });

  it('says nothing at all when nothing is missing', () => {
    expect(conversationGap(0)).toBe('');
  });

  // A window with no door is the whole of this row. Nothing may draw a thread
  // without saying where the gap line goes when it is pressed.
  it('is a button in the thread, and every thread has to answer it', () => {
    const thread = read('renderer/src/components/Thread.tsx');
    expect(thread).toMatch(/<button type="button" className="thread-gap" onClick=\{openGap\}>/);
    // Required, not optional: the type is what stops a doorless gap shipping.
    expect(thread).toMatch(/onWhole: \(\) => void;/);
    expect(read('renderer/src/components/ItemThread.tsx')).toMatch(/onWhole=\{\(\) => setWhole\(true\)\}/);
    expect(read('renderer/src/components/AgentThread.tsx')).toMatch(/onWhole=\{\(\) => setWhole\(true\)\}/);
  });

  // It reads as a seam in a conversation, not as a call to action.
  it('is styled as the quiet line it always was', () => {
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/\.thread-gap \{[^}]*color: var\(--text-faint\)/s);
    expect(css).toMatch(/\.thread-gap \{[^}]*cursor: pointer/s);
  });
});

/* --------------------------- pressing it works ---------------------------- */
describe('asking for the middle back', () => {
  it('brings every message onto the screen, and takes the gap away', () => {
    const events = Array.from({ length: 400 }, (_, i) => said(i));
    const shut = threadWindow(events);
    expect(shut.events.filter((e) => e.kind !== 'work')).toHaveLength(TRAIL_TURNS);
    expect(shut.omitted).toBe(360);

    const open = threadWindow(events, { whole: true });
    expect(open.events.filter((e) => e.kind !== 'work')).toHaveLength(400);
    expect(open.omitted).toBe(0);
    expect(conversationGap(open.omitted)).toBe('');
  });

  // The point is the user's follow-ups, not the output under them. 6,070 tool
  // calls in one session is the number this cap was measured against, and
  // opening the conversation is not a reason to put them all on a page.
  it('leaves the work capped, so opening it is a conversation and not a log', () => {
    const events = [];
    for (let m = 0; m < 60; m += 1) {
      events.push(said(m * 1000));
      for (let w = 0; w < 30; w += 1) events.push(ran(m * 1000 + w + 1));
    }
    const open = threadWindow(events, { whole: true });
    expect(open.events.filter((e) => e.kind !== 'work')).toHaveLength(60);
    expect(open.events.filter((e) => e.kind === 'work').length).toBeLessThanOrEqual(WORK_TOTAL);
  });

  // The renderer's own builder, end to end: the count in the header and the
  // number on screen are the same number once she has pressed it.
  it('reaches the task thread, so a row shows all of itself when asked', () => {
    const lines = [];
    for (let i = 0; i < 90; i += 1) {
      lines.push({
        id: 'w-abc123', ts: 1_787_000_000_000 + i * 1000, source: i % 3 === 0 ? 'founder' : 'agent',
        patch: i % 3 === 0 ? { answer: `her message ${i}` } : { note: `its message ${i}` },
      });
    }
    const shut = itemThread(lines, []);
    expect(shut.omitted).toBeGreaterThan(0);

    const open = itemThread(lines, [], null, { whole: true });
    expect(open.omitted).toBe(0);
    expect(open.total).toBe(shut.total);
    // Nothing invented and nothing lost: what is on the screen is the whole row.
    expect(saidCount(open.events) + (open.outcome ? 1 : 0)).toBe(open.total);
  });

  // A thread never OPENS at full length. The window is still what a long row is
  // born with; this is only ever her decision, and it dies with the row.
  it('is her decision and it is dropped when she leaves the row', () => {
    const item = read('renderer/src/components/ItemThread.tsx');
    expect(item).toMatch(/const \[whole, setWhole\] = useState\(false\);/);
    expect(item).toMatch(/useEffect\(\(\) => \{ setWhole\(false\); \}, \[item\.product, item\.id\]\);/);
    const agent = read('renderer/src/components/AgentThread.tsx');
    expect(agent).toMatch(/const \[whole, setWhole\] = useState\(false\);/);
    expect(agent).toMatch(/useEffect\(\(\) => \{ setWhole\(false\); \}, \[pid, sessionId, cwd\]\);/);
  });

  // Opening it inserts messages ABOVE her, so her place is held against the
  // bottom of the box rather than the top of the page.
  it('does not move the lines she was reading', () => {
    const thread = read('renderer/src/components/Thread.tsx');
    expect(thread).toMatch(/anchor\.current = box \? box\.scrollHeight - box\.scrollTop : null;/);
    expect(thread).toMatch(/box\.scrollTop = Math\.max\(0, box\.scrollHeight - from\);/);
  });

  // The Claude Code side reads a transcript on disk, so the middle has to be
  // fetched rather than unhidden, and it must not blank the thread doing it.
  it('re-reads the agent transcript without throwing her back to the bottom', () => {
    const agent = read('renderer/src/components/AgentThread.tsx');
    expect(agent).toMatch(/api\.agentConversation\(\{ pid, sessionId, cwd, whole \}\)/);
    expect(agent).toMatch(/if \(shown\.current !== which\) \{ setState\(null\); shown\.current = which; \}/);
    expect(read('main/agents.mjs')).toMatch(/threadWindow\(turns, \{ whole: !!whole \}\)/);
  });
});

/* ------------------- the conversation resumes with a name ----------------- */
// A `same` block wears no name and no time, because the message above it is its
// own first half. On the far side of the cut that first half is in the missing
// middle, so the block hangs off whichever message the opening ended on: a
// different run, from a different hour, with no line between them. Most cut
// conversations on a real store resumed that way.
describe('the far side of the gap', () => {
  const spanning = () => {
    const events = [said(0, 'you'), said(1), said(2, 'it', { same: true })];
    for (let i = 3; i < 200; i += 1) {
      events.push(said(i, 'it', i % 4 === 0 ? {} : { same: true }));
    }
    return events;
  };

  it('marks the first block after the cut so it can carry a name', () => {
    const out = threadWindow(spanning());
    const at = gapIndex(out.events, out.omitted);
    const first = out.events[at + 1];
    expect(first.same).toBe(true);
    expect(first.resumed).toBe(true);
  });

  it('leaves the count alone, so the gap never quotes an impossible number', () => {
    // Clearing `same` instead of adding `resumed` put `omitted` at -1 on real
    // rows, because `saidCount` folds on `same` and the run would have been
    // counted twice. The fold has to see exactly what it saw before.
    const events = spanning();
    const out = threadWindow(events);
    expect(out.omitted).toBeGreaterThan(0);
    expect(saidCount(out.events)).toBeLessThanOrEqual(saidCount(events));
  });

  it('does not mark anything when nothing was cut', () => {
    const short = [said(0), said(1, 'it', { same: true }), said(2)];
    const out = threadWindow(short);
    expect(out.omitted).toBe(0);
    expect(out.events.some((e) => e.resumed)).toBe(false);
  });

  it('gives that block its name and its time back on the screen', () => {
    const thread = read('renderer/src/components/Thread.tsx');
    expect(thread).toMatch(/\$\{e\.same && !e\.resumed \? 'same' : ''\}/);
    expect(thread).toMatch(/\{\(!e\.same \|\| e\.resumed\) && \(/);
  });

  // Nothing may be mutated on the way through: the caller's array is read by
  // other things, and a window that edits its input is a window that changes
  // what the header counted.
  it('does not touch the events it was given', () => {
    const events = spanning();
    const copy = JSON.parse(JSON.stringify(events));
    threadWindow(events);
    expect(events).toEqual(copy);
  });
});

/* -------------------------- where the line stands ------------------------- */
describe('where the gap line is drawn', () => {
  it('says nothing when nothing was cut', () => {
    expect(gapIndex([said(1), said(2)], 0)).toBe(-1);
  });

  // THE REGRESSION THAT WAS ON SCREEN. The opening of a real thread is
  // routinely the ask, a run's first sentence and that run's SECOND sentence,
  // and the second one is a `same` continuation. Counting messages while
  // skipping continuations walks straight past the seam and into the tail.
  it('lands on the seam even when the opening ends in a continuation', () => {
    const events = [];
    events.push(said(0, 'you'));              // her ask
    events.push(said(1));                     // a run's first sentence
    events.push(said(2, 'it', { same: true })); // the same run, still talking
    for (let i = 3; i < 120; i += 1) events.push(said(i));

    const out = threadWindow(events);
    expect(out.omitted).toBeGreaterThan(0);
    const at = gapIndex(out.events, out.omitted);
    // The opening is three BLOCKS, so the seam is after the third one.
    expect(at).toBe(TRAIL_OPENING - 1);
    expect(out.events[at].at).toBe(2);
    // And the message after the line is the first one the window brought back,
    // never one that was already above it.
    expect(out.events[at + 1].at).toBeGreaterThan(2);
  });

  // Work that belongs to the opening stays ABOVE the line. Output standing
  // under a gap reads as output from the part she cannot see.
  it('keeps the opening whole, work and all, above the line', () => {
    const events = [said(0), said(1), said(2), ran(3), ran(4)];
    for (let i = 5; i < 200; i += 1) events.push(said(i));
    const out = threadWindow(events);
    const at = gapIndex(out.events, out.omitted);
    expect(out.events[at].kind).toBe('work');
    expect(out.events[at].at).toBe(4);
    expect(out.events[at + 1].kind).not.toBe('work');
  });

  // THE TWO RULES AGREE, ON EVERY SHAPE. This is the property that broke: the
  // number of events the window kept from the head, and the index the notice is
  // drawn at, are the same fact and must be computed from the same count.
  it('always points at the last event the window kept from the opening', () => {
    for (let shape = 0; shape < 40; shape += 1) {
      const events = [];
      let at = 0;
      for (let m = 0; m < 120; m += 1) {
        // A different mix of continuations and work per shape, so the opening
        // ends on a message, on a continuation and on work across the run.
        events.push(said(at += 1, 'it', m > 0 && (m + shape) % 3 === 0 ? { same: true } : {}));
        for (let w = 0; w < (m + shape) % 4; w += 1) events.push(ran(at += 1));
      }
      const out = threadWindow(events);
      expect(out.omitted).toBeGreaterThan(0);
      const drawn = gapIndex(out.events, out.omitted);

      // The head the window kept, computed straight off the rule in threadWindow.
      const all = events;
      const saidAt = [];
      all.forEach((e, i) => { if (e.kind !== 'work') saidAt.push(i); });
      const head = all.slice(0, saidAt[TRAIL_OPENING]);
      expect(drawn).toBe(head.length - 1);
      expect(out.events[drawn].at).toBe(head[head.length - 1].at);
    }
  });
});

/* ------------------- her ask is the first message, whole ------------------ */
// The box quoted the PARENT row's words, clipped, above a conversation that
// then began with the agent answering something the reader could not fully see.
// It is a message now: first in the thread, her name and her time on it, whole.
describe('the ask she typed opens the conversation', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const item = read('renderer/src/components/ItemThread.tsx');
  const thread = read('renderer/src/components/Thread.tsx');

  it('hands her words to the thread instead of drawing a box over it', () => {
    // The words go one way only: into the thread, as the opening message.
    expect(focus).toMatch(/const openingSaid = !agent && said\?\.kind === 'said'/);
    expect(focus).toMatch(/opening=\{openingSaid\}/);
    // And the box is not drawn when they did.
    expect(focus).toMatch(/recap=\{openingSaid \? null : recapFor\(item, parent\)\}/);
  });

  it('draws it as a message, not as a heading over the conversation', () => {
    expect(item).toMatch(/opening\?: \{ text: string; at: number; on: string \} \| null;/);
    // In front of everything, wearing the user's name, at the time it was sent.
    // `shown` rather than `said` since 2026-09-18: while an agent is working,
    // the run of commands at the very bottom belongs to the thinking mark and
    // is not drawn twice. Her ask goes in front of whichever list is being
    // drawn, which is the part this line is pinning.
    expect(item).toMatch(/\[\{ at: opening\.at, who: 'you' as const, text: opening\.text, on: opening\.on \}, \.\.\.shown\]/);
  });

  // NOTHING COUNTS THE CONVERSATION OVER THE TOP OF IT ANY MORE.
  //
  // It was a plain div that read as a door, sitting a few pixels above the one
  // line in this file that IS a door and says so: "Show the 63 messages in
  // between". Two doors, one of them false, on a screen whose whole problem
  // was that the way in could not be found.
  it('draws no count over the conversation, on a task or on a session', () => {
    // No head goes into the thread, from either of the two things that draw one.
    // (`<ThreadWaiting head=` is the loading sentence and is not one of them.)
    expect(item).not.toMatch(/<Thread\n[\s\S]{0,400}head=/);
    expect(read('renderer/src/components/AgentThread.tsx')).not.toMatch(/<Thread\n[\s\S]{0,400}head=/);
    // And the thread has nowhere to put one. Everything above ThreadWaiting is
    // the real conversation, and the only .thread-head left is below that line.
    const drawn = thread.slice(0, thread.indexOf('export function ThreadWaiting'));
    expect(drawn).not.toContain('thread-head');
    // The words themselves are gone from everything that renders. They survive
    // in this file only inside the comment saying why they went.
    expect(item).not.toMatch(/oldest first/);
    expect(read('renderer/src/components/AgentThread.tsx')).not.toMatch(/oldest first/);
  });

  it('still says the page is loading, which is the one head left', () => {
    // ThreadWaiting is a sentence about a page that is not drawn yet, not a
    // tally of one that is. It keeps its head and keeps the rule under it.
    expect(thread).toMatch(/export function ThreadWaiting\(\{ head \}/);
    expect(item).toMatch(/<ThreadWaiting head="Reading this conversation…" \/>/);
    expect(read('renderer/src/styles.css')).toMatch(/\.thread-waiting \.thread-head \{/);
  });

  it('keeps the way back to the row she said it on', () => {
    expect(thread).toMatch(/className="msg-on" onClick=\{onOpenOrigin\}/);
    expect(focus).toMatch(/onOpenOrigin=\{\(\) => parent && onOpenItem\(parent\)\}/);
    // It rides the message's head. Nothing above the conversation draws it.
    // The span stands for "inside the head" and is not a budget worth
    // defending: it grew when the head gained the second sending state, which
    // is the three seconds in which Z still takes a message back
    // (w-5281ef1221), and again when it gained Send now (w-f37a34def6). What
    // this is guarding is the line above it.
    // Since w-2e8aa16f0f both heads (the agent thread's and a chat's) say it
    // through one helper, `headFacts`, so the head calls it and it holds the line.
    expect(thread).toMatch(/const headFacts = [\s\S]{0,2600}className="msg-on"/);
    expect(thread.match(/<div className="msg-head">[\s\S]{0,400}\{headFacts\(e, /g)).toHaveLength(2);
  });

  it('is never clipped, because nothing clips a message', () => {
    // The box had a fixed height and an ellipsis; a message body has neither.
    const css = read('renderer/src/styles.css');
    const rule = css.slice(css.indexOf('.msg-body {'), css.indexOf('.msg-body {') + 200);
    expect(rule).not.toMatch(/text-overflow|-webkit-line-clamp|max-height/);
  });
});
