// ⌘F FINDS WORDS ON THE SCREEN, IN A CHAT AND EVERYWHERE ELSE.
//
// w-cc5bc203d0: Command-F did nothing inside an agent chat, so there was no way
// to find a sent message, and it is expected to work on every other page too.
//
// Measured on main at 47b470d7 before anything was touched: no menu item, no
// accelerator, no `findInPage`, no before-input-event branch and no renderer
// handler anywhere mentioned F. The key did nothing on every screen in the
// app, not only in a chat.
//
// The matching is executed for real below. The wiring between main, preload
// and the page is asserted against source, for the same reason the zoom test
// does it: this suite cannot boot the main process.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMatches, matchesAcrossRuns, stepIndex, countLabel } from '../renderer/src/find-in-page';
import { SHORTCUTS } from '../renderer/src/shortcuts';

const here = path.dirname(fileURLToPath(import.meta.url));
// A file that is not there reads as empty, so a missing piece fails its own
// test by name rather than taking the whole file down with it.
const read = (...p) => {
  const file = path.join(here, '..', ...p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

describe('what counts as a match', () => {
  it('finds the words she typed, whatever their case', () => {
    expect(findMatches('Merge it. merge IT later.', 'merge it')).toEqual([[0, 8], [10, 18]]);
  });

  // A message she dictated is wrapped by the markdown renderer into text with
  // hard line breaks and double spaces that the screen draws as single spaces.
  // What she sees is one space, so one space in the box has to find it.
  it('finds a phrase across a line break or a double space the screen does not draw', () => {
    expect(findMatches('the landing\npage is  live', 'landing page is live')).toEqual([[4, 25]]);
  });

  // She types a plain apostrophe; the agents write curly ones. Both are the
  // same letter to her.
  it('treats a curly apostrophe and quote as the plain ones she types', () => {
    expect(findMatches('it doesn’t work', "doesn't")).toEqual([[3, 10]]);
    expect(findMatches('she said “ship it”', '"ship it"')).toEqual([[9, 18]]);
  });

  it('finds nothing for an empty box or only spaces', () => {
    expect(findMatches('anything at all', '')).toEqual([]);
    expect(findMatches('anything at all', '   ')).toEqual([]);
  });

  it('finds nothing when the words are not there', () => {
    expect(findMatches('the sidebar is done', 'inbox')).toEqual([]);
  });

  // Characters that mean something to a pattern are just characters to her.
  it('takes brackets, dots and stars literally', () => {
    expect(findMatches('a (b) c.d *e*', '(b)')).toEqual([[2, 5]]);
    expect(findMatches('a (b) c.d *e*', 'c.d')).toEqual([[6, 9]]);
    expect(findMatches('cxd', 'c.d')).toEqual([]);
    expect(findMatches('a *e*', '*e*')).toEqual([[2, 5]]);
  });

  it('never counts the same letters twice', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([[0, 2], [2, 4]]);
  });
});

describe('a match that crosses the pieces the screen is built from', () => {
  // "ship **it** now" is three pieces of text on the page. She reads one line.
  it('finds a phrase that runs through bold or a link in the same paragraph', () => {
    const runs = [
      { text: 'ship ', block: 1 },
      { text: 'it', block: 1 },
      { text: ' now', block: 1 },
    ];
    expect(matchesAcrossRuns(runs, 'ship it now')).toEqual([
      { startRun: 0, startOffset: 0, endRun: 2, endOffset: 4 },
    ]);
  });

  // Two messages one above the other are not one sentence. "done" at the end
  // of one and "next" at the start of the other must not read as "donenext".
  it('does not join the end of one message to the start of the next', () => {
    const runs = [
      { text: 'all done', block: 1 },
      { text: 'next step', block: 2 },
    ];
    expect(matchesAcrossRuns(runs, 'donenext')).toEqual([]);
    expect(matchesAcrossRuns(runs, 'done next')).toEqual([]);
    expect(matchesAcrossRuns(runs, 'next')).toEqual([
      { startRun: 1, startOffset: 0, endRun: 1, endOffset: 4 },
    ]);
  });

  it('ends a match on the right piece when it stops at a piece boundary', () => {
    const runs = [{ text: 'abc', block: 1 }, { text: 'def', block: 1 }];
    expect(matchesAcrossRuns(runs, 'bc')).toEqual([{ startRun: 0, startOffset: 1, endRun: 0, endOffset: 3 }]);
    expect(matchesAcrossRuns(runs, 'de')).toEqual([{ startRun: 1, startOffset: 0, endRun: 1, endOffset: 2 }]);
  });
});

describe('walking the matches', () => {
  it('goes forward and back, and wraps at both ends like a browser', () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
  });

  it('has nowhere to go with no matches', () => {
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it('says where she is in words she can read', () => {
    expect(countLabel(0, 12, 'ship')).toBe('1 of 12');
    expect(countLabel(-1, 0, 'ship')).toBe('No matches');
    expect(countLabel(-1, 0, '')).toBe('');
  });
});

describe('the key reaches the box from anywhere', () => {
  const mainProc = read('main', 'main.mjs');
  const menu = read('main', 'menu.mjs');
  const preload = read('preload.cjs');
  const app = read('renderer', 'src', 'App.tsx');
  const bar = read('renderer', 'src', 'components', 'FindBar.tsx');
  const css = read('renderer', 'src', 'styles.css');

  // The chord is caught below the page, because a key pressed inside an open
  // file or a page in the pane never reaches the app's own window listener.
  it('is caught in the main process ahead of the page, for ⌘F and ⌘G', () => {
    const chords = mainProc.slice(mainProc.indexOf("window.webContents.on('before-input-event'"), mainProc.indexOf('// ---- END OF THE CHORD WIRING ----'));
    expect(chords).toContain("if (key === 'f')");
    expect(chords).toContain('requestFind(0);');
    expect(chords).toContain("if (key === 'g')");
    expect(chords).toContain('requestFind(input.shift ? -1 : 1);');
    expect(menu).toContain("target.send?.('zero:find', { step });");
  });

  it('is on the Edit menu, where a Mac app keeps it', () => {
    expect(menu).toContain("label: 'Find…', accelerator: 'CommandOrControl+F'");
    expect(menu).toContain("label: 'Find Next', accelerator: 'CommandOrControl+G'");
    expect(menu).toContain("label: 'Find Previous', accelerator: 'Shift+CommandOrControl+G'");
  });

  it('crosses the bridge and the bar is on the page', () => {
    expect(preload).toContain("ipcRenderer.on('zero:find', handler)");
    expect(bar).toContain('onFind');
    expect(app).toContain('<FindBar />');
  });

  // The box's own text must never be one of the matches, or typing "ship"
  // finds "ship" in the box and the count is always one too many.
  it('never finds the words inside its own box', () => {
    expect(bar).toContain('data-find-bar');
    expect(bar).toContain("closest('[data-find-bar]')");
  });

  it('paints the matches on every theme', () => {
    expect(css).toContain('::highlight(find-match)');
    expect(css).toContain('::highlight(find-current)');
  });

  // Picked out of four options: the accent, so it follows the app's own accent
  // (the brand orange, since the app went to one light look). The three turned
  // down are in decisions.md; pinned so none comes back by accident. One look,
  // so each token is declared once.
  it('paints them in the accent, declared once in the one look', () => {
    const tokens = css.match(/--find-(match|current|current-ink):[^;]+;/g) ?? [];
    expect(tokens).toHaveLength(3);
    expect(tokens.filter((t) => t === '--find-current: var(--accent);')).toHaveLength(1);
    expect(tokens.filter((t) => t === '--find-match: color-mix(in srgb, var(--accent) 22%, transparent);')).toHaveLength(1);
    expect(css).not.toContain('#ff9632');
  });

  // The shortcuts page is capped at twenty rows (the-shortcuts-page-
  // lists-keys-that-work) and was full on the day this landed, so ⌘F lives on
  // the Edit menu, where every Mac app keeps it. Pinned so nobody "adds the
  // missing key" and crosses the cap without asking first.
  it('stays off the shortcuts page, which is full', () => {
    const caps = SHORTCUTS.flatMap((g) => g.keys).flatMap((k) => k.keys);
    expect(caps).not.toContain('⌘F');
  });
});

// THE BUTTONS HAVE TO TAKE A CLICK. The up, down and X buttons on the find box
// did not respond to clicks.
//
// Measured with REAL OS presses on the real app, window pinned in front
// (scripts/probe-find-buttons-really-click.mjs, 2026-09-27): presses 4, 12,
// 20, 28 and 36 points from the top of the window never reach the page, and
// presses at 44 and below do. The box sat at 10, so its buttons (centred at
// 29) were inside that band and dead. The first fix turned every drag strip
// off while the box was up; the same probe showed the buttons exactly as dead,
// because the band is the title bar `hiddenInset` keeps, not a drag strip.
// A headless browser has no title bar, which is why every earlier check passed.
describe('the box takes a click', () => {
  const css = read('renderer', 'src', 'styles.css');
  const rule = css.match(/\n\.find-bar \{([^}]*)\}/)?.[1] ?? '';
  const top = Number(rule.match(/\btop:\s*(\d+)px/)?.[1]);

  // 44 is the first depth a press was measured to arrive at. The box's own
  // padding puts its buttons a few points under its top edge, so the edge
  // itself is held to that line.
  it('sits below the band at the top of the window that swallows presses', () => {
    expect(top).toBeGreaterThanOrEqual(44);
  });

  // The terminal, New task and Commands buttons sit 54 to 89 points down at the
  // right edge, in the list and in every task layout (measured the same day).
  it('does not cover the buttons in the top right corner', () => {
    expect(top).toBeGreaterThan(89);
  });

  it('does not bring back the drag-strip switch that did not help', () => {
    expect(css).not.toContain('[data-finding]');
  });
});
