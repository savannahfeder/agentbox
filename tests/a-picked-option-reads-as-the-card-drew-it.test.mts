// A PICKED OPTION READS AS THE CARD DREW IT, AND THE CARD GOES (F-170).
//
// QA, 2026-10-29 and -30: pressing 1 on a design options card put
// "Picked **Throw a `RangeError` (recommended).** `clamp(5, 10, 0)` throws."
// in the thread, asterisks and backticks shown as typed, and the card stayed
// up under it for the three seconds Z can still take the pick back, so it was
// unclear whether the choice had been taken.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActLine } from '../renderer/src/components/Thread.tsx';
import { answerOnItsWay } from '../renderer/src/item-thread.ts';
import { pickedLine } from '../renderer/src/thread-history.ts';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const line = (verb, subject) => renderToStaticMarkup(h(ActLine, { act: { kind: 'act', verb, subject, at: Date.now() } }));

describe('the line a pick leaves in the thread', () => {
  it('draws bold and code instead of printing their marks', () => {
    const html = line('You picked option 1', '**Throw a `RangeError`.** `clamp(5, 10, 0)` throws.');
    expect(html).toContain('<strong>Throw a <code>RangeError</code>.</strong>');
    expect(html).toContain('<code>clamp(5, 10, 0)</code>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('`');
  });

  it('stays one line: no paragraph, list or link is drawn inside it', () => {
    const html = line('You picked option 2', 'Split every [capital](https://example.com)');
    expect(html).not.toMatch(/<p>|<a |<ul>|<ol>/);
    expect(html).toContain('Split every capital');
  });

  it('drops "(recommended)" wherever it sits, as the card does', () => {
    expect(pickedLine('Option 1: **Throw a `RangeError` (recommended).** It throws.').words).toBe('**Throw a `RangeError`.** It throws.');
    expect(pickedLine('Option 2: Binary units (recommended)').words).toBe('Binary units');
    expect(pickedLine('Option 2: Binary units').words).toBe('Binary units');
  });

  it('leaves plain words as they are', () => {
    expect(line('You picked option 2', 'Binary units')).toContain('Binary units');
  });

  it('is unchanged for an action that is not a pick', () => {
    const html = line('You snoozed it', 'until tomorrow 9:00am');
    expect(html).toContain('Snoozed it until tomorrow 9:00am');
    expect(html).not.toContain('act-choice');
  });
});

describe('the card a pick answered', () => {
  it('goes while the pick is held for Z', () => {
    expect(answerOnItsWay([{ at: 1, text: 'Option 1: Throw a RangeError', held: true }])).toBe(true);
  });

  it('stays when nothing is on its way, or what was sent was turned down', () => {
    expect(answerOnItsWay(undefined)).toBe(false);
    expect(answerOnItsWay([])).toBe(false);
    expect(answerOnItsWay([{ at: 1, text: 'Option 1: x', refused: 'offline' }])).toBe(false);
  });

  it('is left out wherever the pane draws the card', () => {
    expect(focus).toContain('const answered = answerOnItsWay(sending);');
    expect(focus).toContain('{offerInPane && (page || closeAsk || answered ? null : (');
    expect(focus).toContain('{page && stripShown && !fullScreenDoc && !closeAsk && !answered && (');
    expect(focus).toContain('{offerInDock && (closeAsk || answered ? null : (');
  });
});
