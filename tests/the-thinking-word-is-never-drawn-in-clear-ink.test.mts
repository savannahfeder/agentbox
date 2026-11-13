// THE THINKING WORD IS NEVER DRAWN IN CLEAR INK.
//
// What broke (the founder's iPhone, the web app in Safari, 2026-10-26): under a
// message the live line read as the dots, an empty gap, then "just now >". The
// word ("Thinking", or the step the agent is on) was set in transparent ink
// with a gradient clipped to its letters to draw the shimmer, so wherever the
// browser did not paint that clipped gradient, nothing drew the word at all.
// Now the letters keep solid ink and the shimmer is a moving mask over them:
// a browser that draws no mask still draws the word.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const rules = (sel) => [...css.matchAll(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);

describe('the shimmering live word', () => {
  it('keeps solid ink', () => {
    const body = rules('.live-word.is-shimmering').join('\n');
    expect(body).not.toMatch(/color:\s*transparent/);
    expect(body).not.toMatch(/text-fill-color:\s*transparent/);
    expect(body).not.toMatch(/background-clip:\s*text/);
    expect(body).toMatch(/(^|[^-])color:\s*var\(--text\)/);
  });

  it('shimmers with a moving mask, in both spellings Safari and the rest read', () => {
    const body = rules('.live-word.is-shimmering')[0];
    expect(body).toMatch(/-webkit-mask-image:\s*linear-gradient/);
    expect(body).toMatch(/[^-]mask-image:\s*linear-gradient/);
    expect(body).toMatch(/animation:\s*live-shimmer/);
    const frames = /@keyframes live-shimmer\s*\{([^@]*?)\}\s*\}/.exec(css)?.[1] ?? '';
    expect(frames).toMatch(/-webkit-mask-position/);
    expect(frames).toMatch(/[^-]mask-position/);
  });

  it('stands still, in dim ink with no mask, for someone who asked for less motion', () => {
    const still = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.live-word\.is-shimmering\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(still).toMatch(/animation:\s*none/);
    expect(still).toMatch(/mask-image:\s*none/);
    expect(still).toMatch(/color:\s*var\(--text-dim\)/);
  });
});
