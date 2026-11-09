// THE THIRD ROUND OF PHONE NOTES (2026-10-11). On the drawn phone, "View and
// filters" took most of an 852px screen, in --bg-raised (#2f2d2c) over a
// list dimmed by a 100vmax shadow, with the picked choice a white block: "filters
// still look wack/ugly/now huge and have a different color bg than everything
// else". Send was an orange box 12px from the screen's right edge ("touching the
// top corner of the app"), and beside a grey "Cancel" its weight pulled "New
// thread" off the middle ("doesn't feel centered"). The pickers' sheet had 16px
// top corners; "square pickers wins for sure". The To row also drew two lines
// under it, the desktop's divider and the phone's own.
//
// Measured by reading renderer/src/phone.css, and on the drawn phone
// (an iPhone-sized headless page): the panel is now 353px, the page colour,
// with nothing dimmed behind it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
/** The declarations of every rule whose selector list ends in `piece`, last rule last. */
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
/** The last value a property is given across those rules, as the cascade would leave it. */
const last = (piece, prop) => {
  const all = [...bodiesFor(piece).matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe('on a phone, View and filters', () => {
  it('is the page\'s own colour, not the raised grey or the menu grey', () => {
    const bg = last('.th-pop', 'background');
    expect(bg).toMatch(/var\(--bg\)/);
    expect(bg).not.toMatch(/--bg-raised|--pop/);
  });

  it('dims nothing behind it', () => {
    expect(last('.th-pop', 'box-shadow')).not.toMatch(/100vmax/);
  });

  it('puts each section\'s name beside its choices, which wrap rather than run off the edge', () => {
    expect(last('.th-pop .line', 'flex-direction')).toBe('row');
    expect(last('.th-pop .opts', 'flex-wrap')).toBe('wrap');
  });

  it('draws its choices as plain words, the picked one underlined in the accent like the inboxes', () => {
    const button = bodiesFor('.th-pop .opts button');
    expect(last('.th-pop .opts button', 'border')).toBe('0');
    expect(last('.th-pop .opts button', 'background')).toBe('none');
    expect(Number.parseInt(last('.th-pop .opts button', 'height'), 10)).toBeLessThanOrEqual(34);
    expect(button).toBeTruthy();
    expect(last('.th-pop .opts button.on', 'text-decoration-color')).toBe('var(--accent)');
    // The white block it was.
    expect(last('.th-pop .opts button.on', 'background')).not.toMatch(/var\(--text\)/);
  });
});

// THE FOURTH ROUND (2026-10-11): "I would recommend the title-left approach
// with square pickers", and "the attached file or picture is touching the
// divider". Measured on the drawn phone with an iPhone's 34px home-bar inset:
// the attach row was 52px tall with that 34px inside it as padding, which
// left its words 18px of room hard under the line. The same inset sat under
// the inboxes along the bottom in full, below an underline drawn at the foot
// of a 52px bar ("some extra padding at the bottom").
describe('on a phone, a new thread', () => {
  it('has its name at the left, as Threads has, after a cross to close it', () => {
    const name = bodiesFor('.tc-veil > .tc-card::before');
    expect(name).toMatch(/content:\s*'New thread'/);
    expect(name).not.toMatch(/justify-content:\s*center/);
    expect(last('.tc-veil > .tc-card::before', 'font-size')).toBe('19px');
    const cross = bodiesFor('.tc-veil::before');
    expect(cross).toMatch(/mask:/);
    expect(cross).not.toMatch(/content:\s*'Cancel'/);
  });

  it('closes only from the cross: the name is on the page, not on the backdrop that closes it', () => {
    // The backdrop's click closes the page; anything drawn on it closes it too.
    expect(bodiesFor('.tc-veil::after')).toMatch(/content:\s*none/);
    // From the top of the screen (and, with the keyboard up, of what shows).
    expect(last('.tc-veil > .tc-card', 'top')).toBe('calc(env(safe-area-inset-top, 0px) + var(--vvtop, 0px))');
    // The cross is drawn over the page, or the page would hide it.
    expect(Number(last('.tc-veil::before', 'z-index'))).toBeGreaterThan(0);
  });

  it('keeps Send a square orange box, in off the edge and below the status bar', () => {
    expect(last('.tc-card .tc-send > button', 'background')).toBeUndefined();
    expect(last('.tc-card .tc-send', 'top')).toMatch(/safe-area-inset-top/);
    const right = last('.tc-card .tc-send', 'right');
    expect(Number.parseInt(right.match(/calc\((\d+)px/)[1], 10)).toBeGreaterThanOrEqual(16);
    expect(last('.tc-card .tc-send-main', 'height')).toBe('32px');
  });

  it('gives the attach row its full height above the home bar, not the home bar inside it', () => {
    expect(last('.tc-card > .tc-bar > .tc-icon', 'height')).toMatch(/calc\(52px \+ var\(--phone-foot/);
    expect(last('.tc-card > .tc-bar > .tc-icon', 'padding')).toMatch(/var\(--phone-foot/);
  });

  it('draws one line between its rows, not the desktop\'s divider as well', () => {
    expect(last('.tc-card > .tc-head', 'border-bottom')).toBe('0');
    expect(last('.tc-card .tc-field + .tc-field', 'border-top')).toBe('0');
  });

  it('opens its pickers as square sheets', () => {
    expect(last('.tc-menu', 'border-radius')).toBe('0');
  });
});

// The inboxes moved from the foot to under the title on 2026-10-28; what they
// look like there is the-web-app-on-a-phone-matches-the-phone-apps-text-and-tabs.
describe('on a phone, the foot of the screen', () => {
  // All of the inset since 2026-10-28, as the phone app keeps it: the inset
  // less 14px was "super duper low" beside it.
  it('keeps the home bar\'s inset, never less than a little', () => {
    const foot = bodiesFor(':root').match(/--phone-foot:\s*([^;]+)/);
    expect(foot?.[1]).toMatch(/max\(\s*\d+px,\s*env\(safe-area-inset-bottom, 0px\)\s*\)/);
  });

  it('and everything that floats there uses that inset', () => {
    for (const piece of ['.topbar .th-new', '.approvals', '#phone-alerts-ask']) {
      expect(last(piece, 'bottom')).toMatch(/var\(--phone-foot\)/);
    }
  });

  // The toast left the foot on 2026-10-13: it sat on the reply box and the
  // tabs ("keeps blocking real components I want to touch"). It hangs under
  // the top bar instead.
  it('and the toast hangs under the top bar, clear of all of them', () => {
    expect(last('.toast', 'top')).toMatch(/var\(--phone-top, 56px\)/);
    expect(last('.toast', 'bottom')).toBe('auto');
  });
});
