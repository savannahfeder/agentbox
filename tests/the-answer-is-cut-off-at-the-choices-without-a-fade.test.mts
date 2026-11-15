// THE ANSWER IS CUT OFF AT THE CHOICES, WITHOUT A FADE (w-65bcefb857).
//
// The founder's screenshot after round eight shipped: the answer faded into a
// white haze above the choices, "takes up more unecessary space. shoudl just
// be cut off abruptly like any component". Read in
// renderer/src/one-thing-at-a-time.css: a 32px mask on the page's scroll.
//
// The same round tried the choices side by side, wrapping only when the next
// did not fit; "That looks pretty bad", so they are a list again
// (tests/the-one-at-a-time-page-leads-with-the-name-and-keeps-the-sent-line-out-of-the-way).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/one-thing-at-a-time.css'), 'utf8');
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('the answer above the choices', () => {
  it('is cut off where the choices start, with no fade', () => {
    expect(css).not.toMatch(/mask-image/);
  });
});

describe('the choices', () => {
  it('are a list again, one under the next', () => {
    expect(rule('.one-choices > .opt-strip')).not.toMatch(/flex-wrap/);
  });
});
