// A THREAD BEING SET UP SAYS THINKING, NOT QUEUED.
//
// What broke (w-9993530556, 2026-11-21): a new user sent their first thread,
// it opened 11 ms later, and for the 19.7 s the app spent making the thread's
// own copy of their project it read "Queued" beside a still mark, with
// nothing else running (measured from the app's own counts, and pictured on a
// copy of the app: designs/w-9993530556/today-thread-says-queued.png). They
// asked whether Agentbox was connected to Claude Code at all.
//
// The person's call, on the pictures: a thread being set up reads as one being
// worked on, "Thinking" beside the moving mark, with no separate word for
// starting. Queued stays for a thread really waiting its turn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { liveLine } from '../renderer/src/live-line.ts';
import { statusCell, factsFor } from '../renderer/src/status-word.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';
import { Live } from '../renderer/src/components/Live';

(globalThis as { React?: unknown }).React = React;
const NOW = Date.parse('2026-11-21T20:20:31Z');
const thread = { id: 'w-1', product: 'real', productName: 'Real', status: 'open', kind: 'directive', title: 'What is 7 times 6', body: '', labels: ['founder'], createdAt: NOW - 1000, updatedAt: NOW - 1000, wrote: { title: { ts: NOW - 1000, source: 'founder' } } };
const facts = (over = {}) => ({ queued: ['w-1'], settingUp: ['w-1'], runNow: [], signInNeeded: {}, atLimit: {}, cannotStart: {}, inProgress: true, now: NOW, ...over });
const drawn = (f: object) => renderToStaticMarkup(React.createElement(Live, { item: thread as never, facts: f as never }));

describe('while its folder is being made', () => {
  it('the open thread says Thinking beside the moving mark', () => {
    expect(liveLine(thread as never, facts())?.state).toBe('working');
    const html = drawn(facts());
    expect(html).toContain('Thinking');
    expect(html).not.toContain('Queued');
    expect(html).toContain('is-shimmering');
    expect(html).not.toContain('is-still');
  });

  it('its row says Working, as a run does, and offers no Try again', () => {
    expect(statusCell(thread as never, facts())).toMatchObject({ word: 'Working', live: true });
    expect(offersTryAgain(thread as never, facts())).toBe(false);
  });

  it('even when it was pushed with Run now', () => {
    expect(liveLine(thread as never, facts({ runNow: ['w-1'] }))?.state).toBe('working');
  });

  it('reaches the line through the fleet the lists share', () => {
    expect(factsFor({ queued: ['w-1'], settingUp: ['w-1'] }, 'w-1')).toMatchObject({ settingUp: ['w-1'] });
  });
});

describe('what still says something else', () => {
  it('a thread waiting its turn for a free agent says Queued', () => {
    expect(liveLine(thread as never, facts({ settingUp: [] }))?.state).toBe('queued');
    expect(drawn(facts({ settingUp: [] }))).toContain('Queued');
  });

  it('a thread whose folder is taking minutes says so', () => {
    const slow = facts({ cannotStart: { 'w-1': { why: 'slow-folder', tool: 'Claude Code' } } });
    expect(liveLine(thread as never, slow)?.state).toBe('cannot');
  });

  it('a thread nothing has queued is not made to look busy by a stale list', () => {
    expect(liveLine(thread as never, facts({ queued: [] }))?.state).toBe('queued');
    expect(liveLine({ ...thread, createdAt: NOW - 60_000, wrote: {} } as never, facts({ queued: [] }))?.state).toBe('idle');
  });
});

it('the app lists the threads being set up apart from those asked for by name', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'main', 'supervisor.mts'), 'utf8');
  expect(src).toMatch(/const settingUp = \(id: string\) => !!this\._preparing\?\.has\(id\);/);
  expect(src).toMatch(/settingUp: queued\.filter\(settingUp\),/);
});
