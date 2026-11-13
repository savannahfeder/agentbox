// THE LAST THREAD YOU WERE IN IS WASHED IN THE LIST.
//
// What was missing: after leaving a thread for the inbox, "i just want to see
// the one or two recent threads i was in", and the row looked like every other
// row. Asked for: a low-key wash on the most recent one only, running to both
// edges of the list card rather than stopping short of them like the mockup's.
// Measured by reading List.tsx and styles.css: no row knew it was the last one
// you had open.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastThreadAfter, type Stop } from '../renderer/src/back-and-forward';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const inbox: Stop = { at: 'list', view: 'inbox' };
const home: Stop = { at: 'home' };
const thread = (id: string): Stop => ({ at: 'thread', product: 'p', id });
// Every place you stood on, in the order you stood on it, however you got
// there: a click, esc, or the back and forward arrows.
const stoodOn = (...stops: Stop[]) => stops.reduce(lastThreadAfter, null as ReturnType<typeof lastThreadAfter>);

describe('the last thread you were in', () => {
  it('is the thread you just left for the inbox', () => {
    expect(stoodOn(inbox, thread('a'), inbox)).toEqual({ product: 'p', id: 'a' });
  });

  it('is only the most recent one, not the one before it', () => {
    expect(stoodOn(inbox, thread('a'), inbox, thread('b'), home, inbox)).toEqual({ product: 'p', id: 'b' });
  });

  it('is nothing before you have opened a thread', () => {
    expect(stoodOn()).toBeNull();
    expect(stoodOn(home, inbox)).toBeNull();
  });

  // The reported case: the wash sat on an older thread, not the one just left.
  // Back from B lands on the inbox stop that came before B, and the old rule
  // read the trail only up to there, so it found A.
  it('is the thread you left with the back arrow, not one from before it', () => {
    expect(stoodOn(inbox, thread('a'), inbox, thread('b'), inbox)).toEqual({ product: 'p', id: 'b' });
  });

  it('is the thread back or forward took you into', () => {
    expect(stoodOn(inbox, thread('a'), inbox, thread('b'), inbox, thread('a'), inbox)).toEqual({ product: 'p', id: 'a' });
  });

  it('is noted for every place the arrows take you to, not only new visits', () => {
    const hook = read('renderer/src/back-and-forward.ts');
    const settle = hook.slice(hook.indexOf('settledPlaces((s) => {'), hook.indexOf('settledPlaces((s) => {') + 400);
    expect(settle.indexOf('lastThreadAfter')).toBeGreaterThan(-1);
    expect(settle.indexOf('lastThreadAfter')).toBeLessThan(settle.indexOf('return;'));
  });
});

describe('its row', () => {
  it('is marked in the list', () => {
    const list = read('renderer/src/components/List.tsx');
    expect(list).toMatch(/lastThread\?\.id === item\.id && lastThread\.product === item\.product \? ' recent'/);
  });

  it('takes its wash from the whole row, which spans the card edge to edge', () => {
    const css = read('renderer/src/styles.css');
    const rule = css.match(/\.row\.recent\s*\{([^}]*)\}/);
    expect(rule, 'a .row.recent rule').toBeTruthy();
    expect(rule![1]).toMatch(/background/);
    // Margins or an inset are what stopped the mockup's wash short of the
    // card's edges.
    expect(rule![1]).not.toMatch(/margin|inset|left:|right:/);
  });

  it('fades in the light theme in a whisper of the accent, over enough stops to show no steps', () => {
    // Two greys were turned down on white: they read as a dirty slab.
    const css = read('renderer/src/styles.css');
    const light = css.match(/\[data-theme="light"\] \.row\.recent\s*\{([^}]*)\}/);
    expect(light, 'a light-theme rule').toBeTruthy();
    expect(light![1]).toMatch(/rgb\(238 96 24 \/ 0\.0\d+\)/);
    expect(light![1]).not.toMatch(/rgb\(17 25 48|rgb\(0 0 0/);
    expect((light![1].match(/rgb\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  // Reported twice as "too strong/visible/distracting": at 0.055 it read as a
  // grey band across the row on the person's screen.
  it('is faint on dark, at most 0.02 of white, fading out by the middle of the row', () => {
    const css = read('renderer/src/styles.css');
    const rule = css.match(/\.row\.recent\s*\{([^}]*)\}/)![1];
    const alphas = [...rule.matchAll(/\/ (0\.\d+)\)/g)].map((m) => Number(m[1]));
    expect(alphas.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.02);
    expect(rule).toMatch(/transparent 70%\)/);
  });

  it('has the hairlines above and below it run to the card edge with the wash', () => {
    // With the usual inset hairlines, the wash's top and bottom showed past
    // the lines' ends at the card's left edge.
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/\.row\.recent::after,\s*\.row\.recent \+ \.row::after\s*\{\s*left:\s*0;\s*\}/);
  });

  it('shows wherever the arrows do', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/lastThread=\{backForwardOn \? trail\.lastThread : null\}/);
  });
});
