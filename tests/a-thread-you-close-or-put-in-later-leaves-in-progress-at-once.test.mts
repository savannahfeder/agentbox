// A THREAD YOU CLOSE OR PUT IN LATER LEAVES IN PROGRESS AT ONCE, EVEN WITH
// ITS AGENT STILL RUNNING.
//
// What broke, 2026-11-25: three threads were running in the cloud. They were
// put in Later and then closed, and they stayed in In progress reading Working.
// Measured from their ledger: all three carried a Later written by the person,
// and later a done written by the person, with no claim left on them. The rules
// let a live run outrank both. A put-off thread with a run on it stayed in In
// progress until the run ended, and a closed one stayed while its run wound
// down, which for a cloud run includes bringing its work home.
//
// An agent's own done while it writes its last message still stays In progress
// until it exits (w-bc976fd247), and an agent's own moment still waits for its run.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { belongsInProgress, closedByThem, inLaterByThem, putOffInLater } from '../renderer/src/list-rules.ts';

const NOW = 1_795_640_000_000;
const TOMORROW = NOW + 86_400_000;

const row = (over = {}) => ({
  id: 'w-android', status: 'open', kind: 'task', labels: ['founder'], title: 'Android Done and Later columns',
  createdAt: NOW - 600_000, updatedAt: NOW - 60_000, wrote: {}, ...over,
});

const closedByHer = row({ status: 'done', wrote: { status: { ts: NOW - 5_000, source: 'founder' } } });
const closedByAgent = row({ status: 'done', wrote: { status: { ts: NOW - 5_000, source: 'agent' } } });
const putOffByHer = row({ snoozedUntil: TOMORROW, wrote: { snoozedUntil: { ts: NOW - 30_000, source: 'founder' } } });
const putOffByAgent = row({ status: 'blocked', runAt: TOMORROW, wrote: { runAt: { ts: NOW - 30_000, source: 'agent' } } });

describe('closing a thread whose agent is still running', () => {
  it('takes it out of In progress at once when you closed it', () => {
    expect(closedByThem(closedByHer)).toBe(true);
    expect(belongsInProgress(closedByHer, { now: NOW, live: true })).toBe(false);
  });

  it('keeps it In progress until exit when the agent wrote done itself', () => {
    expect(closedByThem(closedByAgent)).toBe(false);
    expect(belongsInProgress(closedByAgent, { now: NOW, live: true })).toBe(true);
  });

  it('leaves an open thread with a run on it In progress', () => {
    expect(belongsInProgress(row(), { now: NOW, live: true })).toBe(true);
  });

  it('puts it in Done on the desktop and the phone while the run winds down', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const done = app.slice(app.indexOf('const done = useMemo(() => {'), app.indexOf('.sort((a, b) => b.updatedAt - a.updatedAt);', app.indexOf('const done = useMemo(() => {')));
    expect(done).toMatch(/\(!liveIds\.has\(i\.id\) \|\| closedByThem\(i\)\)/);
    const phone = fs.readFileSync(new URL('../mobile/src/lib/tabs.ts', import.meta.url), 'utf8');
    expect(phone).toMatch(/const done = items\.filter\(\(i\) => !needsYou\.has\(i\.id\) && \(!live\.has\(i\.id\) \|\| closedByThem\(i\)\)/);
  });
});

describe('putting a thread in Later while its agent runs', () => {
  it('puts it in Later at once when you put it there', () => {
    expect(inLaterByThem(putOffByHer, TOMORROW, NOW)).toBe(true);
    expect(putOffInLater(putOffByHer, { hiddenUntil: TOMORROW, now: NOW, waitingOn: [], runOnIt: true })).toBe(true);
  });

  it('still waits for the run when only the agent set the moment', () => {
    expect(inLaterByThem(putOffByAgent, TOMORROW, NOW)).toBe(false);
    expect(putOffInLater(putOffByAgent, { hiddenUntil: TOMORROW, now: NOW, waitingOn: [], runOnIt: true })).toBe(false);
  });

  it('does not count once the moment has passed or a start lifted it', () => {
    expect(inLaterByThem(putOffByHer, TOMORROW, TOMORROW + 1)).toBe(false);
    // Try again passes a hiddenUntil of 0 while the run is being started.
    expect(inLaterByThem(putOffByHer, 0, NOW)).toBe(false);
  });

  it('does not count once you have answered it since', () => {
    const answered = row({
      snoozedUntil: TOMORROW, answer: 'go on',
      wrote: { snoozedUntil: { ts: NOW - 30_000, source: 'founder' }, answer: { ts: NOW - 10_000, source: 'founder' } },
    });
    expect(inLaterByThem(answered, TOMORROW, NOW)).toBe(false);
  });

  it('puts it in Later while it is queued for a run too', () => {
    expect(putOffInLater(putOffByHer, { hiddenUntil: TOMORROW, now: NOW, waitingOn: [], runOnIt: true })).toBe(true);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app.match(/putOffInLater\(i, \{[^}]*\}\)/)?.[0] ?? '').toMatch(/runOnIt:[^}]*queuedIds\.has\(i\.id\)/);
  });

  it('keeps a queued thread nobody put off In progress and out of Later', () => {
    expect(belongsInProgress(row(), { now: NOW })).toBe(true);
    expect(putOffInLater(row(), { hiddenUntil: 0, now: NOW, waitingOn: [], runOnIt: true })).toBe(false);
  });

  it('leaves In progress on the desktop and the phone', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const progress = app.slice(app.indexOf('const progress = useMemo(() => ['), app.indexOf('].sort(byRunningOrder(score))'));
    expect(progress).toMatch(/if \(hiddenAt\(i\) > listNow && \(!liveIds\.has\(i\.id\) \|\| inLaterByThem\(i, hiddenAt\(i\), listNow\)\)\) return false;/);
    const phone = fs.readFileSync(new URL('../mobile/src/lib/tabs.ts', import.meta.url), 'utf8');
    expect(phone).toMatch(/\(hiddenAt\(i\) <= now \|\| \(live\.has\(i\.id\) && !inLaterByThem\(i, hiddenAt\(i\), now\)\)\)/);
  });
});
