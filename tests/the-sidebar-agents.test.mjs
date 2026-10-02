// THE ACTIVE AGENTS PANEL. Four rounds of drawings and four decisions; what
// survived is small and every part of it was chosen.
//
// The last one is why there is no second colour anywhere below, and why the
// heading is left exactly as it was found.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIL_CUT_MS, onTheRail, railLine } from '../shared/agents.mjs';
import { NAME } from '../shared/product-name.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const markup = rail.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NOW = 1_787_190_000_000;
const session = (over = {}) => ({
  pid: 1, name: 'zero-48', cwd: '/Users/x/dev/zero', startedAt: NOW - 60_000,
  lastActiveAt: NOW - 60_000, startedByZero: false, ...over,
});

/* ------------------------------ what it lists ---------------------------- */
describe('only the sessions the clock can still speak of in hours', () => {
  it('keeps a session that moved inside the day and drops one that did not', () => {
    expect(onTheRail(session({ lastActiveAt: NOW - 3 * 60 * 60 * 1000 }), NOW)).toBe(true);
    expect(onTheRail(session({ lastActiveAt: NOW - 23 * 60 * 60 * 1000 }), NOW)).toBe(true);
    expect(onTheRail(session({ lastActiveAt: NOW - 25 * 60 * 60 * 1000 }), NOW)).toBe(false);
  });

  // The cut is the app's own clock, not a number picked to make a list short.
  // `format.ts` stops saying hours and starts saying `1d` at exactly this, so
  // the panel holds what the clock beside each row can say in hours.
  it('is the day the clock changes its word at', () => {
    expect(RAIL_CUT_MS).toBe(24 * 60 * 60 * 1000);
  });

  // MOST SESSIONS ON A REAL MACHINE WERE THE USER'S OWN TERMINALS sitting at a
  // prompt for days. That, and not finished work, is what made the list far too
  // long: main/agents.mjs already drops
  // any record whose process is gone, so nothing finished is ever here.
  it('drops a session that has never said anything and has sat for a week', () => {
    expect(onTheRail(session({ lastActiveAt: 0, startedAt: NOW - 7 * 24 * 3600_000 }), NOW)).toBe(false);
  });

  // the app's own workers are already rows in the inbox. A second line about the
  // same agent is a duplicate picture, which was rejected.
  it(`never lists a session ${NAME} started itself`, () => {
    expect(onTheRail(session({ startedByZero: true }), NOW)).toBe(false);
  });
});

describe('the row says what the session says', () => {
  it('prefers the session’s own title, falls back to its last word', () => {
    expect(railLine(session({ about: 'Install the commit-message skill' })))
      .toBe('Install the commit-message skill');
    expect(railLine(session({ lastSaid: 'Now the decisions.md record.' })))
      .toBe('Now the decisions.md record.');
  });

  // One real session had started and written nothing readable, and the first
  // draw gave it an empty line. A true sentence beats a blank.
  it('says something true when the session has said nothing', () => {
    expect(railLine(session())).toBe('Has not said anything yet');
  });

  // ONE TRUNCATION, NOT TWO. The row is one line with text-overflow on it, so
  // the width she is looking at does the cutting.
  it('does not cut the sentence itself', () => {
    const long = 'x'.repeat(400);
    expect(railLine(session({ about: long }))).toBe(long);
    expect(bare).toMatch(/\.rail-agent-said\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
});

/* --------------------------- what it looks like -------------------------- */
const f = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function oklch(hex) {
  const [r, g, b] = rgb(hex).map(f);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}
const lum = (hex) => { const [r, g, b] = rgb(hex).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const block = (head) => {
  const i = bare.indexOf(head);
  return bare.slice(i, bare.indexOf('}', i));
};
// The three ink sets, and the pixel each rail actually composites onto. The
// backdrops are read back out of the finished pictures rather than taken from
// the theme's flat --bg, because the lake is a photograph behind a veil:
// designs/2026-08-19-sidebar-agents-round-four/measured.json.
const THEMES = [
  ['light', ':root {', '#fefefe'],
  ['dark', ':root[data-theme="dark"]', '#2e3136'],
  // The Lake was measured here too, until it went with the other pictures
  // (w-9e434e8671).
];
const inkOf = (selector, name, fallback) => {
  const m = block(selector).match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  return m ? m[1] : fallback;
};

const inkSet = (look, selector) => {
  // Lake sets only two of the three, and inherits --text-dim's neighbour from
  // dark, so each theme is read with dark underneath it as the app cascades it.
  const under = look === 'lake' ? ':root[data-theme="dark"]' : selector;
  return {
    dim: inkOf(selector, 'text-dim', inkOf(under, 'text-dim')),
    faint: inkOf(selector, 'text-faint', inkOf(under, 'text-faint')),
    agent: inkOf(selector, 'agent-ink', inkOf(under, 'agent-ink')),
  };
};
// How far along the app's own fade a row's grey has walked. 1 is a whole step,
// the same distance that already separates --text-dim from --text-faint.
const stepFraction = (look, selector) => {
  const k = inkSet(look, selector);
  const a = oklch(k.dim), b = oklch(k.faint), c = oklch(k.agent);
  return (c.L - b.L) / (b.L - a.L);
};

describe('the grey the rows are written in is walked, never chosen', () => {
  for (const [look, selector] of THEMES) {
    const k = inkSet(look, selector);

    // THE ONE RULE UNDER ALL OF THIS. The app already ships one step of fade,
    // from --text-dim to --text-faint. --agent-ink walks that same step again,
    // in the same direction, toward the backdrop. No new distance is invented
    // and no new colour is picked, which is what "never tune a grey by eye"
    // means where it is enforceable.
    //
    // WHAT CHANGED ON 2026-08-20, and why this is a range now rather than a
    // point. Light and lake stayed at a whole step because they read right. Dark
    // stops short of one, at the place the next test pins, so the fraction is
    // still measured rather than chosen.
    it(`${look}: walks the app's own step, and never past the end of it`, () => {
      const n = stepFraction(look, selector);
      expect(n).toBeGreaterThan(0.5);
      expect(n).toBeLessThanOrEqual(1.005);
      if (look !== 'dark') expect(Math.abs(n - 1)).toBeLessThan(0.05);
    });

    it(`${look}: holds the hue and the chroma while it fades`, () => {
      const b = oklch(k.faint), c = oklch(k.agent);
      expect(Math.abs(c.C - b.C)).toBeLessThan(0.006);
      expect(Math.abs(c.h - b.h)).toBeLessThan(3);
    });
  }

  // WHERE DARK'S SHORT STEP COMES FROM: it was matched to the Lake's
  // heading-to-row distance, 1.336 to 1. The Lake is gone (w-9e434e8671), so
  // that number is held directly.
  it('dark leaves its heading by the distance it was matched to', () => {
    const d = inkSet('dark', ':root[data-theme="dark"]');
    expect(Math.abs(ratio(d.faint, d.agent) - 1.336)).toBeLessThan(0.02);
    expect(stepFraction('dark', ':root[data-theme="dark"]')).toBeLessThan(1);
  });
});

describe('the heading leads, which is the whole of what she asked for', () => {
  // The reason was that the heading and a faded row were LITERALLY the same
  // colour, 1.00 to 1. The chosen fix, option 3: leave the heading alone and
  // drop the rows out of its way.
  for (const [look, selector, page] of THEMES) {
    const under = look === 'lake' ? ':root[data-theme="dark"]' : selector;
    const faint = inkOf(selector, 'text-faint', inkOf(under, 'text-faint'));
    const agent = inkOf(selector, 'agent-ink', inkOf(under, 'agent-ink'));

    it(`${look}: the heading is stronger against the page than a row is`, () => {
      expect(ratio(faint, page)).toBeGreaterThan(ratio(agent, page));
      expect(ratio(faint, agent)).toBeGreaterThan(1.3);
    });

    // THE FLOOR, AND IT IS THE ONE NUMBER WORTH GUARDING. Measured on the three
    // themes: 2.73 light, 3.57 dark, 4.40 lake. Light is the thin one: a third
    // step down lands at 1.73, which was drawn and judged unreadable. This
    // stops a later session taking that step.
    it(`${look}: a row is still readable against the page`, () => {
      expect(ratio(agent, page)).toBeGreaterThan(2.6);
    });
  }

  // Bold capitals came out of this panel on 2026-08-13. Every option drawn
  // after that kept the label's size and weight exactly as found.
  it('never makes the label bigger, bolder or capitalised', () => {
    const r = block('.rail-section-label');
    expect(r).toMatch(/text-transform:\s*none/);
    expect(r).toMatch(/color:\s*var\(--text-faint\)/);
    expect(Number(r.match(/font-weight:\s*(\d+)/)[1])).toBeLessThan(700);
    expect(Number(r.match(/font-size:\s*([\d.]+)px/)[1])).toBeLessThanOrEqual(12.5);
  });
});

describe('what she took out stays out', () => {
  // NO FADE.So exactly one colour is spoken in this section's rows, at rest.
  it('writes every row in one ink, with no second colour under it', () => {
    const rules = [...bare.matchAll(/\n(\.rail-agent[a-z-]*)([^{]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    const colours = new Set();
    for (const [, , sel, body] of rules) {
      const c = body.match(/(?:^|[;\s])color:\s*([^;]+)/);
      if (c && !sel.includes(':hover')) colours.add(c[1].trim());
    }
    expect([...colours]).toEqual(['var(--agent-ink)']);
    expect(bare).not.toMatch(/\.rail-agent[^{]*\{[^}]*opacity/);
  });

  // Ten ways of marking a live row were drawn and all ten were taken off:
  // no dot, no bar, no ring, no wash, no edge, no colour, no halo, no word.
  it('draws no mark, no count and nothing that moves', () => {
    expect(markup).not.toMatch(/rail-agent-dot|agent-mark|\bdot\b/i);
    expect(markup).not.toMatch(/more<|\+\{|length -/);
    const rules = bare.match(/\n\.rail-agent[^{]*\{[^}]*\}/g).join('\n');
    expect(rules).not.toMatch(/border-radius|animation|transition|background:\s*var\(--accent\)/);
    expect(rules).not.toMatch(/text-decoration:\s*underline/);
  });

  // — and there is no page to expand, ever. The click opens that row's own
  // card, which since is a task's card as often as a session's; the row
  // carries the way to open it, so this stays one button and one destination
  // either way.
  it('is a button per row and not a door to a screen', () => {
    expect(markup).toMatch(/<button[^>]*className="rail-agent"/);
    expect(markup).toMatch(/onClick=\{r\.open\}/);
    expect(markup).not.toMatch(/see everything|setModal|Your agents/);
  });
});
