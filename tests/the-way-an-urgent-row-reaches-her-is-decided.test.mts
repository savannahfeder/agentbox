// THE OPTION SET IS CLOSED: THE PICK WAS "IT TAKES THE SCREEN".
//
// C was the third of three drawn on
// designs//three-ways-urgent-can-reach-you.html — the urgent row replaces
// what was being read, the sentence that explained itself is gone, and one
// row of chrome is left in its place.
//
// Their copy is in decisions.md under 2026-08-25, which is where a future
// round reads them from.
//
// The rendering half is rendered rather than grepped. The deletion half is
// read out of the source, because "nothing switchable is left" is a claim
// about files, not about one component's output.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackToWhatSheWasReading } from '../renderer/src/components/UrgentBar.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const draw = (props) => renderToStaticMarkup(createElement(BackToWhatSheWasReading, props));

describe('the one row an urgent task leaves on her screen', () => {
  // The word is the half of the old line that was kept, and on this treatment
  // it is the only thing on screen saying why the pane changed.
  it('says the word Urgent', () => {
    const html = draw({ title: 'The theme step', onBack: () => {} });
    expect(html).toContain('Urgent');
    expect(html).toContain('urgent-word');
  });

  // The sentence said "Urgent, so it came to the front. Escape goes back to
  // …" every single time: a metaphor nobody would follow, plus a key named out
  // loud. None of those words may come back.
  it('does not explain itself, name a key, or say "comes to the front"', () => {
    const html = draw({ title: 'The theme step', onBack: () => {} });
    expect(html).not.toMatch(/came to the front|comes to the front/i);
    expect(html).not.toMatch(/Escape/i);
  });

  // The thing she cannot work out by looking is WHICH task she was on, so that
  // is the whole of what the row says, and it is pressable.
  it('names the task she was reading, on a button she can press', () => {
    const html = draw({ title: 'The theme step', onBack: () => {} });
    expect(html).toContain('<button');
    expect(html).toContain('Back to The theme step');
  });

  // Real titles run to eighty characters and this is one row.
  it('cuts a long title on a word rather than mid-word', () => {
    const long = 'The theme step: why the background looks weird, and four fixes you can press';
    const html = draw({ title: long, onBack: () => {} });
    expect(html).toContain('…');
    const shown = html.match(/Back to ([^<]*)/)[1];
    expect(shown.length).toBeLessThan(50);
    // Cut on a space, so no half-word is left standing at the end.
    expect(long.startsWith(shown.replace('…', ''))).toBe(true);
    expect(long[shown.replace('…', '').length]).toBe(' ');
  });

  it('leaves a title that already fits completely alone', () => {
    const html = draw({ title: 'The idle screen', onBack: () => {} });
    expect(html).toContain('Back to The idle screen<');
  });

  // A title with no word break inside the budget used to cut to nothing, back
  // when the cutter took lastIndexOf(' ') of -1 at face value.
  it('still shows something when the title has no early space', () => {
    const html = draw({ title: 'a'.repeat(80), onBack: () => {} });
    const shown = html.match(/Back to ([^<]*)/)[1];
    expect(shown.replace('…', '').length).toBe(44);
  });

  // One row, not two: the way back and the word share a line.
  it('is a single row', () => {
    const html = draw({ title: 'The theme step', onBack: () => {} });
    expect(html.match(/urgent-bar/g)).toHaveLength(1);
  });
});

describe('the two she did not pick are gone, not hidden', () => {
  const sources = [
    'renderer/src/App.tsx',
    'renderer/src/components/Focus.tsx',
    'renderer/src/components/UrgentBar.tsx',
    'renderer/src/styles.css',
  ];

  // The switch the photographing script threw. With it gone there is no way to
  // ask the app for a treatment, which is the point: a flag left in is a
  // decision that has to be made again.
  it('has no treatment switch left anywhere', () => {
    for (const f of sources) {
      expect(read(f), f).not.toContain('__URGENT_TREATMENT__');
      expect(read(f), f).not.toContain('UrgentTreatment');
    }
  });

  it('has deleted the file that held all three', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/components/UrgentArrival.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'scripts/shot-urgent-choices.mjs'))).toBe(false);
  });

  // The card in the middle and the pop-up in the corner. Their rules would
  // still draw if any of this came back by hand.
  it('has no rules left for the card or the corner', () => {
    const css = read('renderer/src/styles.css');
    for (const gone of ['.urgent-card', '.urgent-pop', '.urgent-later', '.urgent-open', '.urgent-x']) {
      expect(css, gone).not.toContain(gone);
    }
  });

  // The sentence that was taken out, and the rule that styled it.
  it('has no sentence at the top of an interrupted task', () => {
    expect(read('renderer/src/components/Focus.tsx')).not.toContain('focus-interrupt');
    expect(read('renderer/src/styles.css')).not.toContain('.focus-interrupt');
  });
});
