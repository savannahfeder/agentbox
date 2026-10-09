// A THREAD WITH TASKS WAITING ON YOU SAYS SO, IN ORANGE (w-d2744c6daa).
//
// The list of tasks a thread filed sat under the answer as a faint grey list,
// and a waiting one looked like every other row: "they're not very visible and
// it's really easy to skip them." One had waited 22 hours under a thread that
// was already closed (measured on the real store, 2026-10-07).
//
// Chosen off seven rounds of drawings: while anything in the list waits for a
// yes, the list's outer border is orange, the label reads "Still waiting on
// you" in white, and the waiting rows come first. The Approve buttons keep the
// accent they already had. No keyboard letter: tried and dropped. Once nothing
// waits, the list goes back to its quiet grey self.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadsMade } from '../renderer/src/components/ThreadsMade.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const draw = (rows, extra = {}) => renderToStaticMarkup(React.createElement(ThreadsMade, {
  rows, label: 'Filed from this thread', onOpen: () => {}, onApprove: () => {}, ...extra,
}));
const running = (id, title) => ({ id, title, state: 'running' });
const waiting = (id, title) => ({ id, title, state: 'scheduled', approve: true });

describe('while a task waits for a yes', () => {
  const html = draw([running('w-1', 'Add the counts'), waiting('w-2', 'Find out why'), waiting('w-3', 'Make a chart')]);

  it('marks the whole list as waiting, which is what turns its border orange', () => {
    expect(html).toContain('class="made made-waiting"');
  });

  it('says so in the label', () => {
    expect(html).toContain('>Still waiting on you<');
    expect(html).not.toContain('>Filed from this thread<');
  });

  it('puts the waiting rows first and keeps their own order', () => {
    const order = [...html.matchAll(/class="made-title">([^<]+)</g)].map((m) => m[1]);
    expect(order).toEqual(['Find out why', 'Make a chart', 'Add the counts']);
  });

  it('draws no keyboard letter inside the press', () => {
    expect(html).not.toContain('made-a"');
    expect(html.match(/>Approve</g)).toHaveLength(2);
  });
});

describe('when nothing waits', () => {
  it('keeps the quiet list and its own label once every task has started', () => {
    const html = draw([running('w-1', 'Add the counts'), running('w-2', 'Find out why')]);
    expect(html).toContain('class="made"');
    expect(html).not.toContain('made-waiting');
    expect(html).toContain('>Filed from this thread<');
  });

  it('is not waiting where there is no press to answer with', () => {
    const html = draw([waiting('w-2', 'Find out why')], { onApprove: undefined });
    expect(html).not.toContain('made-waiting');
    expect(html).toContain('>Filed from this thread<');
  });

  it('a task that needs your review is not a yes to wait on, so it alone does not turn the list', () => {
    const html = draw([{ id: 'w-4', title: 'Pick a name', state: 'waiting' }, running('w-1', 'Add the counts')]);
    expect(html).not.toContain('made-waiting');
  });
});

describe('the orange is the border and the words are white', () => {
  const css = read('renderer/src/components/threads-made.css');

  it('turns the list border orange', () => {
    expect(css).toMatch(/\.made-waiting \.made-list \{[^}]*border-color:[^}]*var\(--accent\)/);
  });

  it('turns the label white, not orange', () => {
    const rule = css.match(/\.made-waiting \.made-label \{[^}]*\}/)[0];
    expect(rule).toMatch(/color: var\(--text\)/);
    expect(rule).not.toMatch(/accent/);
  });
});
