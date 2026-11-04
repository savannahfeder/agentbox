// YOUR THREADS ARE ONE LIST IN SECTIONS (w-b5f23cff71).
//
// "I find myself a little bit confused by this interface because it's sort of
// the same tab system that we have above. It's two levels of the same thing
// ... just stack them so it's one list: it first shows In Progress and when
// you scroll down you can see Later. Maybe later you can see Done." Under
// Everything else your own threads sat behind In progress, Later and Done
// tabs, right under the Needs you and Everything else tabs (her screenshot).
// Now they are one list: In progress, then Later, then what you finished
// today, each under a header row you can click to fold. J and K walk straight
// through all three, and each row keeps its own section's keys and times.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stackRows, readFolded, toggleFolded } from '../renderer/src/threads/stack-rules.ts';
import { SectionHead } from '../renderer/src/threads/Pages.tsx';

const row = (id, extra = {}) => ({ id, product: 'p', productName: 'P', status: 'open', title: id, labels: ['founder'], priority: 5, epoch: 1, claim: null, createdAt: 1, updatedAt: 1, ...extra });
const DAY = Date.parse('2026-10-27T00:00:00');
const progress = [row('a'), row('b')];
const later = [row('c', { start: 'later' })];
const done = [row('d', { status: 'done', updatedAt: DAY + 5 }), row('e', { status: 'done', updatedAt: DAY - 5 })];

describe('the sections', () => {
  const stack = stackRows({ progress, later, done, dayStart: DAY, folded: new Set() });

  it('are In progress, Later and Done today, in that order, each with its count', () => {
    expect(stack.sections.map((s) => [s.key, s.label, s.count, s.tab])).toEqual([
      ['progress', 'In progress', 2, 'progress'],
      ['later', 'Later', 1, 'snoozed'],
      ['done', 'Done today', 1, 'done'],
    ]);
  });

  it('walk as one list, In progress first', () => {
    expect(stack.rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(stack.tabOf(stack.rows[2])).toBe('snoozed');
    expect(stack.tabOf(stack.rows[3])).toBe('done');
  });

  it('leave a folded section\'s rows out of the walk but keep its header and count', () => {
    const folded = stackRows({ progress, later, done, dayStart: DAY, folded: new Set(['later']) });
    expect(folded.rows.map((r) => r.id)).toEqual(['a', 'b', 'd']);
    expect(folded.sections.find((s) => s.key === 'later')).toMatchObject({ count: 1, folded: true });
  });

  // Seen on the first build: two Later threads that were in the Done list too
  // were drawn under Done today, and Later's header stood over nothing.
  it('put a thread that is in two lists in the first of them only', () => {
    const both = stackRows({ progress, later, done: [...done, { ...later[0], updatedAt: DAY + 9 }], dayStart: DAY, folded: new Set() });
    expect(both.rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(both.sectionOf(later[0])).toBe('later');
    expect(both.sections.find((s) => s.key === 'done').count).toBe(1);
  });

  it('draw no header for a section with nothing in it', () => {
    const quiet = stackRows({ progress, later: [], done: [], dayStart: DAY, folded: new Set() });
    expect(quiet.sections.map((s) => s.key)).toEqual(['progress']);
  });

  it('remember what you folded', () => {
    const box = new Map();
    const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
    toggleFolded('later', store);
    expect([...readFolded(store)]).toEqual(['later']);
    toggleFolded('later', store);
    expect([...readFolded(store)]).toEqual([]);
  });
});

describe('a section\'s header row', () => {
  const draw = (props) => renderToStaticMarkup(h(SectionHead, { label: 'Later', count: 23, tab: 'snoozed', folded: false, onFold() {}, ...props }));

  it('names the section and its count where the Thread column is, and the section\'s own time column', () => {
    const html = draw();
    expect(html).toMatch(/aria-expanded="true"[^>]*>[\s\S]*Later[\s\S]*23/);
    expect(html).toContain('>Back<');
    expect(draw({ tab: 'done' })).toContain('>Done<');
  });

  it('says when it is folded', () => {
    expect(draw({ folded: true })).toContain('aria-expanded="false"');
  });
});

describe('in the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('has no In progress, Later and Done tabs under Everything else any more', () => {
    expect(app).not.toMatch(/tabs=\{INBOX_TABS\.filter\(\(t\) => t\.view !== 'inbox'\)/);
  });

  it('walks the stacked rows with the keyboard, and keys a row by its own section', () => {
    // Needs you's own parts by who is waiting come second (2026-10-30).
    expect(app).toMatch(/: stacked \? stacked\.rows : (needsStacked \? needsStacked\.rows : )?boardOrder \?\? heldBox\.rows;/);
    expect(app).toMatch(/const keyTab = stacked && pointed \? stacked\.tabOf\(pointed\) : view;/);
  });
});
