// A BUSY LEDGER IS FOLDED FROM WHAT WAS ADDED, NOT FROM THE START.
//
// What broke (2026-10-19): with cloud runs on, every key she pressed and every
// action had a small delay. The app's minute log showed the window's state
// request holding the main process for 150 to 300 ms, 21 to 56 times a minute,
// against almost never over 100 ms with the cloud off. A CPU profile of the
// running app put most of it in reading every project's ledger off disk and
// folding it again: the fold was kept, but thrown away whenever the file
// changed, and every running agent's store server writes a heartbeat to keep
// its claim (213 of her ledger's last 450 lines). More agents running, which
// is what the cloud is for, meant the 8 MB were read and folded again for
// nearly every request.
//
// Now a ledger that has only grown is folded on from where it was, reading
// just the bytes added. Checked here against a fold from scratch after every
// kind of write, and timed on a ledger of her size.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setAppHome, clearAppHome } from './app-home.mjs';
import * as wi from '../main/store/work-items.mjs';

let home; let dir;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'busy-ledger-'));
  setAppHome(path.join(home, 'app'));
  dir = path.join(home, 'proj');
  fs.mkdirSync(dir, { recursive: true });
  wi._internals.forgetFolds();
});
afterEach(() => { clearAppHome(); wi._internals.forgetFolds(); fs.rmSync(home, { recursive: true, force: true }); });

const NOW = Date.parse('2026-10-19T12:00:00Z');
const file = () => wi._internals.ledgerPath(dir);
const append = (line) => fs.appendFileSync(file(), JSON.stringify(line) + '\n');
// What a fold from scratch says, with nothing kept.
function fresh() {
  wi._internals.forgetFolds();
  return wi.readWorkItems(dir, NOW);
}
const sorted = (items) => [...items].sort((a, b) => a.id.localeCompare(b.id));

describe('folding on from where it was', () => {
  it('agrees with a fold from scratch after every kind of line', () => {
    const a = wi.createWorkItem(dir, { title: 'First', body: 'b' }, { source: 'founder', now: NOW - 9000 });
    const b = wi.createWorkItem(dir, { title: 'Second' }, { source: 'founder', now: NOW - 8000 });
    const steps = [
      () => append({ id: a.id, ts: NOW - 7000, source: 'agent', epoch: 1, claim: { holder: 'mcp-1', leaseUntil: NOW + 60_000 }, patch: { status: 'claimed' } }),
      () => append({ id: a.id, ts: NOW - 6000, source: 'agent', epoch: 1, heartbeat: true, claim: { holder: 'mcp-1', leaseUntil: NOW + 120_000 }, patch: {} }),
      () => wi.updateWorkItem(dir, a.id, { result: 'Half done', note: 'n' }, { epoch: 1, now: NOW - 5000 }),
      () => wi.updateWorkItem(dir, b.id, { answer: 'go on', priority: 7 }, { source: 'founder', now: NOW - 4000 }),
      // A line from a superseded epoch is fenced off, folded on or from scratch.
      () => append({ id: a.id, ts: NOW - 3500, source: 'agent', epoch: 0, patch: { result: 'stale' } }),
      () => wi.updateWorkItem(dir, a.id, { labels: ['founder', 'ship'] }, { epoch: 1, now: NOW - 3000 }),
      () => append({ id: a.id, ts: NOW - 2000, source: 'agent', epoch: 1, release: true }),
      () => wi.updateWorkItem(dir, a.id, { status: 'done' }, { now: NOW - 1000 }),
      () => wi.createWorkItem(dir, { title: 'Third' }, { source: 'founder', now: NOW - 500 }),
    ];
    wi.readWorkItems(dir, NOW);
    for (const step of steps) {
      step();
      const on = sorted(wi.readWorkItems(dir, NOW));
      expect(on, String(step)).toEqual(sorted(fresh()));
    }
  });

  it('a line cut through a character as it is written is folded whole, once', () => {
    const a = wi.createWorkItem(dir, { title: 'One' }, { source: 'founder', now: NOW - 9000 });
    wi.readWorkItems(dir, NOW);
    const bytes = Buffer.from(JSON.stringify({ id: a.id, ts: NOW - 100, source: 'agent', patch: { result: 'café ☕ done' } }) + '\n');
    const cut = bytes.indexOf(Buffer.from('☕')) + 1;
    fs.appendFileSync(file(), bytes.subarray(0, cut));
    wi.readWorkItems(dir, NOW);
    fs.appendFileSync(file(), bytes.subarray(cut));
    expect(wi.readWorkItem(dir, a.id, NOW).result).toBe('café ☕ done');
  });

  it('a line written in two pieces is folded once it is whole', () => {
    const a = wi.createWorkItem(dir, { title: 'One' }, { source: 'founder', now: NOW - 9000 });
    wi.readWorkItems(dir, NOW);
    const line = JSON.stringify({ id: a.id, ts: NOW - 100, source: 'agent', patch: { result: 'whole now' } }) + '\n';
    fs.appendFileSync(file(), line.slice(0, 20));
    expect(wi.readWorkItem(dir, a.id, NOW).result).toBeUndefined();
    fs.appendFileSync(file(), line.slice(20));
    expect(wi.readWorkItem(dir, a.id, NOW).result).toBe('whole now');
    expect(sorted(wi.readWorkItems(dir, NOW))).toEqual(sorted(fresh()));
  });

  it('a ledger replaced or cut short is read again from the start', () => {
    wi.createWorkItem(dir, { title: 'One' }, { source: 'founder', now: NOW - 9000 });
    wi.readWorkItems(dir, NOW);
    const text = fs.readFileSync(file(), 'utf8');
    fs.rmSync(file());
    fs.writeFileSync(file(), text.replace('One', 'Uno'));
    expect(wi.readWorkItems(dir, NOW)[0].title).toBe('Uno');
    fs.writeFileSync(file(), '');
    expect(wi.readWorkItems(dir, NOW)).toEqual([]);
  });

  // How the fold went stale on GitHub's Linux runner and not on a Mac: the
  // replacement took the deleted file's inode number, and both writes got one
  // mtime off a coarse clock, so stat said nothing had changed. Setting the
  // mtime back makes that happen on any filesystem.
  it('a ledger replaced with one the same length and the same mtime is read again', () => {
    wi.createWorkItem(dir, { title: 'One' }, { source: 'founder', now: NOW - 9000 });
    wi.readWorkItems(dir, NOW);
    const was = fs.statSync(file());
    const text = fs.readFileSync(file(), 'utf8');
    fs.rmSync(file());
    fs.writeFileSync(file(), text.replace('One', 'Uno'));
    fs.utimesSync(file(), was.atimeMs / 1000, was.mtimeMs / 1000);
    const now = fs.statSync(file());
    expect([now.size, Math.floor(now.mtimeMs)]).toEqual([was.size, Math.floor(was.mtimeMs)]);
    expect(wi.readWorkItems(dir, NOW)[0].title).toBe('Uno');
  });

  it('a copy handed out is not changed by what is folded on after it', () => {
    const a = wi.createWorkItem(dir, { title: 'One' }, { source: 'founder', now: NOW - 9000 });
    const before = wi.readWorkItem(dir, a.id, NOW);
    wi.updateWorkItem(dir, a.id, { title: 'Changed', labels: ['x'] }, { source: 'founder', now: NOW - 10 });
    expect(wi.readWorkItem(dir, a.id, NOW).title).toBe('Changed');
    expect(before.title).toBe('One');
    expect(before.labels).toEqual([]);
  });
});

describe('what a heartbeat costs', () => {
  it('on a ledger of her size, a fraction of folding it all again', () => {
    // About 8 MB: thousands of threads with long results, as hers has.
    const big = 'x'.repeat(1500);
    const lines = [];
    for (let i = 0; i < 4000; i += 1) {
      const id = `w-${(0x10000000 + i).toString(16).padStart(10, '0')}`;
      lines.push(JSON.stringify({ id, ts: NOW - 1e6 + i, source: 'founder', patch: { title: `Thread ${i}`, kind: 'directive' } }));
      lines.push(JSON.stringify({ id, ts: NOW - 1e6 + i + 1, source: 'agent', patch: { result: big, note: big.slice(0, 300) } }));
    }
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), lines.join('\n') + '\n');
    let t = performance.now();
    wi.readWorkItems(dir, NOW);
    const full = performance.now() - t;
    const beats = [];
    for (let i = 0; i < 20; i += 1) {
      append({ id: 'w-0010000000', ts: NOW + i, source: 'agent', epoch: 1, heartbeat: true, claim: { holder: 'mcp-1', leaseUntil: NOW + 60_000 }, patch: {} });
      t = performance.now();
      wi.readWorkItems(dir, NOW);
      beats.push(performance.now() - t);
    }
    beats.sort((x, y) => x - y);
    expect(beats[10]).toBeLessThan(full / 4);
  }, 60_000);
});
