// THE INBOX SAYS EMPTY ONE WAY AND KEEPS THE ACCENT SMALL (2026-11-21).
//
// Before onboarding people, the founder found the Inbox unpolished. In the
// tour screenshots: In progress said one centred line, Done a two-sentence
// explanation that wrapped onto a lone "close it.", and the board printed
// "Nothing here." top-left in every empty column. The board's drag grip sat at
// the far right of Needs you and read as part of In progress's label. On light
// the last-opened row was washed orange across its width. A "Tab · Next tab"
// plate popped under a tab right after it was clicked. The Cloud button's dot
// touched the end of the word. Measured by reading page-rules.ts, Pages.tsx,
// pages.css and styles.css, and by rendering the board with nothing in it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { emptyTabWords } from '../renderer/src/threads/page-rules.ts';

const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const pages = read('renderer/src/threads/Pages.tsx');
const css = read('renderer/src/threads/pages.css');
const styles = read('renderer/src/styles.css');
const rule = (src: string, selector: RegExp) => src.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('an empty tab', () => {
  it('says one short line on every tab', () => {
    for (const view of ['progress', 'snoozed', 'done']) {
      for (const waiting of [0, 1, 4]) {
        const words = emptyTabWords(view, false, waiting);
        expect(words.length, `${view}: ${words}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('keeps saying where a finished thread went', () => {
    expect(emptyTabWords('done')).toMatch(/Needs you/);
  });

  it('balances a line that does wrap, so no word sits alone', () => {
    expect(rule(css, /\.th-empty/)).toMatch(/text-wrap:\s*balance/);
  });
});

describe('the board', () => {
  const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
  const html = renderToStaticMarkup(h(InboxBoard, { items: [], products: [], display, now: 2, onOpenItem() {}, onReorderColumns() {} } as never));

  it('leaves an empty column blank', () => {
    expect(html).toContain('th-col-h');
    expect(html).not.toContain('Nothing here');
    expect(html).not.toContain('th-col-empty');
  });

  it('puts the grip beside its own label, not at the far end of the heading', () => {
    expect(html.match(/class="th-col-grip"/g)).toHaveLength(4);
    const grip = rule(css, /\.th-col-grip/);
    expect(grip).toMatch(/margin-left:\s*\d+px/);
    expect(grip).not.toMatch(/margin-left:\s*auto/);
  });
});

describe('the accent stays small', () => {
  it('washes the last-opened row on light in a neutral ink, as on dark', () => {
    const light = rule(styles, /\[data-theme="light"\] \.row\.recent/);
    expect(light).toMatch(/rgb\(18 24 42 \/ 0\.0\d+\)/);
    expect(light).not.toMatch(/238 96 24|accent/);
  });

  // The case that must not match: dark keeps its white fade.
  it('leaves the dark wash as it was', () => {
    expect(rule(styles, /\.row\.recent/)).toMatch(/255 255 255/);
  });

  it('gives the Cloud button\'s dot room past the word', () => {
    const named = rule(css, /\.th-cloud\.named:has\(> i\)/);
    const pad = Number(named.match(/padding-right:\s*(\d+)px/)?.[1] ?? 0);
    expect(pad).toBeGreaterThanOrEqual(18);
  });
});

describe('a tab just clicked', () => {
  it('marks itself on the press and clears the mark when the pointer leaves', () => {
    const tabs = pages.match(/data-hint="state-tab"[^>]*>/g) ?? [];
    expect(tabs.length).toBeGreaterThanOrEqual(4);
    for (const t of tabs) expect(t).toContain('{...quietOnceClicked}');
    expect(pages).toMatch(/onPointerDown: [^\n]*dataset\.clicked = ''/);
    expect(pages).toMatch(/onPointerLeave: [^\n]*delete [^\n]*dataset\.clicked/);
  });

  it('shows no hint plate while the pointer stays on it', () => {
    expect(css).toMatch(/body:has\(\.tm-tab\[data-clicked\]:hover\) \.hint-plate \{ display: none/);
  });
});
