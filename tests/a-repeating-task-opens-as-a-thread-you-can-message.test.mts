// A REPEATING TASK OPENS AS A THREAD YOU CAN MESSAGE.
//
// What broke (2026-10-13): opening the daily analytics report drew its
// instruction, a two-column table of runs and a box at the foot shaped exactly
// like a thread's Reply box. It was not one. Typing "can you do the report now
// for today please" into it and pressing Save replaced the instruction every
// later run is briefed with, and the report would have run at 10:00 told only
// that sentence. Her words: "I thought I could just message the agent ... I
// would expect it to be like a normal chat". Measured on her store: the rule's
// title went from "Daily Agentbox analytics report" with a 1,600-character body
// to that one sentence with an empty body, in one Save.
//
// So a repeating task now opens as its latest run, an ordinary thread: the
// Reply box messages that run's agent like any other. The instruction is one
// more line in that thread's summary, under a heading that says what it is,
// and the schedule is one more property with Stop repeating in its menu.
// `runToOpen` picks the run; the summary is drawn with react-dom/server so
// these are the real components.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runToOpen } from '../shared/repeats.mjs';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 13, 17, 0);
const rule = (o = {}) => ({
  id: 'r-aaaa', product: 'acme', productName: 'Acme', title: 'Daily signups report',
  body: 'Count yesterday\'s signups and say what moved.', every: 'day', at: '10:00',
  createdAt: NOW - 100 * H, served: '2026-10-13', misses: 0, alerted: 0, lastOccurrence: 'r-aaaa-20261013', ...o,
});
const run = (id, back, o = {}) => ({
  id, product: 'acme', productName: 'Acme', title: `Daily signups report · ${id}`, kind: 'directive', status: 'done',
  labels: ['founder', 'repeat:r-aaaa'], priority: 5, epoch: 1, claim: null,
  createdAt: NOW - back * H, updatedAt: NOW - back * H + H, ...o,
});

describe('which run a repeating task opens on', () => {
  it('opens the run it last served', () => {
    const items = [run('r-aaaa-20261012', 25), run('r-aaaa-20261013', 1)];
    expect(runToOpen(rule(), items)?.id).toBe('r-aaaa-20261013');
  });

  it('opens the newest run on file when the last served one has left the store', () => {
    const items = [run('r-aaaa-20261011', 49), run('r-aaaa-20261012', 25)];
    expect(runToOpen(rule(), items)?.id).toBe('r-aaaa-20261012');
  });

  it('opens a run that is still going', () => {
    const items = [run('r-aaaa-20261012', 25), run('r-aaaa-20261013', 0, { status: 'claimed' })];
    expect(runToOpen(rule(), items)?.id).toBe('r-aaaa-20261013');
  });

  it('never opens another rule\'s run, even a newer one', () => {
    const other = run('r-bbbb-20261013', 0, { labels: ['founder', 'repeat:r-bbbb'] });
    expect(runToOpen(rule({ lastOccurrence: undefined }), [other, run('r-aaaa-20261012', 25)])?.id).toBe('r-aaaa-20261012');
    expect(runToOpen(rule({ lastOccurrence: undefined }), [other])).toBeNull();
  });

  it('never opens a run from another project that happens to carry the same rule id', () => {
    const elsewhere = run('r-aaaa-20261013', 1, { product: 'other' });
    expect(runToOpen(rule(), [elsewhere])).toBeNull();
  });

  it('has nothing to open before the first run', () => {
    expect(runToOpen(rule({ lastOccurrence: undefined, served: '' }), [])).toBeNull();
  });
});

const draw = (el) => renderToStaticMarkup(el);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/\s+/g, ' ').trim();
const thread = run('r-aaaa-20261013', 1, { problem: 'Signups were flat.' });

describe('the run\'s summary carries the instruction and the schedule', () => {
  const html = draw(React.createElement(SummaryPanel, {
    item: thread, team: null, onFinish: null,
    repeat: { rule: rule(), onSave: async () => true, onEnd: () => {} },
  }));

  it('draws what every run is told, under a heading that says so', () => {
    expect(text(html)).toContain('Every run is told');
    expect(text(html)).toContain('Daily signups report');
    expect(text(html)).toContain('Count yesterday\'s signups and say what moved.');
  });

  // In the words the Later list's chip already uses (List.tsx repeatTag).
  it('draws the schedule as a property you can open', () => {
    expect(text(html)).toMatch(/Repeats\s+Every day at 10am/);
    expect(html).toContain('title="Stop it repeating"');
  });

  it('keeps the thread\'s own lines and properties as they were', () => {
    expect(text(html)).toContain('Context');
    expect(text(html)).toContain('Signups were flat.');
    expect(text(html)).toContain('Project');
  });

  it('adds nothing to a thread that is not a run of a repeating task', () => {
    const plain = text(draw(React.createElement(SummaryPanel, { item: thread, team: null, onFinish: null })));
    expect(plain).not.toContain('Every run is told');
    expect(plain).not.toContain('Repeats');
  });
});
