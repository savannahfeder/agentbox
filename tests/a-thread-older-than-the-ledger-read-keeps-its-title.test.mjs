// A THREAD OLDER THAN THE LEDGER READ KEEPS ITS TITLE.
//
// What broke (w-cf4f7fdcb2, 2026-10-21): an open thread in the inbox had no
// name, on its row or at the top of the thread. The app folds only the last
// 8 MB of a project's ledger. The thread was made on Oct 6, and everything
// written to it after the cut was "Moved to Later", so it was folded from
// those lines alone. Measured through the store tool on the real project
// that day: title '', kind '', no body, created at its first snooze inside
// the window (Oct 8, 6:52pm), and 16 rows of that project read blank the same
// way, the oldest starting where the cut fell.
//
// A thread's title is written once, by the line that makes it, so a fold with
// no title is a thread the cut went through. An unfinished one now has its
// lines before the cut read and folded in. A finished one is left to the older
// pages of Done, so a ledger without an unfinished one is read as before, with
// nothing extra read. The claim stays the window's: claims made after the cut
// were numbered from what the window held, so an older, higher claim must not
// fence off what those agents wrote.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setAppHome, clearAppHome } from './app-home.mjs';
import * as wi from '../main/store/work-items.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const WINDOW = 8 * 1024 * 1024;
const T0 = Date.parse('2026-10-06T21:04:00Z');
const NOW = Date.parse('2026-10-21T23:00:00Z');
const DAY = 86_400_000;
const FILLER = 'w-ffffffffff';

let home; let dir;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-head-'));
  setAppHome(path.join(home, 'app'));
  dir = path.join(home, 'proj');
  fs.mkdirSync(dir, { recursive: true });
  wi._internals.forgetFolds();
});
afterEach(() => { clearAppHome(); wi._internals.forgetFolds(); fs.rmSync(home, { recursive: true, force: true }); });

const file = () => wi._internals.ledgerPath(dir);
const size = () => fs.statSync(file()).size;
const json = (line) => JSON.stringify(line) + '\n';
const append = (line) => fs.appendFileSync(file(), json(line));

// Lines on a finished thread of their own until the file is `target` bytes long.
function fillTo(target) {
  for (let i = 0; size() < target; i += 1) {
    const line = { id: FILLER, ts: T0 + DAY + i, source: 'agent', patch: { note: `filler ${i}`, status: 'done' }, pad: '' };
    const left = target - size();
    const len = left > 201 * 1024 ? 200 * 1024 : left;
    if (len < json(line).length) throw new Error(`no room for a filler line (${left} bytes left)`);
    append({ ...line, pad: 'x'.repeat(len - json(line).length) });
  }
}

// Fill, then write `later`, so that the 8 MB read starts at byte `cut`.
function cutAt(cut, later = []) {
  const tail = later.reduce((n, l) => n + Buffer.byteLength(json(l)), 0);
  fillTo(cut + WINDOW - tail);
  for (const l of later) append(l);
  expect(size() - WINDOW).toBe(cut);
}

// What the whole file says, every line folded.
function whole(id) {
  const lines = fs.readFileSync(file(), 'utf8').split('\n').filter(Boolean);
  return foldWorkItems(lines, NOW).get(id);
}

const snooze = (id, ts) => ({ id, ts, source: 'founder', patch: { snoozedUntil: ts + DAY } });

function theReportedThread() {
  const t = wi.createWorkItem(dir, {
    title: "Implement the tester's feedback", body: 'Notes on the inbox.', kind: 'directive', labels: ['founder'],
  }, { source: 'founder', now: T0 });
  wi.updateWorkItem(dir, t.id, { label: "Tester's feedback", note: 'Looking for the feedback.' }, { now: T0 + 1000 });
  return t.id;
}

describe('a thread whose first line is older than the 8 MB read', () => {
  it('keeps its title, its words and the day it was made (the thread as reported)', () => {
    const id = theReportedThread();
    const later = [snooze(id, T0 + 2 * DAY), snooze(id, T0 + 3 * DAY)];
    cutAt(size() + 1024, later);
    const row = wi.readWorkItems(dir, NOW).find((i) => i.id === id);
    expect(row).toMatchObject({
      title: "Implement the tester's feedback", label: "Tester's feedback", body: 'Notes on the inbox.',
      kind: 'directive', labels: ['founder'], status: 'open', createdAt: T0, snoozedUntil: T0 + 4 * DAY,
    });
    expect(wi.readWorkItem(dir, id, NOW).title).toBe("Implement the tester's feedback");
  });

  it('reads exactly as the whole file does', () => {
    const id = theReportedThread();
    wi.updateWorkItem(dir, id, { status: 'blocked' }, { now: T0 + 2000 });
    cutAt(size() + 1024, [snooze(id, T0 + 2 * DAY), { id, ts: T0 + 2 * DAY + 1, source: 'agent', patch: { result: 'Still nothing.' } }]);
    expect(wi.readWorkItem(dir, id, NOW)).toEqual(whole(id));
  });

  it('is whole when the cut falls inside the line that made it', () => {
    const start = fs.existsSync(file()) ? size() : 0;
    const id = theReportedThread();
    cutAt(start + 40, [snooze(id, T0 + 2 * DAY)]);
    expect(wi.readWorkItem(dir, id, NOW)).toEqual(whole(id));
    expect(wi.readWorkItem(dir, id, NOW).title).toBe("Implement the tester's feedback");
  });

  it('folds each line once when the cut falls exactly between two lines', () => {
    const id = theReportedThread();
    // A conversation between people keeps every reply; one read twice would show twice.
    wi.updateWorkItem(dir, id, { people: ['p-1', 'p-2'] }, { source: 'founder', now: T0 + 1500 });
    const said = (ts, by, answer) => ({ id, ts, source: 'founder', by, uid: `l-${ts}`, patch: { answer } });
    append(said(T0 + 1600, 'p-1', 'first'));
    const boundary = size();
    append(said(T0 + 1700, 'p-2', 'second'));
    cutAt(boundary, [said(T0 + 2 * DAY, 'p-1', 'third')]);
    const row = wi.readWorkItem(dir, id, NOW);
    expect(row).toEqual(whole(id));
    expect(row.title).toBe("Implement the tester's feedback");
  });

  it('a thread made after the cut reads as it always did', () => {
    theReportedThread();
    cutAt(size() + 1024);
    const fresh = wi.createWorkItem(dir, { title: 'Made after the cut' }, { source: 'founder', now: NOW - DAY });
    expect(wi.readWorkItem(dir, fresh.id, NOW)).toEqual(whole(fresh.id));
  });

  it('is whole when its first line after the cut arrives while the app is running', () => {
    const id = theReportedThread();
    cutAt(size() + 1024);
    expect(wi.readWorkItems(dir, NOW).find((i) => i.id === id)).toBeUndefined();
    // Somebody replies to it from the older pages of Done.
    append({ id, ts: NOW - 1000, source: 'founder', patch: { answer: 'Here is the feedback.', status: 'open' } });
    const row = wi.readWorkItems(dir, NOW).find((i) => i.id === id);
    expect(row).toMatchObject({ title: "Implement the tester's feedback", createdAt: T0, answer: 'Here is the feedback.' });
    expect(row).toEqual(whole(id));
  });

  it('a thread with no title anywhere is read once from the start, not on every line', () => {
    append({ id: 'w-0000000001', ts: T0, source: 'agent', patch: { note: 'no title, ever' } });
    cutAt(size() + 1024, [{ id: 'w-0000000001', ts: T0 + DAY, source: 'agent', patch: { note: 'still none' } }]);
    wi.readWorkItems(dir, NOW);
    expect(readsFromTheStart(() => {
      for (let i = 0; i < 3; i += 1) {
        append({ id: 'w-0000000001', ts: T0 + DAY + 1 + i, source: 'agent', patch: { note: `line ${i}` } });
        expect(wi.readWorkItem(dir, 'w-0000000001', NOW).note).toBe(`line ${i}`);
      }
    })).toBe(0);
  });

  it('a thread with no line after the cut stays out of the snapshot', () => {
    const id = theReportedThread();
    cutAt(size() + 1024);
    expect(wi.readWorkItems(dir, NOW).find((i) => i.id === id)).toBeUndefined();
  });

  it('a thread finished before the cut reads as finished, not as a blank open row, after a stray later line', () => {
    const id = theReportedThread();
    wi.updateWorkItem(dir, id, { status: 'done' }, { source: 'founder', now: T0 + 2000 });
    cutAt(size() + 1024, [{ id, ts: T0 + 2 * DAY, source: 'agent', patch: { note: 'late' } }]);
    expect(wi.readWorkItem(dir, id, NOW)).toMatchObject({ title: "Implement the tester's feedback", status: 'done' });
  });
});

// Every read of the ledger at its first byte, while `fn` runs.
function readsFromTheStart(fn) {
  const reads = [];
  const real = fs.readSync;
  fs.readSync = (fd, buf, off, len, pos) => { reads.push(pos); return real(fd, buf, off, len, pos); };
  try { fn(); } finally { fs.readSync = real; }
  return reads.filter((p) => p === 0).length;
}

describe('a finished thread the cut went through', () => {
  function finishedAndCut() {
    const id = theReportedThread();
    cutAt(size() + 1024, [{ id, ts: T0 + 2 * DAY, source: 'agent', patch: { result: 'Done.', status: 'done' } }]);
    return id;
  }

  it('is left to the older pages, and nothing before the window is read for it', () => {
    const id = finishedAndCut();
    let row;
    expect(readsFromTheStart(() => { row = wi.readWorkItem(dir, id, NOW); })).toBe(0);
    expect(row).toMatchObject({ title: '', status: 'done' });
  });

  it('is whole once a reply reopens it', () => {
    const id = finishedAndCut();
    wi.readWorkItems(dir, NOW);
    append({ id, ts: NOW - 1000, source: 'founder', patch: { answer: 'One more thing.', status: 'open' } });
    expect(wi.readWorkItem(dir, id, NOW)).toMatchObject({ title: "Implement the tester's feedback", status: 'open', createdAt: T0 });
  });
});

describe('claims on a thread the cut went through', () => {
  // Before the cut it was claimed up to epoch 3. After it, a claim numbered
  // from the window alone came out as epoch 1, as every claim did until now.
  function claimedOnBothSides() {
    const id = theReportedThread();
    for (let e = 1; e <= 3; e += 1) {
      append({ id, ts: T0 + e * 10_000, source: 'agent', epoch: e, claim: { holder: `mcp-${e}`, leaseUntil: T0 + e * 10_000 + 300_000 }, patch: { status: 'claimed' } });
      append({ id, ts: T0 + e * 10_000 + 1, source: 'agent', epoch: e, release: true });
    }
    const t = T0 + 5 * DAY;
    cutAt(size() + 1024, [
      { id, ts: t, source: 'agent', epoch: 1, claim: { holder: 'mcp-late', leaseUntil: t + 300_000 }, patch: { status: 'claimed' } },
      { id, ts: t + 1, source: 'agent', epoch: 1, patch: { result: 'Needs the notes.', status: 'blocked' } },
    ]);
    return id;
  }

  it('keeps what the agent after the cut wrote', () => {
    const id = claimedOnBothSides();
    expect(wi.readWorkItem(dir, id, NOW)).toMatchObject({ title: "Implement the tester's feedback", result: 'Needs the notes.', status: 'blocked', epoch: 1 });
  });

  it('numbers the next claim after the window\'s, and what that agent writes lands', async () => {
    const id = claimedOnBothSides();
    wi.updateWorkItem(dir, id, { status: 'open' }, { source: 'founder', now: NOW - 2000 });
    const claim = await wi.claimWorkItem(dir, { id, holder: 'mcp-now', now: NOW - 1000 });
    expect(claim).toMatchObject({ claimed: true, epoch: 2 });
    wi.updateWorkItem(dir, id, { result: 'Built it.' }, { epoch: claim.epoch, now: NOW - 500 });
    expect(wi.readWorkItem(dir, id, NOW)).toMatchObject({ title: "Implement the tester's feedback", result: 'Built it.' });
  });
});
