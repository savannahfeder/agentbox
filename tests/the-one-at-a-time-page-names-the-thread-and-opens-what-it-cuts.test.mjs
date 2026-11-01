// THE ONE-AT-A-TIME PAGE NAMES THE THREAD AND OPENS WHAT IT CUTS (w-65bcefb857).
//
// Measured on the founder's own screenshot of "Agent stopped check if pushed",
// after the page became the default:
//   - the thread's name was only in the top bar: "the name of the task should
//     exist at the top, right above Context";
//   - Context and their last message stopped at three lines, "and I have no
//     way to expand it", where one more line would have held most of it;
//   - hovering the up and down arrows showed the browser's own tooltip, not the
//     plate that names the key, as everything else in the corner does;
//   - a note read in place ran its whole length with no way to fold it.
//
// Round eight then took their last message off the page and the name out of
// the bar (tests/the-one-at-a-time-page-leads-with-the-name-and-keeps-the-sent-line-out-of-the-way).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueSummary, QueueNav, QueueFile } from '../renderer/src/components/OneThingAtATime.tsx';
import { HINTS } from '../renderer/src/hint-plate.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('renderer/src/one-thing-at-a-time.css');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('the thread\'s name', () => {
  const draw = (p) => renderToStaticMarkup(h(QueueSummary, { onToggle: noop, open: false, earlier: 0, ...p }));
  it('heads the page, read before the Context', () => {
    const html = draw({ title: 'Agent stopped check if pushed', context: 'You asked which test used 4 GB.', you: null });
    expect(html).toMatch(/^<div class="one-sum"><h2 class="one-title">Agent stopped check if pushed<\/h2>/);
    // With no "Context" label since round seventeen.
    expect(visible(html)).toMatch(/^Agent stopped check if pushed You asked/);
  });
  it('and is left out when there is none', () => {
    expect(draw({ title: '', context: 'c', you: null })).not.toContain('one-title');
  });
  it('and the thread page hands the summary the name', () => {
    expect(read('renderer/src/components/ItemThread.tsx')).toMatch(/<QueueSummary[^>]*title=\{pageTitle\(item\)\}/);
  });
});

describe('the Context', () => {
  it('open whole on a click, only when something was cut, and fold back on another', () => {
    const tsx = read('renderer/src/components/OneThingAtATime.tsx');
    expect(tsx).toMatch(/const opens = cut \|\| whole;/);
    expect(tsx).toMatch(/role=\{opens \? 'button' : undefined\}/);
    expect(tsx).toMatch(/aria-expanded=\{opens \? whole : undefined\}/);
    expect(css).toMatch(/\.one-cols\.one-whole \.one-col \{[^}]*-webkit-line-clamp: unset/);
  });
  it('are not a button when nothing was cut', () => {
    const html = renderToStaticMarkup(h(QueueSummary, { onToggle: noop, open: false, earlier: 0, context: 'Short.' }));
    expect(html).not.toContain('role="button"');
  });
});

describe('the up and down arrows', () => {
  const nav = renderToStaticMarkup(h(QueueNav, { spot: { pos: 2, total: 5, index: 1 }, onStep: noop }));
  it('wear the plate that names their key, from the right-hand corner', () => {
    expect(nav).toMatch(/data-hint="previous-thread" data-hint-align="right"/);
    expect(nav).toMatch(/data-hint="next-thread" data-hint-align="right"/);
    expect(HINTS['previous-thread']).toEqual([{ key: 'K', what: 'Previous thread' }]);
    expect(HINTS['next-thread']).toEqual([{ key: 'J', what: 'Next thread' }]);
  });
  it('and not the browser\'s tooltip as well', () => {
    expect(nav).not.toMatch(/title="/);
  });
  it('whose keys walk the threads with one open', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/case 'j': case 'J':/);
    expect(app).toMatch(/case 'k': case 'K':/);
  });
});

describe('a page or a note read in place', () => {
  const md = (t) => h('div', null, t);
  it('can be folded to its name from a button on its head, and starts open', () => {
    const html = renderToStaticMarkup(h(QueueFile, { product: 'p', path: 'reports/listings.md', md, onOpen: noop }));
    expect(html).toMatch(/<button type="button" class="one-filefold" aria-expanded="true"[^>]*>.*listings\.md/);
    expect(visible(html)).toBe('listings.md');
    expect(html).toContain('aria-label="Open full screen"');
  });
  it('and the fold keeps the way to open it full screen', () => {
    const tsx = read('renderer/src/components/OneThingAtATime.tsx');
    expect(tsx).toMatch(/\{!folded && page && url &&/);
    expect(tsx).toMatch(/\{!folded && !page && text != null &&/);
  });
});
