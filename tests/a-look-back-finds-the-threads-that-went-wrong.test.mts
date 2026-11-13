// A LOOK BACK FINDS THE THREADS THAT WENT WRONG (w-c20d6c646e).
//
// The self-improve run reads a day of threads and fixes what Agentbox got
// wrong in them. A busy day is about forty threads across every project, and
// the ledger holds every note and heartbeat of each, which no agent can read
// whole. The look-back script folds each thread to who said what, and marks
// the ones with a sign of trouble: the person pushed back, a closed thread came
// back, the app said a run failed or never started, a run exited failed, a
// reply sat unanswered, or the thread went back and forth many times.
// Measured on made-up threads for each sign, the case either side of each
// threshold, and the ordinary thread that must not be marked.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appHome } from '../main/store/home.mts';
import {
  storyFromHistory, storyFromSnapshot, lookBack, renderLookBack, UNANSWERED_MS, LONG_REPLIES,
} from '../.claude/skills/self-improve/scripts/look-back.mjs';

const H = 3600_000;
const now = Date.parse('2026-11-09T12:00:00Z');
const item = (over = {}) => ({ id: 'w-1', product: 'app', title: 'Fix the list', status: 'done', labels: ['founder'], updatedAt: now - H, ...over });
const asked = (ts, body = 'Fix the list') => ({ id: 'w-1', ts, source: 'founder', patch: { title: 'Fix the list', body, status: 'open' } });
const said = (ts, source, patch) => ({ id: 'w-1', ts, source, patch });
const kinds = (story) => story.flags.map((f) => f.kind);

describe('a thread with nothing wrong', () => {
  it('is not marked', () => {
    const s = storyFromHistory(item(), [
      asked(now - 5 * H),
      said(now - 4 * H, 'agent', { result: 'Fixed the list; the tests pass.', status: 'done' }),
      said(now - 3 * H, 'founder', { answer: 'Looks good, ship it' }),
      said(now - 2 * H, 'agent', { result: 'Shipped.' }),
    ], { now });
    expect(s.flags).toEqual([]);
    expect(s.events.filter((e) => e.kind !== 'status').map((e) => e.who)).toEqual(['person', 'agent', 'person', 'agent']);
  });
});

describe('the person pushing back', () => {
  it.each([
    'This still does not work',
    "You didn't do what I asked",
    'Why did it close the thread?',
    'I already said not to touch the tray',
    'It broke again',
  ])('is marked for %j', (answer) => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Done.' }), said(now - H, 'founder', { answer }), said(now - H + 1, 'agent', { result: 'Fixed.' })], { now });
    expect(kinds(s)).toEqual(['pushback']);
  });

  it('is not read into the first ask, which is only the task', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H, 'The button still shows the old count'), said(now - 2 * H, 'agent', { result: 'Fixed.' })], { now });
    expect(kinds(s)).not.toContain('pushback');
  });

  it('is not read into notes pinned on a design, which are about the design', () => {
    const answer = 'Notes on logo-v2.png:\n- Pin 1 at 40% across: still too dark, the wrong blue';
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Here.' }), said(now - H, 'founder', { answer }), said(now - H + 1, 'agent', { result: 'v3.' })], { now });
    expect(kinds(s)).not.toContain('pushback');
  });

  it('is not read into the agent\'s own words', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'It still failed once, then passed.' })], { now });
    expect(kinds(s)).not.toContain('pushback');
  });
});

describe('a closed thread coming back', () => {
  it('is marked when it opens again after done', () => {
    const s = storyFromHistory(item({ status: 'open' }), [
      asked(now - 5 * H),
      said(now - 4 * H, 'agent', { status: 'done', result: 'Done.' }),
      said(now - 3 * H, 'founder', { status: 'open' }),
      said(now - 2 * H, 'agent', { result: 'Done properly this time.' }),
    ], { now });
    expect(kinds(s)).toContain('reopened');
  });

  it('is not marked for open, claimed, done', () => {
    const s = storyFromHistory(item(), [asked(now - 5 * H), said(now - 4 * H, 'agent', { status: 'claimed' }), said(now - 3 * H, 'agent', { status: 'done', result: 'Done.' })], { now });
    expect(kinds(s)).not.toContain('reopened');
  });
});

describe('the app saying a run went wrong', () => {
  it('is marked for a run that never started', () => {
    const s = storyFromHistory(item({ status: 'open' }), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Claude Code stopped before it did anything, so this task has not been started.' })], { now });
    expect(kinds(s)).toContain('app-trouble');
  });

  it('is marked for a note the app wrote about trouble', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'system', { note: 'The ship bounced: a test went red.' }), said(now - H, 'agent', { result: 'Fixed and shipped.' })], { now });
    expect(kinds(s)).toContain('app-trouble');
  });

  it('is not marked for the app\'s good news', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Shipped.' }), said(now - H, 'system', { note: 'Main is green again.' })], { now });
    expect(kinds(s)).toEqual([]);
  });

  it('is not marked for an agent reporting a failing test it then fixed', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'One test failed, I fixed it, all green.' })], { now });
    expect(kinds(s)).toEqual([]);
  });
});

describe('a run that exited failed', () => {
  it('is marked when the run ledger says so', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Done.' })], { now, runs: [{ item: 'w-1', at: now - 2 * H, failed: true, engine: 'claude' }] });
    expect(kinds(s)).toEqual(['failed-run']);
  });

  it('is not marked for a run that ended well', () => {
    const s = storyFromHistory(item(), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Done.' })], { now, runs: [{ item: 'w-1', at: now - 2 * H, failed: false }] });
    expect(s.flags).toEqual([]);
  });
});

describe('a reply nobody answered', () => {
  const thread = (wait) => storyFromHistory(item({ status: 'open' }), [asked(now - 10 * H), said(now - 9 * H, 'agent', { result: 'Here is a plan.' }), said(now - wait, 'founder', { answer: 'Go with the first one' })], { now });

  it('is marked once it has waited past the line', () => {
    expect(kinds(thread(UNANSWERED_MS + 60_000))).toEqual(['unanswered']);
  });

  it('is not marked just under the line', () => {
    expect(kinds(thread(UNANSWERED_MS - 60_000))).toEqual([]);
  });

  it('is not marked while an agent is on it', () => {
    const s = storyFromHistory(item({ status: 'claimed' }), [asked(now - 10 * H), said(now - 9 * H, 'agent', { result: 'Here.' }), said(now - 5 * H, 'founder', { answer: 'Go on' })], { now });
    expect(kinds(s)).toEqual([]);
  });

  it('is not marked once the thread is closed', () => {
    const s = storyFromHistory(item({ status: 'done' }), [asked(now - 10 * H), said(now - 9 * H, 'agent', { result: 'Here.' }), said(now - 5 * H, 'founder', { answer: 'Thanks', status: 'done' })], { now });
    expect(kinds(s)).toEqual([]);
  });
});

describe('a thread that went back and forth', () => {
  const replies = (n) => {
    const lines = [asked(now - 20 * H)];
    for (let i = 0; i < n; i++) {
      lines.push(said(now - (19 - 2 * i) * H, 'agent', { result: `Try ${i}` }));
      lines.push(said(now - (18 - 2 * i) * H, 'founder', { answer: `Change the colour to ${i}` }));
    }
    lines.push(said(now - H, 'agent', { result: 'Done.' }));
    return storyFromHistory(item(), lines, { now });
  };

  it('is marked at the line', () => {
    expect(kinds(replies(LONG_REPLIES))).toEqual(['long']);
  });

  it('is not marked one reply short of it', () => {
    expect(kinds(replies(LONG_REPLIES - 1))).toEqual([]);
  });
});

describe('a thread read from the store tool, without its history', () => {
  const snap = (over) => ({
    id: 'w-2', product: 'app', title: 'Make the logo', status: 'open', updatedAt: now - H,
    body: 'Make the logo', result: 'Here are three.',
    wrote: { result: { ts: now - 6 * H, source: 'agent' }, answer: { ts: now - 5 * H, source: 'founder' } },
    answer: 'Use the second one', ...over,
  });

  it('marks a latest reply that pushes back', () => {
    expect(kinds(storyFromSnapshot(snap({ answer: 'That is wrong, I asked for blue' }), { now }))).toContain('pushback');
  });

  it('marks a latest reply newer than the latest answer by past the line', () => {
    expect(kinds(storyFromSnapshot(snap(), { now }))).toEqual(['unanswered']);
  });

  it('marks nothing when the agent answered after the reply', () => {
    const s = storyFromSnapshot(snap({ wrote: { result: { ts: now - 4 * H, source: 'agent' }, answer: { ts: now - 5 * H, source: 'founder' } } }), { now });
    expect(s.flags).toEqual([]);
  });
});

describe('the look back', () => {
  const quiet = storyFromHistory(item({ id: 'w-q', title: 'Quiet one' }), [asked(now - 3 * H), said(now - 2 * H, 'agent', { result: 'Done.' })], { now });
  const loud = storyFromHistory(item({ id: 'w-l', title: 'Loud one' }), [asked(now - 3 * H), said(now - 2 * H, 'system', { note: 'Held: six starts ended before the agent began.' })], { now, traces: '/store/projects/app/sessions/w-l' });
  const old = storyFromHistory(item({ id: 'w-o', title: 'Old one', updatedAt: now - 30 * H }), [asked(now - 31 * H), said(now - 30 * H, 'system', { note: 'Held.' })], { now });

  it('keeps the window, the marked threads first', () => {
    const seen = lookBack([quiet, loud, old], { since: now - 24 * H });
    expect(seen.flagged.map((s) => s.id)).toEqual(['w-l']);
    expect(seen.quiet.map((s) => s.id)).toEqual(['w-q']);
  });

  it('keeps a thread touched just inside the window and leaves one just outside', () => {
    const inside = storyFromHistory(item({ id: 'w-in', updatedAt: now - 24 * H + 1 }), [asked(now - 25 * H)], { now });
    const outside = storyFromHistory(item({ id: 'w-out', updatedAt: now - 24 * H - 1 }), [asked(now - 25 * H)], { now });
    expect(lookBack([inside, outside], { since: now - 24 * H }).quiet.map((s) => s.id)).toEqual(['w-in']);
  });

  it('writes each marked thread with its words, why it was marked and where its run logs are, and the rest as one line each', () => {
    const text = renderLookBack(lookBack([quiet, loud], { since: now - 24 * H }), { hours: 24 });
    expect(text).toContain('Loud one');
    expect(text).toContain('Held: six starts ended before the agent began.');
    expect(text).toContain('app-trouble');
    expect(text).toContain('/store/projects/app/sessions/w-l');
    expect(text).toMatch(/Quiet one.*w-q/);
    expect(text.indexOf('Loud one')).toBeLessThan(text.indexOf('Quiet one'));
  });

  it('cuts a long message rather than the thread', () => {
    const long = storyFromHistory(item({ id: 'w-x', title: 'Long' }), [asked(now - 3 * H, 'x'.repeat(20_000)), said(now - 2 * H, 'system', { note: 'Held.' })], { now });
    const text = renderLookBack(lookBack([long], { since: now - 24 * H }), { hours: 24 });
    expect(text.length).toBeLessThan(5_000);
    expect(text).toContain('Held.');
  });
});

describe('the script on a computer with the store', () => {
  it('reads every thread of the day from the ledger and names its run logs', async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    try {
      const { resolveAccount } = await import('../mcp/core/account.mts');
      resolveAccount();
      const { createProduct } = await import('../mcp/core/products.mts');
      const product = createProduct('Lookback');
      const { createWorkItem, updateWorkItem } = await import('../main/store/work-items.mts');
      const { machineryDir } = await import('../main/store/home.mts');
      const dir = product.dir;
      const bad = createWorkItem(dir, { title: 'Make the chart', body: 'Make the chart' }, { source: 'founder' });
      updateWorkItem(dir, bad.id, { result: 'Here it is.', status: 'done' }, { source: 'agent' });
      updateWorkItem(dir, bad.id, { answer: 'This is still the old chart', status: 'open' }, { source: 'founder' });
      const traces = path.join(machineryDir(dir), 'sessions', bad.id);
      fs.mkdirSync(traces, { recursive: true });
      fs.writeFileSync(path.join(traces, '1.log'), '# run\n');
      const fine = createWorkItem(dir, { title: 'Rename the page' }, { source: 'founder' });
      updateWorkItem(dir, fine.id, { result: 'Renamed.', status: 'done' }, { source: 'agent' });

      const out = execFileSync(process.execPath, ['.claude/skills/self-improve/scripts/look-back.mjs', '--hours', '1'], { encoding: 'utf8', env: process.env });
      expect(out).toContain('1 with signs of trouble, 1 without');
      expect(out).toContain('**pushback**');
      expect(out).toContain('**reopened**');
      expect(out).toContain(`run logs: ${traces}`);
      expect(out).toMatch(new RegExp(`Rename the page \\(${fine.id}`));
    } finally {
      delete process.env.STORE_ACCOUNT_ID;
    }
  });
});
