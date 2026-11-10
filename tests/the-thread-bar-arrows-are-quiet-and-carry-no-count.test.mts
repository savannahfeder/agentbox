// THE THREAD BAR'S ARROWS ARE QUIET AND CARRY NO COUNT (w-1c1092f465).
//
// On a screenshot of the bar, "7 OF 26" sat beside two boxed arrows, then Cloud,
// Done and the menu, five bordered boxes in a row with three different gaps
// (6px between the arrows, 16px to Cloud, 10px after it). Asked for: no count,
// and arrows that do not read as two more buttons. Measured by rendering the
// arrows and reading the bar's stylesheets.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueNav } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rule = (css, sel) => {
  const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[2] : '';
};

describe('the arrows in the thread bar', () => {
  it('say no "7 of 26", in the middle of the queue or at either end', () => {
    for (const spot of [{ pos: 7, total: 26, index: 6 }, { pos: 1, total: 26, index: 0 }, { pos: 26, total: 26, index: 25 }]) {
      const html = renderToStaticMarkup(h(QueueNav, { spot, onStep: () => {} }));
      expect(visible(html)).toBe('');
      expect(html).not.toContain('one-pos');
    }
  });

  it('still step up and down, and still grey out with nothing past them', () => {
    const last = renderToStaticMarkup(h(QueueNav, { spot: { pos: 26, total: 26, index: 25 }, onStep: () => {} }));
    expect(last).toContain('aria-label="Previous thread (K)"');
    expect(last).toMatch(/aria-label="Next thread \(J\)"[^>]*disabled/);
  });

  it('draw no border at rest, so they do not read as two more buttons', () => {
    const css = read('renderer/src/one-thing-at-a-time.css');
    expect(rule(css, '.ts-more.one-step')).toMatch(/border-color:\s*transparent/);
  });

  it('while Cloud, Done and the menu keep theirs', () => {
    const summary = read('renderer/src/threads/summary.css');
    expect(rule(summary, '.ts-more')).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(rule(summary, '.ts-done')).toMatch(/border:\s*1px solid var\(--line\)/);
  });

  it('sit together as one pair, with the bar\'s own gap after them', () => {
    const css = read('renderer/src/one-thing-at-a-time.css');
    expect(rule(css, '.one-nav')).toMatch(/gap:\s*0/);
    expect(rule(css, '.one-nav')).not.toMatch(/margin-right/);
  });

  it('leave no rule behind for the count, on the phone either', () => {
    expect(read('renderer/src/one-thing-at-a-time.css')).not.toContain('.one-pos');
    expect(read('renderer/src/phone.css')).not.toContain('.one-pos');
  });
});
