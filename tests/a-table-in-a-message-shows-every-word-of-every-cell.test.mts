// A TABLE IN A MESSAGE SHOWS EVERY WORD OF EVERY CELL.
//
// "For this chart or table I literally can't see the text. There's no way to
// expand this text ... I shouldn't even have to scroll to see the text"
// (2026-11-20). A two-column answer ("What he asked for" / "Today") drawn in a
// message cut every long cell to one line with "…": "Already there. The Team
// board shows every t…". In a message a cell was 46px tall, nowrap, and capped
// at 300px, and nothing opened it. Measured by reading the inline rules in
// table-view.css and the column tracks the message's table was given.
//
// The fix: in a message a cell wraps its whole text and its row grows to fit,
// and the columns share the message's width (no column wider than its words
// need, none cut), so a sideways scroll is left only for a table whose
// columns cannot fit even at their narrowest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { tableFromGrid } from '../renderer/src/table-file.ts';
import { inlineTracks } from '../renderer/src/components/TableView.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/components/table-view.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const declarationsFor = (selector: string) => {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
};

const ASKED = tableFromGrid([
  ['What he asked for', 'Today'],
  ['"my founder to be able to see everything I\'m working on and what my agents are doing"', 'Already there. The Team board shows every thread of every teammate, and its status, as it changes.'],
  ['"His agents would automatically have access to everything my agents know"', 'Already there. Every agent can list and read the threads of the whole team.'],
  ['Agents acting as colleagues', 'Already there. AI teammates do this.'],
  ['"even push some of the threads along"', 'Missing. A teammate\'s comment waits until the thread\'s owner opens it.'],
]);

const track = /^minmax\((\d+)px, (\d+)fr\)$/;
const parse = (t: string) => t.split(/ (?=minmax|\d+px)/).map((s) => {
  const m = s.match(track);
  if (!m) throw new Error(`not a shared track: ${s}`);
  return { min: Number(m[1]), share: Number(m[2]) };
});

describe('the columns of a table in a message', () => {
  it('share the message width, so no long cell sets a fixed width', () => {
    const cols = parse(inlineTracks(ASKED));
    expect(cols).toHaveLength(2);
  });

  it('give the column with more words the bigger share', () => {
    const [asked, today] = parse(inlineTracks(ASKED));
    expect(today.share).toBeGreaterThan(asked.share);
  });

  it('let a long column narrow to a few words before the table scrolls', () => {
    for (const c of parse(inlineTracks(ASKED))) expect(c.min).toBeLessThanOrEqual(220);
  });

  it('never narrow a short column below its own words, so it stays on one line', () => {
    const t = tableFromGrid([['Plan', 'Price', 'Notes'], ['Pro', '$40', 'The one most people pick, because it runs ten agents at once and costs less than a lunch a week.']]);
    const [plan, price] = parse(inlineTracks(t));
    expect(plan.min).toBeGreaterThanOrEqual('Plan'.length * 7.6);
    expect(price.min).toBeGreaterThanOrEqual('Price'.length * 7.6);
    expect(plan.min).toBeLessThan(120);
  });

  // A five-column leaderboard still scrolled sideways when every column kept
  // a 180px floor: "2.3%" does not need it, and its long header wraps.
  it('let a column of short numbers under a long header narrow to its longest header word', () => {
    const t = tableFromGrid([
      ['Model', 'On people talking to an assistant', 'Price'],
      ['Microsoft MAI-Transcribe-2', '2.3%', '$0.54'],
    ]);
    const [, talking, price] = parse(inlineTracks(t));
    expect(talking.min).toBeLessThanOrEqual(120);
    expect(talking.min).toBeGreaterThanOrEqual('assistant'.length * 8);
    expect(price.min).toBeLessThanOrEqual(90);
  });

  it('never narrow a column below its longest word', () => {
    const t = tableFromGrid([['Name', 'Note'], ['A', `${'x'.repeat(40)} and then some more words to make it long enough to wrap twice over`]]);
    const [, note] = parse(inlineTracks(t));
    expect(note.min).toBeGreaterThanOrEqual(40 * 7.5);
  });

  it('leave out the rank column of a ranked list, as the message draws it', () => {
    const t = tableFromGrid([['#', 'Company', 'Why'], ['1', 'Acme', 'Big'], ['2', 'Globex', 'Bigger']]);
    expect(parse(inlineTracks(t))).toHaveLength(t.ranked ? 2 : 3);
  });
});

describe('a cell in a message', () => {
  it('wraps its words and grows its row to fit them', () => {
    const td = declarationsFor('.tbl-inline .tbl-td');
    expect(td['white-space']).toBe('normal');
    expect(td.height).toBe('auto');
    expect(td['align-items']).toBe('flex-start');
  });

  it('is never cut off with an ellipsis', () => {
    const words = declarationsFor('.tbl-inline .tbl-td .tbl-ell');
    expect(words['white-space']).toBe('normal');
    expect(words['text-overflow'] ?? 'clip').toBe('clip');
    expect(words['max-width']).toBe('none');
    expect(words.overflow).toBe('visible');
  });

  it('sits in a table as wide as the message, not as wide as its longest line', () => {
    expect(declarationsFor('.tbl-inline .tbl-grid').width).toBe('100%');
  });

  it('leaves the table beside the message and full screen one line a row', () => {
    expect(declarationsFor('.tbl-td').height).toBe('var(--tbl-row-h, 46px)');
    expect(declarationsFor('.tbl-td')['white-space']).toBe('nowrap');
    expect(declarationsFor('.tbl-ell')['text-overflow']).toBe('ellipsis');
  });
});
