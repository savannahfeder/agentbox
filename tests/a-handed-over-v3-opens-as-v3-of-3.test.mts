// A HANDED-OVER V3 OPENS AS V3 OF 3.
//
// Found by the team test on w-1fc102959f (2026-11-09), by two testers, then
// reproduced in two copies: Theo's agent made a table and two new versions,
// Theo gave the thread to Maya, and the task she got named the newest file
// first ("Where it got to: …-v3.csv", then the files v3, v1, v2). Pressing the
// v3 link opened the table titled with its first name, "v1 of 3", with a
// "Show v3" button, though the rows were v3's. A thread numbers a file's
// versions in the order they are first named, and a handoff names the newest
// first.
//
// A family whose names carry their own numbers (name, name-v2, name-v3), each
// once, is now ordered by those numbers. Order of naming still decides when
// the names do not number themselves, when two share a number, and when the
// version line numbers the family.
import { describe, it, expect } from 'vitest';
import { threadFiles, whereAPressLands } from '../shared/artifact-marks.mts';

const files = (...paths) => paths.map((path) => ({ path }));
const names = (family) => family.versions.map((v) => `${v.n}:${v.name}`);

describe('the versions of a file named out of order', () => {
  it('go by the number in their names', () => {
    const [table] = threadFiles(files('designs/w-1/rows-v3.csv', 'designs/w-1/rows.csv', 'designs/w-1/rows-v2.csv'));
    expect(names(table)).toEqual(['1:rows.csv', '2:rows-v2.csv', '3:rows-v3.csv']);
  });

  it('so a press on the v3 link lands on the third of three', () => {
    const families = threadFiles(files('attachments/ab12-rows-v3.csv', 'attachments/ab12-rows.csv', 'attachments/ab12-rows-v2.csv'));
    expect(whereAPressLands(families, { path: 'attachments/ab12-rows-v3.csv' })).toEqual({ fi: 0, vi: 2 });
  });

  it('keep the order they were named in when the names carry no numbers', () => {
    const [deck] = threadFiles(files('a/deck.pdf', 'b/deck.pdf'));
    expect(deck.versions.map((v) => v.path)).toEqual(['a/deck.pdf', 'b/deck.pdf']);
  });

  it('keep the order they were named in when two names share a number', () => {
    const [pic] = threadFiles(files('a/shot-v2.png', 'b/shot-v2.png', 'a/shot.png'));
    expect(pic.versions.map((v) => v.path)).toEqual(['a/shot-v2.png', 'b/shot-v2.png', 'a/shot.png']);
  });

  it('follow the version line when there is one', () => {
    const [doc] = threadFiles(files('d/plan-v2.md', 'd/plan.md'), { 'd/plan-v2.md': 1, 'd/plan.md': 2 });
    expect(names(doc)).toEqual(['1:plan-v2.md', '2:plan.md']);
  });
});
