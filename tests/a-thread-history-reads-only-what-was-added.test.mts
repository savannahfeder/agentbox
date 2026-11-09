// A THREAD'S HISTORY READS ONLY WHAT WAS ADDED TO THE LEDGER.
//
// What broke: the kept history (`historiesOf`) was thrown away on any change to
// the ledger and rebuilt from its whole 8 MB window, every line parsed and
// frozen again. Every running agent's lease heartbeat is a line, 38% of the
// last 2 MB of the real agentbox-team ledger, so with agents running the next
// history read was nearly always a whole rebuild: 97 ms on a quiet Mac, and up
// to 1,423 ms in the freeze log (memory-log/freeze-2026-11-08.jsonl) once
// memory was tight. The thread fold beside it already read only the new bytes.
//
// Now a ledger that only grew is read from where the last read stopped. What
// that must not cost: a replaced or shrunk ledger is read again from the start,
// a half-written line waits until it is whole, and no line is counted twice.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import * as disk from '../main/store/work-items.mts';

let root, store, ids;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'history-grows-'));
  const dir = path.join(root, 'kestrel');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  ids = [];
  for (let i = 0; i < 200; i += 1) {
    const made = store.composeItem('kestrel', { title: `thread ${i} ${'x'.repeat(400)}` });
    store.answerItem('kestrel', made.id, { answer: `reply to ${i}` });
    ids.push(made.id);
  }
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

const ledger = () => disk._internals.ledgerPath(path.join(root, 'kestrel'));
const answers = (id) => store.readHistory('kestrel', id).map((l) => l.patch?.answer).filter(Boolean);
const line = (id, answer) => JSON.stringify({ id, ts: Date.now(), source: 'founder', patch: { answer } });

function bytesReadDuring(fn) {
  const file = ledger();
  const whole = vi.spyOn(fs, 'readFileSync');
  const piece = vi.spyOn(fs, 'readSync');
  fn();
  const wholeReads = whole.mock.calls.filter(([f]) => f === file).length;
  const bytes = piece.mock.calls.reduce((n, call) => n + (Number(call[3]) || 0), 0);
  whole.mockRestore();
  piece.mockRestore();
  return { wholeReads, bytes };
}

describe('a ledger that only grew', () => {
  it('is read from where the last read stopped, and the new line is seen', () => {
    answers(ids[0]);
    const before = fs.statSync(ledger()).size;
    store.answerItem('kestrel', ids[5], { answer: 'one more' });
    const added = fs.statSync(ledger()).size - before;
    let seen;
    const { wholeReads, bytes } = bytesReadDuring(() => { seen = answers(ids[5]); });
    expect(seen).toEqual(['reply to 5', 'one more']);
    expect(wholeReads).toBe(0);
    expect(bytes).toBeLessThanOrEqual(added);
    expect(before).toBeGreaterThan(50 * added);
  });

  it('a line from another process is seen too, and only on its own thread', () => {
    answers(ids[0]);
    fs.appendFileSync(ledger(), `${line(ids[7], 'from elsewhere')}\n`);
    expect(answers(ids[7])).toEqual(['reply to 7', 'from elsewhere']);
    expect(answers(ids[8])).toEqual(['reply to 8']);
  });

  it('a half-written line waits until it is whole, and is then counted once', () => {
    answers(ids[0]);
    const text = `${line(ids[9], 'arriving')}\n`;
    fs.appendFileSync(ledger(), text.slice(0, 20));
    expect(answers(ids[9])).toEqual(['reply to 9']);
    fs.appendFileSync(ledger(), text.slice(20));
    expect(answers(ids[9])).toEqual(['reply to 9', 'arriving']);
    expect(answers(ids[9])).toEqual(['reply to 9', 'arriving']);
  });
});

describe('a ledger that did not only grow', () => {
  it('replaced by a shorter one is read again from the start', () => {
    answers(ids[0]);
    const kept = fs.readFileSync(ledger(), 'utf8').split('\n').filter((l) => l && JSON.parse(l).id === ids[0]);
    fs.writeFileSync(`${ledger()}.new`, `${kept.join('\n')}\n`);
    fs.renameSync(`${ledger()}.new`, ledger());
    expect(answers(ids[1])).toEqual([]);
    expect(answers(ids[0])).toEqual(['reply to 0']);
  });

  it('rewritten in place at a new length is read again from the start', () => {
    answers(ids[0]);
    const lines = fs.readFileSync(ledger(), 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(ledger(), `${lines.slice(0, 4).join('\n')}\n${line(ids[0], 'rewritten')}\n`);
    expect(answers(ids[0])).toEqual(['reply to 0', 'rewritten']);
    expect(answers(ids[150])).toEqual([]);
  });
});
