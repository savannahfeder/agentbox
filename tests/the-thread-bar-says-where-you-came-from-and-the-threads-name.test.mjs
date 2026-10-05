// THE THREAD BAR SAYS WHERE YOU CAME FROM AND THE THREAD'S NAME (w-922f66bb06).
//
// What changed, and why: with the summary open, the full top bar (back arrow,
// the thread's title, then PROJECT · ENGINE · LAST MOVED) said again what the
// summary beside it already says, and pushed the conversation down. After ten
// rounds of full-screen drawings the pick, 2026-10-04, was a thin bar holding
// one line in the app's mono capitals: the tab the thread was opened from, a
// slash, and the thread's name, all of it the way back. "NEEDS YOU / FIRST
// FRAME WHITE BACKGROUND FIX".
//
// Her limit on the name: whole words up to the medium length she was shown,
// 59 letters. A 32 letter name looked right, a 59 letter one was fine, and a
// 140 letter one running across the whole bar "looks pretty bad". Past 59 the
// name keeps whole words only, drops a dangling small word ("for", "so"),
// and ends in "…". Folded, the summary gives the full bar back, since then
// nothing else on screen names the thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { crumbName, CRUMB_NAME_MAX } from '../renderer/src/threads/crumb-rules.ts';
import { ThreadCrumb } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the name in the bar keeps whole words up to 59 letters', () => {
  it('is 59, the medium length that was approved', () => {
    expect(CRUMB_NAME_MAX).toBe(59);
  });
  it('leaves a short name alone', () => {
    expect(crumbName('First frame white background fix')).toBe('First frame white background fix');
  });
  it('leaves a name of exactly 59 letters alone', () => {
    const t = 'Add a third pricing tier for teams before the Friday launch';
    expect(t).toHaveLength(59);
    expect(crumbName(t)).toBe(t);
  });
  it('cuts one letter past the limit at the last whole word, with an ellipsis', () => {
    const t = 'Add a third pricing tier for teams before the Friday launchs';
    expect(t).toHaveLength(60);
    expect(crumbName(t)).toBe('Add a third pricing tier for teams before the Friday…');
  });
  it('never ends on a dangling small word or a comma', () => {
    expect(crumbName('Move the onboarding emails to the new sender address before the Monday send'))
      .toBe('Move the onboarding emails to the new sender address…');
    expect(crumbName('Export starts on a white frame, so X and LinkedIn pick it as the thumbnail and every launch post looks broken'))
      .toBe('Export starts on a white frame, so X and LinkedIn pick…');
  });
  it('never cuts inside a word, and stays within the limit', () => {
    const t = 'Export starts on a white frame, so X and LinkedIn pick it as the thumbnail and every launch post looks broken';
    const cut = crumbName(t).replace(/…$/, '');
    expect(cut.length).toBeLessThanOrEqual(59);
    expect(t.startsWith(cut)).toBe(true);
    expect(t[cut.length]).toMatch(/[\s,]/);
  });
  it('cuts one enormous word rather than showing nothing', () => {
    const t = 'x'.repeat(80);
    expect(crumbName(t)).toBe(`${'x'.repeat(59)}…`);
  });
  it('trims stray spaces and handles an empty name', () => {
    expect(crumbName('  Acme renewal  ')).toBe('Acme renewal');
    expect(crumbName('')).toBe('');
  });
});

describe('the crumb itself', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(ThreadCrumb, { from: 'Needs you', name: 'First frame white background fix', onBack: () => {}, ...props }));
  it('reads: where you came from, a slash, the name', () => {
    expect(text(draw())).toBe('Needs you / First frame white background fix');
  });
  it('is one control, the way back, and keeps the back hint and the Esc wording', () => {
    const html = draw();
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/class="back-esc thread-crumb"/);
    expect(html).toMatch(/data-hint="back"/);
    expect(html).toMatch(/aria-label="Back to Needs you \(esc\)"/);
  });
  it('cuts a long name and keeps the whole of it one hover away', () => {
    const long = 'Export starts on a white frame, so X and LinkedIn pick it as the thumbnail and every launch post looks broken';
    const html = draw({ name: long });
    expect(text(html)).toBe('Needs you / Export starts on a white frame, so X and LinkedIn pick…');
    expect(html).toContain(`title="${long}"`);
  });
  it('names whichever tab it came from', () => {
    expect(text(draw({ from: 'Done' }))).toMatch(/^Done \//);
  });
});

describe('the thread view swaps its bar while the summary is open', () => {
  it('portals the crumb into the bar while the summary shows, and the full band otherwise', () => {
    expect(focus).toMatch(/summaryShown && crumbFrom\s*\?\s*<ThreadCrumb/);
    expect(focus).toMatch(/createPortal\(barContent, headerTarget\)/);
    expect(focus).toMatch(/:\s*<>\{backButton\}\{bandLine\}<\/>/);
  });
  it('is handed the tab you opened the thread from by the app', () => {
    expect(app).toMatch(/crumbFrom=\{/);
    expect(app).toMatch(/INBOX_TABS\.find/);
  });
  it('draws the bar thin while the crumb is in it, and in the app\'s mono capitals', () => {
    expect(css).toMatch(/\.workspace-layout\.workspace-task:has\(\.thread-crumb\) > \.topbar \{[^}]*height: 56px/);
    const crumb = css.match(/\.workspace-task-header > \.back-esc\.thread-crumb \{([^}]*)\}/)[1];
    expect(crumb).toMatch(/text-transform: uppercase/);
    expect(crumb).toMatch(/var\(--mono\)/);
    expect(crumb).toMatch(/white-space: nowrap/);
  });
  it('dims where you came from and lifts the name a step', () => {
    expect(css).toMatch(/\.thread-crumb-name \{[^}]*color: var\(--text-dim\)/);
  });
});
