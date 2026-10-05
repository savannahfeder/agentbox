// A ROW CLOSED AT 1:18PM CAME BACK AT 1:21PM AS THE USER'S OWN WRITE.
//
// w-da37b95d1a. A task marked done stayed in the inbox and showed as last moved
// a minute ago.
//
// The ledger for w-86dd93ab0d carries the whole of it:
//
//   13:18:32  founder  {"status":"done"}
//   13:21:24  founder  {"status":"open"}
//
// Nothing between them. One path in the app writes that second line: the undo
// entry `markDone` pushes, popped by a Z 171 seconds later. The stack never aged
// and Z acted on it silently, while the toast that advertised it was gone after
// two and a half seconds.
//
// THE FIRST FIX WAS A DEADLINE AND IT LASTED A DAY. A minute, then thirty
// seconds, and thirty seconds turned out too short in real use. So the deadline
// is gone and what is tested below is two tiers: Z acts at once inside thirty
// seconds, and after that it names what it would undo and waits for a second Z.
// A stray letter now costs a toast rather than a decision, and a row closed this
// morning is still undoable this afternoon.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nextUndo, askStillStands, undoAsk,
  UNDO_STRAIGHT_AWAY_MS, UNDO_ASK_STANDS_MS, HOLDS_A_KEY, NOTHING_TO_UNDO,
} from '../renderer/src/undo-window.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const close = { label: 'Reopened: the reply box row', at: 0 };

describe('the press she makes in the moment', () => {
  it('undoes the close she just made, without asking', () => {
    const r = nextUndo([close], 2_000);
    expect(r.take).toBe(close);
    expect(r.instant).toBe(true);
    expect(r.rest).toEqual([]);
  });

  it('still goes straight through at twenty seconds, after the toast has gone', () => {
    expect(nextUndo([close], 20_000).instant).toBe(true);
  });

  it('is thirty seconds, which is the number she picked', () => {
    expect(UNDO_STRAIGHT_AWAY_MS).toBe(30_000);
    expect(nextUndo([close], UNDO_STRAIGHT_AWAY_MS).instant).toBe(true);
    expect(nextUndo([close], UNDO_STRAIGHT_AWAY_MS + 1).instant).toBe(false);
  });
});

describe('the press she makes minutes later', () => {
  // The case she reported, to the second.
  it('does not act on a 171 second old close, but still offers it', () => {
    const r = nextUndo([close], 171_600);
    expect(r.take).toBe(close);
    expect(r.instant).toBe(false);
  });

  // ONE SENTENCE, ONE VERB, NO COLONS, and it took three goes. The second was
  // hard to understand: several sentences and colons nested inside colons. It
  // read "Press Z again and this happens: Reopened: The reply box says which
  // mode it is in. That was 41s ago.", which is what you get when a question is
  // built out of the line that is said after the undo has already happened.
  it('asks in one sentence, with no colon in it', () => {
    const said = undoAsk('reopen “The reply box says which mode it is in”');
    expect(said).toBe('Press Z again to reopen “The reply box says which mode it is in”.');
    expect(said).not.toContain(':');
    expect(said.split('.').filter((s) => s.trim()).length).toBe(1);
  });

  it('asks with the entry own words, never with the label', () => {
    expect(undoAsk('take back that approval and stop the agent'))
      .toBe('Press Z again to take back that approval and stop the agent.');
  });

  it('holds the question long enough to read it and answer it', () => {
    expect(askStillStands(0, UNDO_ASK_STANDS_MS)).toBe(true);
    expect(askStillStands(0, UNDO_ASK_STANDS_MS + 1)).toBe(false);
  });

  it('never runs out, because a confirmed undo cannot happen by accident', () => {
    const r = nextUndo([close], 5 * 60 * 60 * 1000);
    expect(r.take).toBe(close);
    expect(r.instant).toBe(false);
  });

  it('says so rather than going quiet when the pile is empty', () => {
    const r = nextUndo([], 200_000);
    expect(r.take).toBe(null);
    expect(NOTHING_TO_UNDO).toMatch(/undo/i);
  });

  it('does not treat a held modifier as an answer', () => {
    for (const k of ['Shift', 'Meta', 'Control', 'Alt']) expect(HOLDS_A_KEY.has(k)).toBe(true);
    expect(HOLDS_A_KEY.has('e')).toBe(false);
  });
});

describe('the app asks that rule rather than keeping its own copy', () => {
  it('requires the plain phrase on every entry, so none can be made without one', () => {
    expect(app).toContain('undoes: string;');
  });

  it('reads the tiers before it pops anything', () => {
    expect(app).toContain("from './undo-window'");
    expect(app).toContain('nextUndo(undoStack, now)');
    expect(app).toContain('undoAsk(last.undoes)');
  });

  // The safeguard is the second press, so every other key has to be a no, and
  // the line that does it sits above every screen guard: the answer is no
  // wherever she is typing when she gives it.
  it('lets the next key answer no, from anywhere in the app', () => {
    expect(app).toContain("if (!HOLDS_A_KEY.has(e.key) && e.key !== 'z' && e.key !== 'Z') undoAskRef.current = null;");
    const clear = app.indexOf("if (!HOLDS_A_KEY.has(e.key)");
    const settings = app.indexOf('if (settingsOpen) return;');
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(settings);
  });

  it('only goes through when the second Z is about the same thing', () => {
    expect(app).toContain('asked?.entry === last && askStillStands(asked.at, now)');
  });

  // THE PART THAT KEEPS THIS FIXED. An entry with no `at` is instant for ever
  // again, so nothing may push one by hand: every site goes through `pushUndo`,
  // which is the only place the stamp is applied.
  it('stamps every entry in one place, so a later push cannot forget the age', () => {
    expect(app).toContain('const pushUndo = useCallback(');
    expect(app).toMatch(/pushUndo[\s\S]{0,400}at: Date\.now\(\)/);
    const grows = app.split('\n').filter((l) => l.includes('setUndoStack(') && l.includes('[...u,'));
    // The one other line is a Z that failed putting its own entry back
    // (w-c78d1e1607). That entry came off this pile already stamped and keeps
    // its first `at`, so it is no fresher for having been put back.
    expect(grows).toEqual([
      '    setUndoStack((u) => [...u, stamped]);',
      '      setUndoStack((u) => [...u, last]);',
    ]);
  });
});
