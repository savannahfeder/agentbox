// A WAITING UPDATE IS A CARD YOU CAN SHRINK TO ONE LINE (w-23fa810982, 2026-10-02).
//
// The update was a bordered card ("New version ready", a sentence, a
// full-width button). Changes land several times a day, so it was up most of
// the day and pulled at you to restart. The first answer replaced the card
// with one grey line beside Settings; shown the pictures, the ask was: "we
// still want the big sign, but we wanted it to be condensable to be chiller",
// with "a little way to minimize/x on hover to get to that state".
//
// So the card is back as the default, and a small button that shows on hover
// shrinks it to the grey line. The choice is remembered, so a version landing
// an hour later does not put the card back up, and the line has a matching
// button to bring the card back. Measured before this change: with an update
// waiting, the open sidebar drew the line and no card, whatever was stored.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { changeLines, readUpdateSmall, writeUpdateSmall, UPDATE_SMALL_KEY } from '../renderer/src/update-row.ts';

/** A stand-in for the window's localStorage, which node does not have. */
function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    map,
  };
}

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});
const remember = (store) => Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });

const draw = (props) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {},
  onUpdate() {},
  ...props,
}));

const css = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const decls = (selector) => {
  const out = {};
  css.walkRules((r) => { if (r.selector.split(/,\s*/).includes(selector)) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('the big card is the default', () => {
  it('draws the card when nothing is remembered', () => {
    remember(storage());
    const html = draw({ update: { installing: false } });
    expect(html).toMatch(/class="sb-update-card"/);
    expect(html).toContain('New version ready');
    expect(html).toContain('Restarting takes about a minute.');
    expect(html).toContain('>Restart to update</button>');
    expect(html).not.toMatch(/sb-update-row/);
    expect(html.indexOf('sb-update-card')).toBeLessThan(html.indexOf('aria-label="Settings"'));
  });

  it('carries a small button to shrink it, and no button to grow it', () => {
    remember(storage());
    const html = draw({ update: { installing: false } });
    expect(html).toMatch(/<button[^>]*class="sb-update-shrink"[^>]*aria-label="Shrink to one line"/);
    expect(html).not.toMatch(/sb-update-grow/);
  });

  it('draws the card when storage is missing or throws', () => {
    delete globalThis.localStorage;
    expect(draw({ update: { installing: false } })).toMatch(/sb-update-card/);
    remember({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    expect(draw({ update: { installing: false } })).toMatch(/sb-update-card/);
  });

  it('draws the card for any stored value but the one that means small', () => {
    for (const v of ['0', '', 'yes', 'true']) {
      remember(storage({ [UPDATE_SMALL_KEY]: v }));
      expect(draw({ update: { installing: false } }), v).toMatch(/sb-update-card/);
    }
  });

  it('says Updating, and restarts by itself, with no second press', () => {
    remember(storage());
    const html = draw({ update: { installing: true } });
    expect(html).toMatch(/class="sb-update-card" data-installing="true"/);
    expect(html).toContain('<span>Updating</span>');
    expect(html).toContain('<p>Agentbox restarts by itself in about a minute.</p>');
    expect(html).not.toContain('Restart to update</button>');
  });

  it('says why the last try failed, and the press tries again', () => {
    remember(storage());
    const html = draw({ update: { installing: false, error: 'The new code would not build: boom' } });
    expect(html).toContain('would not build: boom. Pressing it again tries again.');
    expect(html).toContain('>Restart to update</button>');
  });

  it('names what changed when you point at it', () => {
    remember(storage());
    const html = draw({ update: { installing: false, changes: ['The inbox reads faster', 'Fix sign-in'], behind: 4 } });
    expect(html).toMatch(/class="sb-update-card"[^>]*title="[^"]*The inbox reads faster[^"]*Fix sign-in[^"]*and 2 more/);
  });
});

describe('shrunk, it is one quiet line', () => {
  const small = () => remember(storage({ [UPDATE_SMALL_KEY]: '1' }));

  it('draws the line in the foot list and no card', () => {
    small();
    const html = draw({ update: { installing: false }, onInstructions() {} });
    expect(html).not.toMatch(/sb-update-card/);
    expect(html).not.toContain('New version ready');
    const row = html.indexOf('class="sb-update-row"');
    expect(row).toBeGreaterThan(html.indexOf('th-side-foot'));
    expect(row).toBeLessThan(html.indexOf('aria-label="Settings"'));
    expect(html).toContain('<span>Restart to update</span>');
  });

  it('carries a small button to bring the card back, and none to shrink it', () => {
    small();
    const html = draw({ update: { installing: false } });
    expect(html).toMatch(/<button[^>]*class="sb-update-grow"[^>]*aria-label="Show the full card"/);
    expect(html).not.toMatch(/sb-update-shrink/);
  });

  it('keeps what the card said for when you point at it', () => {
    small();
    const html = draw({ update: { installing: false, changes: ['The inbox reads faster'], behind: 3 } });
    expect(html).toMatch(/class="sb-update-row"[^>]*title="[^"]*about a minute[^"]*The inbox reads faster[^"]*and 2 more/);
  });

  it('says Updating and cannot be pressed twice while it rebuilds', () => {
    small();
    const html = draw({ update: { installing: true } });
    expect(html).toMatch(/<button[^>]*class="sb-update-row"[^>]*disabled=""/);
    expect(html).toContain('<span>Updating</span>');
  });
});

describe('sidebar shut', () => {
  it('is the line as an icon, card or not, with neither small button', () => {
    for (const store of [storage(), storage({ [UPDATE_SMALL_KEY]: '1' })]) {
      remember(store);
      const html = draw({ update: { installing: false }, collapsed: true });
      expect(html).toMatch(/class="sb-update-row"[^>]*aria-label="Restart to update"/);
      expect(html).not.toMatch(/sb-update-card|sb-update-shrink|sb-update-grow/);
    }
  });

  it('draws nothing when there is no update, open or shut', () => {
    remember(storage());
    expect(draw({ update: null })).not.toMatch(/sb-update/);
    expect(draw({ update: null, collapsed: true })).not.toMatch(/sb-update/);
  });
});

describe('the choice is remembered', () => {
  it('reads small only from the one value it writes', () => {
    const s = storage();
    expect(readUpdateSmall(s)).toBe(false);
    writeUpdateSmall(s, true);
    expect(s.map.get(UPDATE_SMALL_KEY)).toBe('1');
    expect(readUpdateSmall(s)).toBe(true);
    writeUpdateSmall(s, false);
    expect(s.map.has(UPDATE_SMALL_KEY)).toBe(false);
    expect(readUpdateSmall(s)).toBe(false);
  });

  it('shrugs off storage that is missing or throws', () => {
    expect(readUpdateSmall(undefined)).toBe(false);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(readUpdateSmall(bad)).toBe(false);
    expect(() => writeUpdateSmall(bad, true)).not.toThrow();
  });
});

describe('how it looks', () => {
  it('hides the shrink button until you point at the card', () => {
    expect(decls('.workspace-navigation .sb-update-shrink').opacity).toBe('0');
    expect(decls('.sb-update-card:hover .sb-update-shrink').opacity).toBe('1');
    expect(decls('.sb-update-card:focus-within .sb-update-shrink').opacity).toBe('1');
  });

  it('hides the grow button until you point at the line', () => {
    expect(decls('.workspace-navigation .sb-update-grow').opacity).toBe('0');
    expect(decls('.sb-update-small:hover .sb-update-grow').opacity).toBe('1');
  });

  it('keeps the line borderless and grey', () => {
    const row = decls('.workspace-navigation .sb-update-row');
    expect(row.border ?? 'none').toMatch(/none|0/);
    expect(row.color).toBe('var(--text-faint)');
  });

  // The accent on this skin is a red-orange, and a red mark reads as broken.
  it('never draws an update icon in the accent colour', () => {
    for (const sel of ['.sb-update-card-title svg', '.workspace-navigation .sb-update-row', '.workspace-navigation .sb-update-shrink', '.workspace-navigation .sb-update-grow']) {
      const color = decls(sel).color;
      expect(color, sel).toBeTruthy();
      expect(color, sel).not.toMatch(/accent/);
    }
  });
});

describe('the list of what changed', () => {
  it('lists up to the titles it has and counts the rest', () => {
    expect(changeLines({ changes: ['a', 'b'], behind: 2 })).toEqual(['a', 'b']);
    expect(changeLines({ changes: ['a', 'b'], behind: 9 })).toEqual(['a', 'b', 'and 7 more']);
  });

  it('says nothing for an installed app, which has no titles', () => {
    expect(changeLines({ changes: [], behind: null })).toEqual([]);
    expect(changeLines(null)).toEqual([]);
  });
});
