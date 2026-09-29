// THE WORK LINES, AND THE CAPS THAT KEEP THEM A THREAD RATHER THAN A DUMP.
//
// WHAT CAN SILENTLY BREAK HERE, which is what this file is for:
//
//   1. A RUN OF TOOL CALLS PUSHING THE USER'S MESSAGES OUT OF THE WINDOW.
//      Measured on real sessions: the longest unbroken run of tool calls
//      between two messages was 111, and one session held 6,070 of them. A
//      window that counted events rather than messages would show forty
//      commands and none of the conversation they belong to, which is the
//      original problem wearing a different hat.
//   2. A CAP THAT DOES NOT SAY IT IS A CAP. Every bound here says its own
//      number where it bites. "Some output" is the sentence that makes a
//      reader wonder what else the app is rounding off.
//   3. OUR VOCABULARY LEAKING ONTO THE SCREEN. The design law forbids jargon in
//      UI copy, and "Bash" and "Glob" are our words, not the user's.

import { describe, it, expect } from 'vitest';
import {
  TRAIL_OPENING, TRAIL_TURNS, WORK_RUN, WORK_TOTAL,
  capRuns, outputCut, runOverflow, saidCount, threadWindow, workSubject, workVerb,
} from '../shared/agents.mjs';

const said = (i, who = i % 2 ? 'it' : 'you') => ({ at: i, who, text: `message ${i}` });
const ran = (i, over = {}) => ({
  kind: 'work', at: i, verb: 'ran', subject: `cmd ${i}`, output: 'ok', lines: 1, failed: false, ...over,
});

/* --------------------------- what it did, in plain words ------------------ */
describe('what the work line says it did', () => {
  it('uses her word for the ordinary tools, never ours', () => {
    expect(workVerb('Bash')).toBe('ran');
    expect(workVerb('Read')).toBe('read');
    expect(workVerb('Write')).toBe('wrote');
    expect(workVerb('Edit')).toBe('edited');
    expect(workVerb('Grep')).toBe('searched for');
    expect(workVerb('WebFetch')).toBe('fetched');
  });

  // A TOOL WE HAVE NO WORD FOR STILL HAS TO READ AS SOMETHING. It falls back to
  // its own name lowercased, which reads as a name rather than as a sentence
  // and is honest about being one. The mcp__server__ prefix comes off, because
  // that is plumbing the user has never seen.
  //
  // THE UNDERSCORES CAME OUT ON 2026-08-20. Underscores are how a machine
  // spells a space, and this line is read by a person: `list work items` is
  // the name, `list_work_items` is the jargon the design law forbids. The
  // prefix strip was also broken and is fixed in the same place; both live in
  // shared/work-lines.mjs now, with the count of how often it showed.
  it('falls back to the tool name, without the plumbing on the front', () => {
    expect(workVerb('mcp__agentbox__list_work_items')).toBe('list work items');
    expect(workVerb('SomethingNew')).toBe('somethingnew');
    expect(workVerb('')).toBe('did something');
    expect(workVerb(null)).toBe('did something');
  });

  // WHICH ONE IT WAS is the command, the path, the pattern, or whoever it
  // messaged. Flattened, because a heredoc is forty lines of shell standing in
  // the middle of her conversation.
  //
  // FLATTENING WAS NOT ENOUGH, and 2026-08-20 is when that showed: a flattened
  // heredoc is still forty lines of shell, just on one line, and the ellipsis
  // then ate the command in front of it. It is cut at its marker now. The rest
  // of these are unchanged, and the whole set of cases is in
  // tests/the-work-lines-are-clean.test.mjs.
  it('names which one it was, on one line', () => {
    expect(workSubject({ command: 'ls -la' })).toBe('ls -la');
    expect(workSubject({ file_path: '/x/store.mjs' })).toBe('/x/store.mjs');
    expect(workSubject({ to: 'agentbox-a1' })).toBe('agentbox-a1');
    expect(workSubject({ command: "cat <<'EOF'\n  a\n  b\nEOF" })).toBe('cat … a');
    expect(workSubject({})).toBe('');
    expect(workSubject(null)).toBe('');
  });
});

/* ------------------------------- the caps --------------------------------- */
describe('the caps, and each one saying its own number', () => {
  it('cuts a run and says how many it is not showing', () => {
    const events = [said(0), ...Array.from({ length: 50 }, (_, i) => ran(i + 1)), said(60)];
    const out = capRuns(events);
    const work = out.filter((e) => e.kind === 'work');
    expect(work).toHaveLength(WORK_RUN);
    expect(work[work.length - 1].more).toBe(50 - WORK_RUN);
    expect(runOverflow(work[work.length - 1].more)).toBe('and 30 more things it ran, not shown');
  });

  it('says one thing in the singular, and says nothing when none were cut', () => {
    expect(runOverflow(1)).toBe('and 1 more thing it ran, not shown');
    expect(runOverflow(0)).toBe('');
  });

  // TWO RUNS ARE TWO RUNS. A message between them starts the count again, so a
  // conversation of twenty short exchanges is not squeezed by one long one.
  it('counts each run separately', () => {
    const run = (n, from) => Array.from({ length: n }, (_, i) => ran(from + i));
    const out = capRuns([said(0), ...run(30, 1), said(40), ...run(5, 41), said(50)]);
    expect(out.filter((e) => e.kind === 'work')).toHaveLength(WORK_RUN + 5);
    expect(out.filter((e) => e.more)).toHaveLength(1);
  });

  // THE WHOLE THREAD IS BOUNDED TOO, and what goes is the oldest work, never a
  // message: one real session holds 6,070 tool calls.
  it('bounds the whole thread by dropping the oldest work, never a message', () => {
    const events = [];
    for (let m = 0; m < 30; m += 1) {
      events.push(said(m * 100));
      for (let w = 0; w < 15; w += 1) events.push(ran(m * 100 + w + 1));
    }
    const out = capRuns(events);
    expect(out.filter((e) => e.kind === 'work').length).toBeLessThanOrEqual(WORK_TOTAL);
    // Every one of her messages is still there.
    expect(out.filter((e) => e.kind !== 'work')).toHaveLength(30);
    // And what survived is the NEWEST work, because that is what she came for.
    const kept = out.filter((e) => e.kind === 'work');
    expect(kept[kept.length - 1].at).toBe(29 * 100 + 15);
  });

  it('says how much of an output it is not keeping', () => {
    expect(outputCut(6, 240)).toBe('234 more lines came back, not kept');
    expect(outputCut(6, 7)).toBe('1 more line came back, not kept');
    expect(outputCut(6, 6)).toBe('');
    expect(outputCut(6, 0)).toBe('');
  });
});

/* ------------------------------ the window -------------------------------- */
describe('the window keeps the conversation, not the commands', () => {
  // THIS IS THE ONE THAT MATTERS. 111 tool calls stood between two messages in
  // a real session. If the window counted events, those 111 would BE the
  // window and the row would open onto a wall of commands with the user's own
  // question nowhere on it.
  it('a long run of work does not push her messages out of the window', () => {
    const events = [];
    for (let m = 0; m < 10; m += 1) {
      events.push(said(m * 1000));
      for (let w = 0; w < 111; w += 1) events.push(ran(m * 1000 + w + 1));
    }
    const out = threadWindow(events);
    expect(out.omitted).toBe(0);
    expect(out.events.filter((e) => e.kind !== 'work')).toHaveLength(10);
  });

  it('still keeps the opening and the end when there are too many messages', () => {
    const events = Array.from({ length: 400 }, (_, i) => said(i));
    const out = threadWindow(events);
    const kept = out.events.filter((e) => e.kind !== 'work');
    expect(kept).toHaveLength(TRAIL_TURNS);
    expect(kept.slice(0, TRAIL_OPENING).map((e) => e.text)).toEqual(['message 0', 'message 1', 'message 2']);
    expect(kept[kept.length - 1].text).toBe('message 399');
    expect(out.omitted).toBe(360);
  });

  // WORK BELONGING TO A MESSAGE THAT IS NOT ON SCREEN MUST GO WITH IT. Output
  // standing under a message she cannot see is output from nowhere.
  it('drops the work that belonged to the messages it dropped', () => {
    const events = [];
    for (let m = 0; m < 100; m += 1) {
      events.push(said(m * 10));
      events.push(ran(m * 10 + 1));
    }
    const out = threadWindow(events);
    const times = out.events.map((e) => e.at);
    // Nothing survives from the middle, work or message alike.
    const middle = times.filter((t) => t >= 30 && t < (100 - (TRAIL_TURNS - TRAIL_OPENING)) * 10);
    expect(middle).toHaveLength(0);
  });
});

/* -------------------------------- the count ------------------------------- */
describe('how many messages that is', () => {
  // A reply that stopped twice for a tool is three blocks on the screen and one
  // message in the header. Getting this wrong puts "128 messages" over a
  // conversation she remembers having six times.
  it('counts a reply broken by work as one message', () => {
    expect(saidCount([
      { who: 'you', at: 1, text: 'do the thing' },
      { who: 'it', at: 2, text: 'looking' },
      ran(3),
      { who: 'it', at: 4, text: 'found it', same: true },
    ])).toBe(2);
  });

  it('counts two answers with something arriving in between as two', () => {
    expect(saidCount([
      { who: 'it', at: 1, text: 'sending it now' },
      { who: 'it', at: 2, text: 'expired undelivered' },
    ])).toBe(2);
  });

  it('never counts a work line as a message', () => {
    expect(saidCount([ran(1), ran(2), ran(3)])).toBe(0);
  });
});
