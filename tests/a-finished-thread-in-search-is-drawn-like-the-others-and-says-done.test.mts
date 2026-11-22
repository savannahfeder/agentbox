// A FINISHED THREAD IN ⌘K IS DRAWN IN THE SAME INK AS THE OTHERS, AND SAYS DONE.
//
// ⌘K drew finished threads at half opacity. Searching "landing" gave five
// finished threads, every one grey, the highlighted one too, and the person
// found the grey confusing. They asked for every row in one colour without
// losing the mark of a finished thread. Measured on the built renderer: a
// finished row's icon, words and hint each had opacity 0.5, an open row's 1.
// Now a finished thread says Done beside its age, as the @ thread picker
// already does (components/ThreadMentions.tsx).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadResult } from '../renderer/src/palette-rows';

const NOW = new Date(2026, 10, 22, 12, 0).getTime();
const min = 60_000;
const thread = (more: Record<string, unknown> = {}) => ({
  id: 'w-1', product: 'web', title: 'Landing page UI fixes', status: 'open',
  createdAt: NOW - 30 * min, updatedAt: NOW - 5 * min, ...more,
});
const hint = (more: Record<string, unknown> = {}) =>
  threadResult(thread(more), { summary: '', project: 'Agentbox Team', now: NOW }).hint;

describe('a finished thread found by search', () => {
  it('says Done between its project and its age', () => {
    expect(hint({ status: 'done' })).toBe('Agentbox Team · Done · 5 min');
  });

  it('says Done with a date once it is a day old', () => {
    expect(hint({ status: 'done', updatedAt: new Date(2026, 10, 16, 9, 0).getTime() })).toBe('Agentbox Team · Done · Nov 16');
  });

  it('an open, blocked or claimed thread does not say Done', () => {
    for (const status of ['open', 'blocked', 'claimed']) expect(hint({ status })).toBe('Agentbox Team · 5 min');
  });
});

describe('⌘K draws it in the same ink as every other row', () => {
  const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
  const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');

  it('gives a finished row no class of its own', () => {
    expect(palette).not.toMatch(/palette-done/);
  });

  it('has no rule that fades a finished row, on the computer or the phone', () => {
    for (const sheet of [css, phone]) expect(sheet.includes('palette-done')).toBe(false);
  });
});
