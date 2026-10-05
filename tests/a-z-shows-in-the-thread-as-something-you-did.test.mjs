// A Z SHOWS IN THE THREAD AS SOMETHING YOU DID (w-c78d1e1607).
//
// What broke: the thread draws your own actions as a short timeline ("Picked
// <the option>", "Snoozed until tomorrow 9:00am"), but a Z left either nothing
// or noise there, so after picking an option and pressing Z there was no way
// to tell from the thread whether the pick had gone through or been taken back.
//
// Measured on 2026-10-04 on a real thread: a pick at 18:30:17 taken back by Z
// at 18:33:03. The Z wrote three ledger lines in the same millisecond (status
// blocked, answer "(withdrawn)", status open), and the thread drew them as
// "It stopped and asked you" (the agent's line, though she wrote it), then
// "Withdrew your reply" and "Sent it back". Nothing said Z, and nothing said
// which pick. A Z inside the three second grace window, which is most of them,
// writes nothing to the ledger at all, so the thread showed no pick and no undo.
//
// Now every Z on a task leaves one mark ("Undid picking <the option>", "Undid
// closing it"), kept on this Mac, and the thread draws it as one of your
// actions. The ledger lines the Z itself wrote, stamped between when the undo
// started and when it finished, are folded under that one mark.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { itemThread } from '../renderer/src/item-thread.ts';
import { actWords } from '../renderer/src/act-line.ts';
import { UNDO_MARKS_KEY, readUndoMarks, addUndoMark, marksFor, MAX_UNDO_MARKS } from '../renderer/src/undo-marks.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

const T = new Date(2026, 9, 4, 18, 29).getTime();
const s = 1000;
const OPTION = 'Raise the cap to $60 and re-roll those six shots';
const RESULT = `**Make several takes.**\n\n## Options\n1. ${OPTION} (recommended)\n2. Stop here`;

const asked = [
  { id: 'w-1', ts: T - 600 * s, source: 'founder', patch: { title: 'Speaking fix', status: 'open', body: 'Fix the speaking' } },
  { id: 'w-1', ts: T, source: 'agent', patch: { status: 'blocked', result: RESULT } },
];
const pick = { id: 'w-1', ts: T + 60 * s, source: 'founder', patch: { answer: `Option 1: ${OPTION} (recommended)` } };
// What the Z past the grace window wrote, all in one millisecond, exactly as on
// the real thread.
const Z = T + 200 * s;
const withdraw = [
  { id: 'w-1', ts: Z, source: 'founder', patch: { status: 'blocked' } },
  { id: 'w-1', ts: Z, source: 'founder', patch: { answer: '(withdrawn)' } },
  { id: 'w-1', ts: Z, source: 'founder', patch: { status: 'open' } },
];
const mark = { product: 'p', id: 'w-1', from: Z - 5, at: Z + 40, words: 'Undid picking', choice: OPTION };

const acts = (built) => [...built.events, ...(built.after ?? [])].filter((e) => e.kind === 'work' && e.yours);

describe('the marks a Z leaves, kept on this Mac', () => {
  it('keeps a mark and hands back only the ones for the task asked about', () => {
    const store = fakeStore();
    addUndoMark(mark, store);
    addUndoMark({ ...mark, id: 'w-2', at: Z + 90 }, store);
    addUndoMark({ ...mark, product: 'q', at: Z + 95 }, store);
    expect(readUndoMarks(store)).toHaveLength(3);
    expect(marksFor(readUndoMarks(store), 'p', 'w-1')).toEqual([mark]);
  });

  it('stores them under its own key', () => {
    const store = fakeStore();
    addUndoMark(mark, store);
    expect(JSON.parse(store.getItem(UNDO_MARKS_KEY))).toHaveLength(1);
  });

  it('keeps the newest when there are too many, and drops the oldest', () => {
    const store = fakeStore();
    for (let i = 0; i < MAX_UNDO_MARKS + 3; i += 1) addUndoMark({ ...mark, at: i, from: i }, store);
    const kept = readUndoMarks(store);
    expect(kept).toHaveLength(MAX_UNDO_MARKS);
    expect(kept[0].at).toBe(3);
    expect(kept[kept.length - 1].at).toBe(MAX_UNDO_MARKS + 2);
  });

  it('reads garbage as no marks rather than failing the thread', () => {
    expect(readUndoMarks(fakeStore({ [UNDO_MARKS_KEY]: '{not json' }))).toEqual([]);
    expect(readUndoMarks(fakeStore({ [UNDO_MARKS_KEY]: JSON.stringify([{ id: 'w-1' }, mark]) }))).toEqual([mark]);
    expect(readUndoMarks(fakeStore())).toEqual([]);
  });
});

describe('the thread, after a pick and a Z', () => {
  it('draws the pick and then one line saying it was undone, with the option', () => {
    const built = itemThread([...asked, pick, ...withdraw], [], null, { undone: [mark] });
    const lines = acts(built).map((e) => actWords(e));
    expect(lines).toEqual([
      { lead: 'Picked', choice: OPTION, picked: true },
      { lead: 'Undid picking', choice: OPTION, picked: false },
    ]);
  });

  it('folds the lines the Z itself wrote under that mark', () => {
    const built = itemThread([...asked, pick, ...withdraw], [], null, { undone: [mark] });
    const verbs = [...built.events, ...(built.after ?? [])].filter((e) => e.kind === 'work').map((e) => e.verb);
    expect(verbs).not.toContain('You withdrew your reply');
    expect(verbs).not.toContain('You sent it back');
    expect(verbs).not.toContain('It stopped and asked you');
  });

  it('keeps an action of yours made just before the undo started', () => {
    // The pick landed three seconds before the Z: a quick Z past the grace
    // window. It is the thing being undone and has to stay on the screen.
    const quick = { ...pick, ts: Z - 3 * s };
    const built = itemThread([...asked, quick, ...withdraw], [], null, { undone: [mark] });
    expect(acts(built).map((e) => e.verb)).toEqual(['You picked option 1', 'Undid picking']);
  });

  it('draws a Z made inside the grace window, which wrote nothing to the ledger', () => {
    const inGrace = { product: 'p', id: 'w-1', from: T + 62 * s, at: T + 62 * s, words: 'Undid picking', choice: OPTION };
    const built = itemThread(asked, [], null, { undone: [inGrace] });
    expect(acts(built).map((e) => actWords(e).lead)).toEqual(['Undid picking']);
  });

  it('draws nothing new without a mark, so an ordinary thread is unchanged', () => {
    const before = itemThread([...asked, pick], [], null, {});
    const withNone = itemThread([...asked, pick], [], null, { undone: [] });
    expect(withNone).toEqual(before);
  });

  it('says other undos in a few words too', () => {
    expect(actWords({ verb: 'Undid closing it', subject: '' })).toEqual({ lead: 'Undid closing it', choice: null, picked: false });
  });
});

describe('a status she wrote is never the agent stopping', () => {
  it('reads her own blocked line as bookkeeping, not "It stopped and asked you"', () => {
    const events = threadEvents([...asked, pick, ...withdraw]);
    expect(events.filter((e) => e.said === 'It stopped and asked you')).toHaveLength(0);
  });

  it('still says it when the agent is the one that stopped', () => {
    const events = threadEvents(asked);
    expect(events.map((e) => e.said)).toContain('It came back to you');
    const stopped = threadEvents([...asked, { id: 'w-1', ts: T + 5 * s, source: 'agent', patch: { status: 'blocked' } }]);
    expect(stopped.map((e) => e.said)).toContain('It stopped and asked you');
  });
});

describe('the wiring in App.tsx', () => {
  const app = read('renderer/src/App.tsx');
  const undo = app.slice(app.indexOf('const undo = useCallback('), app.indexOf('/* ------------------------------- keyboard'));

  it('leaves a mark for a Z inside the grace window', () => {
    const grace = undo.slice(0, undo.indexOf('PAST THE GRACE WINDOW'));
    expect(grace).toMatch(/leaveUndoMarks\(pending\.undid, now, now\)/);
  });

  it('leaves a mark past it, only once the undo has gone through, spanning its own writes', () => {
    const past = undo.slice(undo.indexOf('PAST THE GRACE WINDOW'));
    expect(past).toMatch(/const from = Date\.now\(\);\s*\n\s*try \{\s*\n\s*await last\.run\(\);/);
    expect(past.indexOf('leaveUndoMarks(last.undid, from, Date.now())')).toBeGreaterThan(past.indexOf('} catch (err) {'));
  });

  it('every undo on a task says what it undid', () => {
    for (const words of ['Undid closing it', 'Undid your approval', 'Undid your reply', 'Undid picking', 'Undid sending it', 'Undid the snooze']) {
      expect(app).toContain(`'${words}'`);
    }
  });

  it('the thread is handed the marks for its own task', () => {
    const pane = read('renderer/src/components/ItemThread.tsx');
    expect(pane).toMatch(/undone: marksFor\(/);
  });
});
