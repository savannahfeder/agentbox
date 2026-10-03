// A WAITING UPDATE CARD CLOSES UNTIL THE NEXT VERSION (w-23fa810982, 2026-10-02).
//
// The "New version ready" card was up most of the day, because changes land
// several times a day, and it pulled at you to restart. Two answers were tried
// and turned down: one grey line instead of the card, then a card with a
// minus that shrank it to that line ("the '-' there makes the component very
// ugly"). The ask that settled it: "just let people hit 'x' and it disappears.
// Next time they restart it'll update, and eventually another will come at
// next update anyways."
//
// So the card has a × in its top-right corner, shown only when you point at
// it. Pressing it hides the card for THAT version, remembered across restarts;
// a newer version brings the card back. Measured before this change: the card
// carried a shrink button and a shrunk line, and nothing could make it go.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { changeLines, readUpdateClosed, writeUpdateClosed, closedHere, UPDATE_CLOSED_KEY } from '../renderer/src/update-row.ts';

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
const v = (extra = {}) => ({ installing: false, version: 'abc1234', ...extra });

const css = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const decls = (selector) => {
  const out = {};
  css.walkRules((r) => { if (r.selector.split(/,\s*/).includes(selector)) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('the card, before anything is closed', () => {
  it('is the big card above the foot, with Restart on it', () => {
    remember(storage());
    const html = draw({ update: v() });
    expect(html).toMatch(/class="sb-update-card"/);
    expect(html).toContain('New version ready');
    expect(html).toContain('Restarting takes about a minute.');
    expect(html).toContain('>Restart to update</button>');
    expect(html.indexOf('sb-update-card')).toBeLessThan(html.indexOf('aria-label="Settings"'));
  });

  it('carries a × to close it, and nothing to shrink or grow it', () => {
    remember(storage());
    const html = draw({ update: v() });
    expect(html).toMatch(/<button[^>]*class="sb-update-close"[^>]*aria-label="Close"[^>]*title="Hide until the next version"/);
    expect(html).not.toMatch(/sb-update-shrink|sb-update-grow|sb-update-small/);
  });

  it('shows when storage is missing or throws', () => {
    delete globalThis.localStorage;
    expect(draw({ update: v() })).toMatch(/sb-update-card/);
    remember({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    expect(draw({ update: v() })).toMatch(/sb-update-card/);
  });

  it('says why the last try failed, and the press tries again', () => {
    remember(storage());
    const html = draw({ update: v({ error: 'The new code would not build: boom' }) });
    expect(html).toContain('would not build: boom. Pressing it again tries again.');
    expect(html).toContain('>Restart to update</button>');
  });

  it('names what changed when you point at it', () => {
    remember(storage());
    const html = draw({ update: v({ changes: ['The inbox reads faster', 'Fix sign-in'], behind: 4 }) });
    expect(html).toMatch(/class="sb-update-card"[^>]*title="[^"]*The inbox reads faster[^"]*Fix sign-in[^"]*and 2 more/);
  });
});

describe('once closed', () => {
  it('draws nothing for the version that was closed, open or shut', () => {
    remember(storage({ [UPDATE_CLOSED_KEY]: 'abc1234' }));
    expect(draw({ update: v() })).not.toMatch(/sb-update/);
    expect(draw({ update: v(), collapsed: true })).not.toMatch(/sb-update/);
  });

  it('comes back for a newer version', () => {
    remember(storage({ [UPDATE_CLOSED_KEY]: 'abc1234' }));
    expect(draw({ update: v({ version: 'def5678' }) })).toMatch(/sb-update-card/);
  });

  it('is not hidden by a closed version when this one has none', () => {
    remember(storage({ [UPDATE_CLOSED_KEY]: 'abc1234' }));
    expect(draw({ update: v({ version: null }) })).toMatch(/sb-update-card/);
  });

  it('still says Updating while a restart is under way, closed or not', () => {
    remember(storage({ [UPDATE_CLOSED_KEY]: 'abc1234' }));
    const html = draw({ update: v({ installing: true }) });
    expect(html).toMatch(/class="sb-update-card" data-installing="true"/);
    expect(html).toContain('<p>Agentbox restarts by itself in about a minute.</p>');
    expect(html).not.toContain('Restart to update</button>');
  });
});

describe('sidebar shut', () => {
  it('is the restart icon in the foot, with no ×', () => {
    remember(storage());
    const html = draw({ update: v(), collapsed: true });
    expect(html).toMatch(/class="sb-update-row"[^>]*aria-label="Restart to update"/);
    expect(html).not.toMatch(/sb-update-card|sb-update-close/);
  });

  it('draws nothing when there is no update, open or shut', () => {
    remember(storage());
    expect(draw({ update: null })).not.toMatch(/sb-update/);
    expect(draw({ update: null, collapsed: true })).not.toMatch(/sb-update/);
  });
});

describe('what is remembered', () => {
  it('keeps the closed version, and only a real one', () => {
    const s = storage();
    expect(readUpdateClosed(s)).toBe(null);
    writeUpdateClosed(s, 'abc1234');
    expect(s.map.get(UPDATE_CLOSED_KEY)).toBe('abc1234');
    expect(readUpdateClosed(s)).toBe('abc1234');
    writeUpdateClosed(s, '');
    expect(readUpdateClosed(s)).toBe('abc1234');
  });

  it('shrugs off storage that is missing or throws', () => {
    expect(readUpdateClosed(undefined)).toBe(null);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(readUpdateClosed(bad)).toBe(null);
    expect(() => writeUpdateClosed(bad, 'abc1234')).not.toThrow();
  });

  it('closes exactly the version named, never a restart under way', () => {
    expect(closedHere({ installing: false, version: 'abc1234' }, 'abc1234')).toBe(true);
    expect(closedHere({ installing: false, version: 'def5678' }, 'abc1234')).toBe(false);
    expect(closedHere({ installing: false, version: 'abc1234' }, null)).toBe(false);
    expect(closedHere({ installing: true, version: 'abc1234' }, 'abc1234')).toBe(false);
    // A version this app could not name is closed for this run only.
    expect(closedHere({ installing: false, version: null }, '')).toBe(true);
    expect(closedHere({ installing: false, version: null }, 'abc1234')).toBe(false);
  });

  it('is handed the version by the app', () => {
    expect(fs.readFileSync('renderer/src/App.tsx', 'utf8')).toMatch(/version: snap\?\.update\?\.newVersion/);
  });
});

describe('how it looks', () => {
  it('hides the × until you point at the card or Tab to it', () => {
    expect(decls('.workspace-navigation .sb-update-close').opacity).toBe('0');
    expect(decls('.sb-update-card:hover .sb-update-close').opacity).toBe('1');
    expect(decls('.sb-update-card:focus-within .sb-update-close').opacity).toBe('1');
  });

  it('leaves no shrink or grow styles behind', () => {
    expect(fs.readFileSync('renderer/src/threads/pages.css', 'utf8')).not.toMatch(/sb-update-shrink|sb-update-grow|sb-update-small/);
  });

  // The accent on this skin is a red-orange, and a red mark reads as broken.
  it('never draws an update mark in the accent colour', () => {
    for (const sel of ['.sb-update-card-title svg', '.workspace-navigation .sb-update-row', '.workspace-navigation .sb-update-close']) {
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
