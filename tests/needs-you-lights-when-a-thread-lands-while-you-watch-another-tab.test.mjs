// NEEDS YOU LIGHTS WHEN A THREAD LANDS THERE WHILE YOU WATCH ANOTHER TAB.
//
// Reported on w-22da913d00 (2026-10-17): someone watching In Progress did not
// notice when a thread moved into Needs You, because nothing on the Needs You
// tab changed apart from its number. Its count now sits in a quiet orange tint
// until you open Needs You; on Needs You itself nothing changes.
//
// The tint must not move the tabs when it appears, so every count keeps its
// room at rest and lighting only paints it. The count's letter spacing is 0 so
// the digit sits centred: with the tabs' spacing it sat about a pixel left,
// measured off a close-up of the built app.
//
// IT IS A DOT NOW, NOT A TINTED COUNT (power test 3, 2026-10-20). Sending a
// thread moves the page to In progress, and the lit count on the tab left
// behind was the brightest thing on the strip: a tester read NEEDS YOU 8 over
// the one row of the list he was now looking at and logged that eight threads
// had vanished. The orange sits in the gutter instead, where it marks the tab
// without competing with the tab you are on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsYouLit } from '../renderer/src/needs-you.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');
const answered = (id, ts) => ({ id, createdAt: 1, wrote: { result: { ts, source: 'agent' } } });
const made = (id, createdAt) => ({ id, createdAt, wrote: {} });

describe('Needs You lights', () => {
  it('when a thread was answered there after you last looked', () => {
    expect(needsYouLit([answered('a', 500), answered('b', 2_000)], 1_000)).toBe(true);
  });
  it('when a thread with no answer yet was made after you last looked', () => {
    expect(needsYouLit([made('a', 2_000)], 1_000)).toBe(true);
  });
  it('not when everything there arrived before you last looked', () => {
    expect(needsYouLit([answered('a', 500), answered('b', 999)], 1_000)).toBe(false);
  });
  it('not for a thread that arrived the moment you looked', () => {
    expect(needsYouLit([answered('a', 1_000)], 1_000)).toBe(false);
  });
  it('not when Needs You is empty', () => {
    expect(needsYouLit([], 1_000)).toBe(false);
  });
});

describe('the tab draws it', () => {
  const pages = read('threads/Pages.tsx');
  it('as a class on Needs You, only while another tab is open', () => {
    expect(pages).toMatch(/t\.view === 'inbox' && lit && view !== 'inbox' \? ' fresh' : ''/);
  });
  it('from App, which remembers when you last had Needs You open', () => {
    expect(read('App.tsx')).toMatch(/lit=\{needsYouLit\(inbox, needsLookedAt\)\}/);
  });

  const css = read('team/team.css');
  const dot = css.match(/\.tm-tab\.fresh::before \{([^}]*)\}/)?.[1] ?? '';
  it('as a dot in the gutter, which takes no room, so nothing moves when it lights', () => {
    expect(dot).toMatch(/position: absolute/);
    expect(dot).toMatch(/background: var\(--accent\)/);
    expect(css).toMatch(/\.tm-tab\.fresh \{[^}]*position: relative/);
    expect(css).toMatch(/\.tm-tab b \{[^}]*display: inline-block;[^}]*padding: 0 5px;[^}]*letter-spacing: 0;/);
  });
  it('and never on the count, which reads like every other tab\'s', () => {
    expect(css).not.toMatch(/\.tm-tab\.fresh b \{/);
  });
  it('quietly: a square, with no ring and no glow', () => {
    expect(dot).not.toMatch(/box-shadow|border-radius/);
  });
});
