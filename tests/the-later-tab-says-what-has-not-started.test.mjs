// LATER HOLDS TWO KINDS OF THREAD AND SAYS WHICH IS WHICH.
//
// The tab was called Scheduled and held only threads with a moment. Since
// "Add it to Later" (w-afb66e6661) it also holds threads with no moment at
// all, so the name promised a time half of them do not have, and nothing on
// the row said so. Her words on the drawing: "I like the idea of some sort of
// tag, like 'not started', that makes it clearer."
//
// The second half of this file is the underline. Her screenshot showed a row
// title underlined, then the people mark sitting in a gap in the line: a row's
// underline is a text-decoration on the title, and a decoration does not paint
// across an inline-BLOCK box, which is what all three marks after the title
// were. Measured by reading pages.css against styles.css `.row .subject`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { INBOX_TABS, RowCells } from '../renderer/src/threads/Pages.tsx';
import { ThreadStateMark } from '../renderer/src/threads/Summary.tsx';
import { belongsInInbox, belongsInProgress, notStarted } from '../renderer/src/list-rules.ts';
globalThis.React = React;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOW = Date.now();
const HOUR = 3_600_000;
const draw = (el) => renderToStaticMarkup(el);
const item = (o = {}) => ({
  id: 'w-later', product: 'northwind', status: 'open', title: 'Rewrite the help centre page on refunds',
  kind: 'directive', labels: ['founder'], priority: 5, epoch: 0, claim: null,
  createdAt: NOW - HOUR, updatedAt: NOW - HOUR, wrote: {}, ...o,
});

describe('the tab', () => {
  it('is called Later, because half of what it holds has no moment', () => {
    expect(INBOX_TABS.find((t) => t.view === 'snoozed')?.label).toBe('Later');
  });
});

describe('the row', () => {
  const row = (o) => draw(React.createElement(RowCells, {
    title: 'Rewrite the help centre page on refunds', where: 'Northwind',
    priority: 5, updatedAt: NOW - HOUR, now: NOW, ...o,
  }));

  // NOT A BOXED TAG ANY MORE (w-4189a5c1a0, 2026-10-05). Out of a dashed
  // circle before the title, faint words after it, the time column, and
  // nothing, the pick was faint words: the same treatment as a repeating
  // task's schedule, so the page has one way of saying a quiet fact.
  it('says a thread has not started in faint words after its title', () => {
    expect(row({ held: true })).toMatch(/class="th-aside">not started</);
    expect(row({ held: true })).not.toMatch(/th-tag/);
  });

  it('says nothing on a thread that has a moment, or on an ordinary one', () => {
    expect(row({ held: false })).not.toMatch(/not started/i);
    expect(row({})).not.toMatch(/not started/i);
  });

  it('puts the words straight after the title, before any mark', () => {
    const html = row({ held: true, shared: true });
    expect(html).toMatch(/Rewrite the help centre page on refunds<span class="th-aside">not started<\/span>[\s\S]*th-shared/);
  });
});

describe('the thread itself', () => {
  it('reads Not started rather than Scheduled', () => {
    expect(draw(React.createElement(ThreadStateMark, { item: item({ start: 'later' }) }))).toContain('Not started');
  });

  it('still reads Scheduled when there is a moment to come back at', () => {
    const html = draw(React.createElement(ThreadStateMark, { item: item({ runAt: NOW + HOUR }) }));
    expect(html).toContain('Scheduled');
    expect(html).not.toContain('Not started');
  });
});

describe('where it is, and is not', () => {
  it('is in neither the inbox nor In progress', () => {
    const held = item({ start: 'later' });
    expect(notStarted(held)).toBe(true);
    expect(belongsInInbox(held, { now: NOW })).toBe(false);
    expect(belongsInProgress(held, { now: NOW })).toBe(false);
  });

  it('goes back to In progress the moment it is started', () => {
    const started = item({ start: 'now' });
    expect(notStarted(started)).toBe(false);
    expect(belongsInProgress(started, { now: NOW })).toBe(true);
  });
});

describe('the underline under a row title', () => {
  const css = read('renderer/src/threads/pages.css');
  const rule = (name) => css.match(new RegExp(`\\.${name} \\{[^}]*\\}`))?.[0] ?? '';

  it('runs through all three marks that sit after the title', () => {
    for (const name of ['th-shared', 'th-shared-n', 'th-lock']) {
      expect(rule(name)).toMatch(/display: inline;/);
    }
  });

  // The faint words after a title are NOT the title, so they stay out of the
  // line: the first drawing of them showed an urgent row's underline running
  // on under "not started". A decoration does not paint across an inline-block.
  it('stops before the faint words after the title', () => {
    expect(rule('th-aside')).toMatch(/display: inline-block;/);
  });

  it('is the row decoration it has to survive, not a border of its own', () => {
    expect(read('renderer/src/styles.css')).toContain('.row .subject {');
  });
});

describe('the card', () => {
  const composer = read('renderer/src/threads/ThreadComposer.tsx');

  it('offers Add it to Later on the menu the Send button already opens', () => {
    expect(composer).toContain('Add it to Later');
    expect(composer).toMatch(/sendTask\(\{ start: 'later' \}\)/);
  });

  it('says where it went rather than that it started', () => {
    expect(read('renderer/src/compose-says.ts')).toContain('Added to Later in');
  });
});
