// EVERY RUNNING MARK PULSES ON ONE BEAT.
//
// What she said (2026-10-19), once a cloud run's mark became a pulsing cloud:
// "the rotating animation looks a bit goofy now (the half filled in circle).
// Can you give it the same animation you gave the cloud icons instead? I'd
// like them to all animate in unison." The half-dot of a run on this Mac
// turned (`th-turn`) while the clouds beside it pulsed (`th-breathe`), and
// each CSS animation starts when its row appears, so rows drawn at different
// moments pulsed out of step with each other.
//
// Now both marks pulse with the same animation, and each one's start is
// pinned to the page's clock (`inStep`), so every running mark on the page
// brightens and dims together.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inStep } from '../renderer/src/threads/Pages.tsx';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const rule = (selector) => css.match(new RegExp(`(^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

describe('the two running marks', () => {
  it('the dot on this Mac pulses as the cloud does, and no longer turns', () => {
    const dot = rule('.th-st.live');
    const cloud = rule('.th-st-cloud');
    const anim = (r) => r.match(/animation:\s*([^;]+)/)?.[1].trim();
    expect(anim(dot)).toBeTruthy();
    expect(anim(dot)).toBe(anim(cloud));
    expect(anim(dot)).toMatch(/th-breathe/);
    expect(css).not.toMatch(/th-turn/);
  });

  it('both still stand still for someone who asked for less motion', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.th-st\.live[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.th-st-cloud[^}]*animation:\s*none/);
  });
});

describe('one beat for the whole page', () => {
  it('pins each of a mark\'s animations to the start of the page\'s clock', () => {
    const a = { startTime: 1234.5 };
    const b = { startTime: 98.1 };
    inStep({ getAnimations: () => [a, b] });
    expect(a.startTime).toBe(0);
    expect(b.startTime).toBe(0);
  });

  it('two marks drawn at different moments end up with the same start', () => {
    const early = { startTime: 10 };
    const late = { startTime: 5_010 };
    inStep({ getAnimations: () => [early] });
    inStep({ getAnimations: () => [late] });
    expect(early.startTime).toBe(late.startTime);
  });

  it('asks nothing of an element that is gone, or one with no animation', () => {
    expect(() => inStep(null)).not.toThrow();
    expect(() => inStep({ getAnimations: () => [] })).not.toThrow();
    expect(() => inStep({})).not.toThrow();
  });
});
