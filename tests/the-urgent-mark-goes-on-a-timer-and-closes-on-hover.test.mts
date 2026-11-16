// THE URGENT MARK GOES ON A TIMER AND CLOSES ON HOVER (w-a87a660f55).
//
// "this urgent task stays at the top of my screen but it should disappear on a
// timer and i should be able to close it on hover too". The mark in the top bar
// stayed until its thread was opened or left: it had no clock and no close
// (UrgentReady rendered one button, and urgentShown kept it while the row
// waited). Measured by reading the component and photographing the sample app
// with &arrives. Now it fades out after URGENT_SHOWN_MS, the clock stops while
// the pointer is on it, and hovering shows a close in place of the O key.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UrgentReady, URGENT_SHOWN_MS } from '../renderer/src/components/UrgentReady.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`^${sel.replace(/[.:]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

const row = { id: 'w-urgent', product: 'agentbox', status: 'open', kind: 'directive', title: 'Sign-in is down', priority: 9, createdAt: 0, updatedAt: 0 } as never;
const html = renderToStaticMarkup(createElement(UrgentReady, { row, onOpen: () => {}, onClose: () => {} }));

describe('the timer', () => {
  it('runs long enough to notice and not for ever', () => {
    expect(URGENT_SHOWN_MS).toBeGreaterThanOrEqual(10_000);
    expect(URGENT_SHOWN_MS).toBeLessThanOrEqual(60_000);
  });

  it('is an animation on the mark, set to that length', () => {
    expect(html).toContain(`animation-duration:${URGENT_SHOWN_MS}ms`);
    expect(rule('.ur')).toMatch(/animation: ur-goes linear forwards/);
  });

  it('stops while the pointer is on the mark', () => {
    expect(rule('.ur:hover')).toMatch(/animation-play-state: paused/);
  });

  // The dot blinks three times as it arrives; that animation ending must not
  // close the mark.
  it('closes only when its own animation ends, not the dot’s', () => {
    const src = fs.readFileSync(path.join(root, 'renderer/src/components/UrgentReady.tsx'), 'utf8');
    expect(src).toMatch(/animationName === 'ur-goes'/);
  });
});

describe('the close', () => {
  it('is a second button beside the one that opens', () => {
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*class="ur-close"[^>]*aria-label="Close"/);
  });

  it('shows only on hover, where the O key was', () => {
    expect(rule('.ur-close')).toMatch(/display: none/);
    expect(rule('.ur:hover .ur-close')).toMatch(/display: grid/);
    expect(rule('.ur:hover .ur-kbd')).toMatch(/display: none/);
  });

  it('is not shown with the pointer away, so the O key still says how to open it', () => {
    expect(rule('.ur-kbd')).not.toMatch(/display: none/);
    expect(html).toContain('>O</kbd>');
  });

  it('puts the mark away in the app, and the same thread is not raised again', () => {
    expect(app).toMatch(/<UrgentReady row=\{urgentShownRow\} onOpen=\{openUrgentReady\} onClose=\{\(\) => setUrgentReady\(null\)\} \/>/);
    expect(app).toMatch(/announcedUrgent\.current\.add\(urgent\.id\)/);
  });
});
