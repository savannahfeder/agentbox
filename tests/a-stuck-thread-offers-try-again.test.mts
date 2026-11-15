// A STUCK THREAD OFFERS TRY AGAIN, IN ITS ROW AND IN THE THREAD.
//
// Asked for on w-d08dcbb6fc (2026-10-28): after a usage limit and a switch of
// account some threads stayed stuck, and the only ways back were a selection
// and Resume, or the command bar. "Maybe we could have a button or some easy
// way that enables people to try again." Measured before this: no row and no
// thread drew any control on a thread reading Nothing running, and the
// Stopped bar's "restart the agent" answered "Nothing here to restart" on a
// thread the app had stopped starting, because that thread had no reply on it.
//
// The button is offered where nothing will start the thread without a person,
// and nowhere an agent is on it or coming.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { offersTryAgain } from '../renderer/src/try-again.ts';
import { RowCells, TryAgainButton } from '../renderer/src/threads/Pages.tsx';
import { statusCell } from '../renderer/src/status-word.ts';

const NOW = Date.parse('2026-10-28T21:00:00Z');
const HOUR = 3_600_000;

const thread = (over = {}) => ({
  id: 'w-1', product: 'p', productName: 'P', status: 'open', kind: 'directive', title: 'A thread', body: '',
  labels: ['founder'], priority: 2, createdAt: NOW - HOUR, updatedAt: NOW - HOUR, claim: null,
  wrote: { title: { ts: NOW - HOUR, source: 'founder' }, labels: { ts: NOW - HOUR, source: 'system' } },
  ...over,
});
const fleet = (over = {}) => ({ queued: [], runNow: [], signInNeeded: {}, atLimit: {}, now: NOW, ...over });
const limitNote = thread({
  result: 'Claude Code hit its usage limit partway through, so this task is not finished.',
  wrote: { title: { ts: NOW - HOUR, source: 'founder' }, result: { ts: NOW - 60_000, source: 'agent' } },
});

describe('offered on a thread nothing will start', () => {
  it('In progress with nothing running or coming', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true }))).toBe(true);
  });

  it('stopped', () => {
    expect(offersTryAgain(thread(), fleet({ stalled: true }))).toBe(true);
  });

  it('a run came back with nothing', () => {
    expect(offersTryAgain(thread(), fleet({ silent: { runs: 1, endedAt: NOW - 60_000 } }))).toBe(true);
  });

  it('at its limit, which switching accounts may already have fixed', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true, atLimit: { 'w-1': { tool: 'Claude Code', until: NOW + HOUR } } }))).toBe(true);
  });

  it('in Needs you with the app’s own note that a run stopped at a limit', () => {
    expect(offersTryAgain(limitNote, fleet())).toBe(true);
  });
});

describe('not offered where an agent is on it, coming, or waiting on you', () => {
  it('working', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true, session: { itemId: 'w-1', startedAt: NOW, tail: [] } }))).toBe(false);
  });

  it('queued or up next', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true, queued: ['w-1'] }))).toBe(false);
    expect(offersTryAgain(thread(), fleet({ inProgress: true, queued: ['w-1'], runNow: ['w-1'] }))).toBe(false);
  });

  it('signed out, which waits for a sign-in a press cannot do', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true, signInNeeded: { 'w-1': 'Claude Code' } }))).toBe(false);
  });

  it('asking you something, or shipping', () => {
    expect(offersTryAgain(thread(), fleet({ inProgress: true, asking: true }))).toBe(false);
    expect(offersTryAgain(thread(), fleet({ inProgress: true, shipping: true }))).toBe(false);
  });

  it('an agent’s real answer waiting on you', () => {
    const answered = thread({ result: 'Here is the plan.', wrote: { title: { ts: NOW - HOUR, source: 'founder' }, result: { ts: NOW - 60_000, source: 'agent' } } });
    expect(offersTryAgain(answered, fleet())).toBe(false);
  });

  it('done, scheduled, or in the practice project', () => {
    expect(offersTryAgain(thread({ status: 'done' }), fleet({ stalled: true }))).toBe(false);
    expect(offersTryAgain(thread(), fleet({ inProgress: true, scheduledUntil: NOW + HOUR }))).toBe(false);
    expect(offersTryAgain(thread(), fleet({ inProgress: true, practice: true }))).toBe(false);
  });

  it('before the window has read what the agents are doing', () => {
    expect(offersTryAgain(thread(), { inProgress: true, now: NOW })).toBe(false);
  });
});

describe('where it is drawn', () => {
  const row = (facts, retry) => renderToStaticMarkup(React.createElement(RowCells, {
    status: statusCell(thread(), facts), retry, title: 'A thread', where: 'P', priority: 2, updatedAt: NOW, now: NOW,
  }));

  // The mark is always there, not on hover: the person picked it (2026-10-30).
  it('in the Status cell, after the word, on a stuck row', () => {
    const html = row(fleet({ inProgress: true }), React.createElement(TryAgainButton, { onPress: () => {} }));
    expect(html).toMatch(/class="th-cell-state can-retry"[\s\S]*Nothing running<button[^>]*class="th-retry" aria-label="Try again"/);
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.th-retry[^{]*\{[^}]*opacity: 0/);
  });

  it('nowhere on a row that is not stuck', () => {
    const html = row(fleet({ inProgress: true, queued: ['w-1'] }), undefined);
    expect(html).not.toContain('th-retry');
    expect(html).toMatch(/class="th-cell-state"[^>]*>/);
  });

  it('in the thread, on the line under the conversation', () => {
    const live = fs.readFileSync(new URL('../renderer/src/components/Live.tsx', import.meta.url), 'utf8');
    expect(live).toMatch(/offersTryAgain\(item/);
    expect(live).toMatch(/className="live-retry" onClick=\{onTryAgain\}>Try again</);
  });

  it('on the Stopped bar, which tries again rather than only handing back a reply', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/className="stalled-bar" onClick=\{onTryAgain \?\? onRedeliver\}/);
  });

  it('pressing it is Resume on that one thread', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const tryAgain = useCallback\(async \(item: WorkItem\) => \{[\s\S]{0,200}resumeItems\?\.\(\{ ids: \[item\.id\] \}\)/);
    expect(app).toMatch(/<TryAgainContext\.Provider value=\{tryAgain\}>/);
    expect(app).toMatch(/id: 'try-again', label: 'Try again'/);
  });
});
