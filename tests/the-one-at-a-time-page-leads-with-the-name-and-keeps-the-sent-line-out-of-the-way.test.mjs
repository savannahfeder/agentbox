// THE ONE-AT-A-TIME PAGE LEADS WITH THE NAME AND KEEPS THE SENT LINE OUT OF THE
// WAY (w-65bcefb857, round eight).
//
// Measured at the founder's zoom on "Restart button hover shifts sidebar",
// just after answering the thread before it: the answer had 336 of 930
// pixels. The sent line took a row above the reply box, the choices took
// three tall rows, the name was said twice (bar and page) while the 24px
// question drew the eye before it, and their last message sat beside the
// Context unread. They picked "Name heads the page" (473 pixels), with a word
// in front of the context saying it is optional, the sent line "in space
// that's never or rarely used", and smaller choices.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueSummary } from '../renderer/src/components/OneThingAtATime.tsx';
import * as rules from '../renderer/src/one-thing-at-a-time.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('renderer/src/one-thing-at-a-time.css');
const focus = read('renderer/src/components/Focus.tsx');
const thread = read('renderer/src/components/ItemThread.tsx');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
const px = (sel, prop) => Number(rule(sel).match(new RegExp(`${prop}: ([\\d.]+)px`))?.[1]);
const draw = (p) => renderToStaticMarkup(h(QueueSummary, { onToggle: noop, open: false, earlier: 0, ...p }));
const noop = () => {};

describe('the name is said once, and read first', () => {
  it('heads the page, and the bar keeps only the way back', () => {
    expect(css).toMatch(/\.app\.one-at-a-time \.thread-crumb-sep:has\(\+ \.thread-crumb-name\), \.app\.one-at-a-time \.thread-crumb-name \{ display: none; \}/);
  });
  it('but a rename still opens its box in the bar', () => {
    expect(css).not.toMatch(/thread-crumb-edit[^{]*\{[^}]*display: none/);
  });
  it('is the largest type on the page, larger than the question under it', () => {
    expect(px('.one-sum .one-title', 'font-size')).toBe(27);
    expect(px('.one-answer .one-q', 'font-size')).toBe(17);
  });
});

describe('the summary under the name', () => {
  it('is one context line, its label saying it can be skipped', () => {
    const html = draw({ title: 'Restart button hover shifts sidebar', context: 'With Groups on, the sidebar widens.' });
    expect(visible(html)).toBe('Restart button hover shifts sidebar Context With Groups on, the sidebar widens.');
    expect(html).toContain('<span class="one-lab">Context</span>');
  });
  it('without your last message, which went unread', () => {
    expect(thread).not.toMatch(/\byou=\{/);
    expect(rules.yourLast).toBeUndefined();
    expect(rules.repeatsTitle).toBeUndefined();
    expect(css).not.toContain('.one-you');
  });
  it('runs two lines across the page before it stops, and opens on a click', () => {
    expect(rule('.one-col')).toMatch(/-webkit-line-clamp: 2/);
    expect(rule('.one-cols.one-whole .one-col')).toMatch(/-webkit-line-clamp: unset/);
  });
  it('with no rule under it', () => {
    expect(rule('.one-sum')).not.toMatch(/border-bottom: 1px/);
  });
});

describe('the sent line', () => {
  it('sits in the empty middle of the top bar, beside where you are in the queue', () => {
    expect(focus).toMatch(/const sentUp = page && !!cornerHeaderTarget && !onPhone\(\);/);
    expect(focus).toMatch(/<span className="ts-top">\{sentUp && aboveDock\}\{queue && <QueueNav/);
  });
  it('and not above the reply box, where it took a row of reading', () => {
    expect(focus).toMatch(/\{!sentUp && aboveDock\}\s*<div className="dock-card">/);
  });
  it('drawn small enough for the bar', () => {
    expect(rule('.ts-top > .sent-line')).toMatch(/margin: 0 16px 0 0/);
    expect(rule('.ts-top > .sent-line')).toMatch(/max-width: 460px/);
  });
});

describe('the choices', () => {
  it('sit in tighter rows', () => {
    // Side by side was tried and taken back: "That looks pretty bad".
    expect(rule('.one-choices .opt-row')).toMatch(/padding: 3px 14px/);
  });
  it('one line each, the whole of a long one on hover or once picked out', () => {
    expect(rule('.one-choices .opt-text')).toMatch(/-webkit-line-clamp: 1/);
    expect(rule('.one-choices .opt-row.selected .opt-text')).toMatch(/-webkit-line-clamp: unset/);
  });
});
