// STANDUP DAYS AND THE FEEDBACK CLOSE HOVER LIKE EVERY BUTTON (w-f702d60afe, 2026-11-21).
//
// A polish review hovered about 150 controls: header buttons take a wash on
// hover, but the Standup days and the feedback card's close only changed text
// colour, so they read as text rather than buttons.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the hover wash', () => {
  it('reaches a Standup day that is not the picked one', () => {
    expect(css('team/standup.css')).toContain('.su-day:hover:not(:disabled, .on) { background: var(--wash); }');
  });
  it('reaches the feedback card\'s close, which is rounded for it', () => {
    const fb = css('components/feedback-card.css');
    expect(fb).toContain('.fb-close:hover { color: var(--text); background: var(--wash); }');
    expect(fb).toMatch(/\.fb-close \{[^}]*border-radius: var\(--radius\)/);
  });
});
