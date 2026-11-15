// SEARCHING FILES FINDS FILES BY THEIR OWN NAME BEFORE THEIR FOLDER.
//
// Maya: "investor" in
// the Files box gave five results, the update, the deck and the metrics note,
// and also chart.png and report.pdf, a sample chart and an "About Lumen" PDF
// that have nothing to do with investors. A word counted wherever it was in
// the name, the project or the folder (Lumen app has "Investors and numbers"),
// and inside a word as well.
//
// What must still match: a project or folder word when no file is named for
// it, and a word that starts any part of a name.
import { describe, it, expect } from 'vitest';
import { filesShown } from '../renderer/src/files/files-shown';

const file = (over) => ({ key: over.name, project: 'Company', kind: 'markdown', versions: 1, at: 1, by: 'maya', open: 0, approvedBy: [], sentIn: [], opened: null, folder: null, ...over });
const folders = [{ id: 'inv', project: 'Lumen app', name: 'Investors and numbers', parent: null, at: 1 }];
const list = [
  file({ name: 'october-investor-update.md', at: 5 }),
  file({ name: 'october-investor-deck.pdf', kind: 'pdf', at: 4 }),
  file({ name: 'chart.png', kind: 'image', project: 'Lumen app', folder: 'inv', at: 9 }),
  file({ name: 'report.pdf', kind: 'pdf', project: 'Lumen app', folder: 'inv', at: 8 }),
  file({ name: 'pricing.md', project: 'Billing', at: 3 }),
  file({ name: 'paint-into-the-corner.md', at: 2 }),
];
const names = (l) => l.map((f) => f.name);

describe('the Files search box', () => {
  it('"investor" finds the files named for it, not the files that only sit in an Investors folder', () => {
    expect(names(filesShown(list, { query: 'investor', folders }))).toEqual(['october-investor-update.md', 'october-investor-deck.pdf']);
  });

  it('a folder\'s word still finds its files when no file is named for it', () => {
    expect(names(filesShown(list, { query: 'numbers', folders }))).toEqual(['chart.png', 'report.pdf']);
    expect(names(filesShown(list, { query: 'billing', folders }))).toEqual(['pricing.md']);
  });

  it('a word and a folder word together narrow to that file', () => {
    expect(names(filesShown(list, { query: 'investors chart', folders }))).toEqual(['chart.png']);
  });

  it('a word matches the start of a part of a name, never the middle of a word', () => {
    expect(names(filesShown(list, { query: 'to', folders }))).toEqual([]);
    expect(names(filesShown(list, { query: 'in', folders }))).toEqual(['october-investor-update.md', 'october-investor-deck.pdf', 'paint-into-the-corner.md']);
  });
});
