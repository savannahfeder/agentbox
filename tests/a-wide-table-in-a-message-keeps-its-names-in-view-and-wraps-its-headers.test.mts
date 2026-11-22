// A WIDE TABLE IN A MESSAGE KEEPS ITS NAMES IN VIEW AND WRAPS ITS HEADERS.
//
// "They are so expanded that it's almost impossible to read them. I can't match
// the first line to the rows below it" (2026-11-07). A five-column leaderboard
// of transcription models, drawn in a message: every header sat on one line and
// set its column's width, so a column holding "2.3%" was 329px wide for the
// words "On people talking to an assistant", and the table ran to 1271px in a
// 716px column. Scrolled sideways, the model names went off the left edge and
// no row said whose it was. Measured by drawing that table with the real
// component in a 780px message, dark, before and after.
//
// The fix: in a message the first column stays put while the rest scrolls, as
// it already did beside the message and full screen, and a long header wraps
// over two lines rather than widening its column.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { tableFromGrid } from '../renderer/src/table-file.ts';
import { columnWidths } from '../renderer/src/components/TableView.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/components/table-view.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const declarationsFor = (selector) => {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
};

const LEADERBOARD = tableFromGrid([
  ['Model', 'Words wrong, overall', 'On people talking to an assistant', 'On earnings calls', 'Price per hour of dictation'],
  ["Apple's model (today)", 'not on the board', '–', '14.0% (Argmax test)', 'free'],
  ['Microsoft MAI-Transcribe-2', '2.5%', '2.3%', '3.9%', '$0.54 (starter price to Dec 31)'],
  ['Meta Muse Voice Transcribe', '3.1%', '2.7%', '4.3%', '$0.18'],
]);
const width = (table, name, wrap) => columnWidths(table, 300, undefined, wrap).px.get(name);

describe('a long header in a message wraps instead of widening its column', () => {
  it('keeps a column of short numbers narrow under a long header', () => {
    expect(width(LEADERBOARD, 'On people talking to an assistant', true)).toBeLessThanOrEqual(200);
    expect(width(LEADERBOARD, 'On people talking to an assistant', false)).toBeGreaterThan(300);
  });

  it('takes no more than two lines for a header of five words or so', () => {
    const w = width(LEADERBOARD, 'On people talking to an assistant', true);
    const perLine = Math.floor((w - 48) / 7.6);
    expect(perLine).toBeGreaterThanOrEqual('On people talking'.length);
  });

  it('leaves a short header on one line', () => {
    const t = tableFromGrid([['Check', 'Cost', 'Words wrong, overall'], ['Cold start', '$0', '2.5%']]);
    for (const name of ['Cost', 'Words wrong, overall'.slice(0, 18)]) {
      const own = tableFromGrid([['Check', name], ['Cold start', '$0']]);
      expect(width(own, name, true)).toBeGreaterThanOrEqual(name.length * 7.6 + 32);
    }
    expect(width(t, 'Words wrong, overall', true)).toBeLessThan(width(t, 'Words wrong, overall', false));
  });

  it('never breaks a word: the longest one still fits on a line', () => {
    const t = tableFromGrid([['Name', 'Transcriptionthroughput'], ['A', '1']]);
    expect(width(t, 'Transcriptionthroughput', true)).toBeGreaterThanOrEqual('Transcriptionthroughput'.length * 7.6 + 32);
  });

  it('lets wide words in the cells set the width, as before', () => {
    expect(width(LEADERBOARD, 'Model', true)).toBe(width(LEADERBOARD, 'Model', false));
    expect(width(LEADERBOARD, 'Price per hour of dictation', true)).toBeGreaterThanOrEqual('$0.54 (starter price to Dec 31)'.length * 7.5 + 32);
  });

  it('leaves the table beside the message and full screen as it was', () => {
    const before = columnWidths(LEADERBOARD, 300).px;
    for (const c of LEADERBOARD.columns) expect(before.get(c.name)).toBe(width(LEADERBOARD, c.name, false));
    expect(before.get('On people talking to an assistant')).toBeGreaterThan(300);
  });
});

describe('a wide table in a message keeps its first column in view', () => {
  it('sticks the first column to the left edge while the rest scrolls', () => {
    const first = declarationsFor('.tbl-inline .tbl-tr > :first-child');
    expect(first.position).toBe('sticky');
    expect(first.left).toBe('0');
    expect(first.background).toBeTruthy();
  });

  it('sticks the name beside the rank in a ranked table, and nothing else', () => {
    expect(declarationsFor('.tbl-inline.tbl-ranked .tbl-tr > :nth-child(2)').position).toBe('sticky');
    const second = declarationsFor('.tbl-inline:not(.tbl-ranked) .tbl-tr > :nth-child(2)');
    expect(second.position ?? 'static').toBe('static');
  });

  // Cells are grid items, so a z-index counts without a position: the second
  // column kept the 1 it is given for the pane and painted over the first,
  // and every header (z-index 1) painted over "Model".
  it('paints the column that stays over the ones that scroll under it', () => {
    const header = Number(declarationsFor('.tbl-th')['z-index']);
    expect(Number(declarationsFor('.tbl-inline .tbl-tr > :first-child')['z-index'])).toBeGreaterThan(header);
    expect(Number(declarationsFor('.tbl-inline.tbl-ranked .tbl-tr > :nth-child(2)')['z-index'])).toBeGreaterThan(header);
    expect(declarationsFor('.tbl-inline:not(.tbl-ranked) .tbl-tr > :nth-child(2)')['z-index']).toBe('auto');
  });

  it('draws its left edge on the column that stays, so the edge does not scroll away', () => {
    expect(declarationsFor('.tbl-inline .tbl-grid')['border-left']).toBe('0');
    expect(declarationsFor('.tbl-inline .tbl-tr > :first-child')['border-left']).toMatch(/1px solid var\(--tbl-line\)/);
  });

  it('lets the header words wrap', () => {
    expect(declarationsFor('.tbl-inline .tbl-th')['white-space']).toBe('normal');
    expect(declarationsFor('.tbl-inline .tbl-th > .tbl-ell')['white-space']).toBe('normal');
  });
});
