// A table could only be read. A person opening a lead list found they could
// not pick a cell or a row, type over a value, switch a tag, read a long note
// to its end, or widen a column, and said so in a list of eleven things a
// spreadsheet does that ours did not. What is pinned here is the part of
// editing that is not the screen: the file written back the way it came,
// copy and paste in the shape Sheets and Excel use, and rows and columns added
// and taken away. The screen half was driven in the running app by testers.
import { describe, it, expect } from 'vitest';
import { readTable, filterRows } from '../renderer/src/table-file.ts';
import {
  boxOf, inBox, moved, toClipboard, fromClipboard, pasteInto, writeCells, addRows, dropRows,
  orderAfterDrop, orderAfterAdd, addColumn, dropColumn, renameColumn, showColumnAs, shapeOf, writeTable, learnTag, filterChoices, likeItsColumn,
} from '../renderer/src/table-edit.ts';
import { canWrite, writeDoc } from '../main/doc-file.mts';

const LEADS = [
  'Company,Status,Note,Website',
  'Ramp,Meeting,Asked for a demo,ramp.com',
  'Mercury,Replied,"Replied, wants pricing",mercury.com',
  'Deel,New,"Intro through an ""investor""",deel.com',
  'Plaid,New,"Two lines\nof note",plaid.com',
].join('\r\n') + '\r\n';
const back = (text, path = 'leads.csv') => writeTable(readTable(text, path), shapeOf(text, path));

describe('a save writes the file back the way it came', () => {
  it('gives back the same bytes when nothing was changed', () => {
    expect(back(LEADS)).toBe(LEADS);
  });
  it('keeps a tab file tabbed and a semicolon file semicoloned', () => {
    const tsv = 'Name\tStatus\nAda\tNew\nBo\tWon\n';
    expect(back(tsv, 'x.tsv')).toBe(tsv);
    const semi = '"Company, Inc";Status\nAcme;New\nBeta;Won\n';
    expect(back(semi)).toBe(semi);
  });
  it('keeps the byte order mark a spreadsheet export starts with', () => {
    const bom = '﻿Name,Status\nAda,New\nBo,Won\n';
    expect(back(bom)).toBe(bom);
  });
  it('writes a markdown table saved as .csv back as a markdown table', () => {
    const md = '| Name | Status |\n|---|---|\n| Ada | New |\n| Bo \\| Co | Won |\n';
    const out = back(md);
    expect(out.split('\n')[0]).toBe('| Name | Status |');
    expect(readTable(out, 'x.csv').rows).toEqual([['Ada', 'New'], ['Bo | Co', 'Won']]);
  });
  it('keeps duplicate headers as the file wrote them, not as the table renamed them', () => {
    const dup = 'Email,Email\na@x.co,b@x.co\nc@x.co,d@x.co\n';
    expect(readTable(dup, 'x.csv').columns.map((c) => c.name)).toEqual(['Email', 'Email 2']);
    expect(back(dup)).toBe(dup);
  });
  it('quotes a typed value only when it needs it', () => {
    const t = readTable(LEADS, 'leads.csv');
    const out = writeTable(writeCells(t, [{ i: 0, c: 2, v: 'Said "soon", then left' }, { i: 1, c: 2, v: 'plain' }]), shapeOf(LEADS, 'leads.csv'));
    expect(out).toContain('Ramp,Meeting,"Said ""soon"", then left",ramp.com');
    expect(out).toContain('Mercury,Replied,plain,mercury.com');
    expect(readTable(out, 'leads.csv').rows[0][2]).toBe('Said "soon", then left');
  });
});

describe('a cell typed over', () => {
  const t = readTable(LEADS, 'leads.csv');
  it('copies only the row it is in, so the old table is still there to undo to', () => {
    const next = writeCells(t, [{ i: 1, c: 1, v: 'Won' }]);
    expect(next.rows[1][1]).toBe('Won');
    expect(t.rows[1][1]).toBe('Replied');
    expect(next.rows[0]).toBe(t.rows[0]);
  });
  it('teaches a tag column a new value, in the colour its word means', () => {
    const next = writeCells(t, [{ i: 0, c: 1, v: 'Lost' }]);
    expect(next.columns[1].values).toContain('Lost');
    expect(next.columns[1].tones.lost).toBe('rose');
  });
  it('does not teach it the same tag twice under another capital', () => {
    const col = t.columns[1];
    expect(learnTag(col, 'meeting')).toBe(col);
    expect(learnTag(col, '  ')).toBe(col);
  });
  it('leaves a column it has no business in alone', () => {
    expect(writeCells(t, [{ i: 0, c: 9, v: 'x' }, { i: 99, c: 0, v: 'x' }]).rows).toEqual(t.rows);
  });
});

describe('a pick moves the way arrows move in a spreadsheet', () => {
  const e = { rows: 5, first: 0, last: 3 };
  it('steps one cell and stops at the edges', () => {
    expect(moved({ r: 0, c: 0 }, 'ArrowDown', e)).toEqual({ r: 1, c: 0 });
    expect(moved({ r: 0, c: 0 }, 'ArrowUp', e)).toEqual({ r: 0, c: 0 });
    expect(moved({ r: 4, c: 3 }, 'ArrowRight', e)).toEqual({ r: 4, c: 3 });
  });
  it('jumps to the edge with ⌘', () => {
    expect(moved({ r: 2, c: 1 }, 'ArrowDown', e, { jump: true })).toEqual({ r: 4, c: 1 });
    expect(moved({ r: 2, c: 1 }, 'ArrowLeft', e, { jump: true })).toEqual({ r: 2, c: 0 });
    expect(moved({ r: 2, c: 1 }, 'End', e, { jump: true })).toEqual({ r: 4, c: 3 });
  });
  it('never lands on a ranked file\'s rank, which is drawn as the row number', () => {
    expect(moved({ r: 0, c: 1 }, 'ArrowLeft', { rows: 3, first: 1, last: 2 })).toEqual({ r: 0, c: 1 });
    expect(moved({ r: 0, c: 2 }, 'Home', { rows: 3, first: 1, last: 2 })).toEqual({ r: 0, c: 1 });
  });
  it('pages by the rows in view', () => {
    expect(moved({ r: 0, c: 0 }, 'PageDown', e, { page: 3 })).toEqual({ r: 3, c: 0 });
    expect(moved({ r: 1, c: 0 }, 'PageUp', e, { page: 3 })).toEqual({ r: 0, c: 0 });
  });
  it('reads a pick dragged up and left as the same box', () => {
    const b = boxOf({ a: { r: 3, c: 2 }, b: { r: 1, c: 0 } });
    expect(b).toEqual({ r0: 1, r1: 3, c0: 0, c1: 2 });
    expect(inBox(b, 2, 1)).toBe(true);
    expect(inBox(b, 0, 1)).toBe(false);
    expect(inBox(b, 2, 3)).toBe(false);
  });
});

describe('copy and paste speak the spreadsheet clipboard', () => {
  it('copies cells as tab separated lines, quoting what would split', () => {
    expect(toClipboard([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
    expect(toClipboard([['two\nlines', 'say "hi"']])).toBe('"two\nlines"\t"say ""hi"""');
  });
  it('reads back what it wrote', () => {
    const grid = [['two\nlines', 'say "hi"'], ['', 'x']];
    expect(fromClipboard(toClipboard(grid))).toEqual(grid);
  });
  it('takes one copied value as one value, commas and all', () => {
    expect(fromClipboard('Replied, wants pricing')).toEqual([['Replied, wants pricing']]);
    expect(fromClipboard('Won\n')).toEqual([['Won']]);
  });
  it('takes lines with no tabs as one column', () => {
    expect(fromClipboard('Ramp\r\nMercury\r\nDeel')).toEqual([['Ramp'], ['Mercury'], ['Deel']]);
  });
  it('fills every picked cell with one value', () => {
    expect(pasteInto([['Won']], { r0: 1, r1: 2, c0: 1, c1: 2 }, 5)).toEqual([
      { r: 1, c: 1, v: 'Won' }, { r: 1, c: 2, v: 'Won' }, { r: 2, c: 1, v: 'Won' }, { r: 2, c: 2, v: 'Won' },
    ]);
  });
  it('lays a block out from the top left, past a pick of one cell', () => {
    const out = pasteInto([['a', 'b'], ['c', 'd']], { r0: 3, r1: 3, c0: 0, c1: 0 }, 5);
    expect(out).toEqual([{ r: 3, c: 0, v: 'a' }, { r: 3, c: 1, v: 'b' }, { r: 4, c: 0, v: 'c' }, { r: 4, c: 1, v: 'd' }]);
  });
  it('repeats a block that fits the pick a whole number of times', () => {
    const out = pasteInto([['a'], ['b']], { r0: 0, r1: 3, c0: 0, c1: 0 }, 5);
    expect(out.map((w) => w.v)).toEqual(['a', 'b', 'a', 'b']);
  });
  it('leaves off the columns past the last one', () => {
    const out = pasteInto([['a', 'b', 'c']], { r0: 0, r1: 0, c0: 2, c1: 2 }, 3);
    expect(out.map((w) => w.c)).toEqual([2, 3]);
  });
});

describe('rows and columns added and taken away', () => {
  const t = readTable(LEADS, 'leads.csv');
  it('puts a blank row in where asked', () => {
    const next = addRows(t, 1);
    expect(next.rows.length).toBe(5);
    expect(next.rows[1]).toEqual(['', '', '', '']);
    expect(next.rows[2]).toBe(t.rows[1]);
  });
  it('keeps a ranked list counting 1, 2, 3 when a row is put in or taken out', () => {
    const ranked = readTable('#,Candidate,Stage\n1,Ada,Offer\n2,Bo,Screening\n3,Cy,Applied\n', 'x.csv');
    expect(addRows(ranked, 1).rows.map((r) => r[0] + r[1])).toEqual(['1Ada', '2', '3Bo', '4Cy']);
    expect(dropRows(ranked, new Set([0])).rows.map((r) => r[0] + r[1])).toEqual(['1Bo', '2Cy']);
  });
  it('leaves ranks alone that are not a plain count', () => {
    const own = readTable('#,Candidate\n3,Ada\n1,Bo\n2,Cy\n', 'x.csv');
    expect(addRows(own, 3).rows.map((r) => r[0])).toEqual(['3', '1', '2', '']);
  });
  it('keeps the view\'s order true after rows go', () => {
    // The view shows file rows 3, 0, 2, 1; rows 0 and 2 are deleted.
    expect(orderAfterDrop([3, 0, 2, 1], new Set([0, 2]))).toEqual([1, 0]);
    expect(dropRows(t, new Set([0, 2])).rows.map((r) => r[0])).toEqual(['Mercury', 'Plaid']);
  });
  it('shows a row added in the middle of a sorted view where it was asked for', () => {
    expect(orderAfterAdd([3, 0, 2, 1], 2, 1, 1)).toEqual([4, 2, 0, 3, 1]);
  });
  it('adds a column with a name of its own, and moves the logo column along', () => {
    const next = addColumn(t, 1);
    expect(next.columns[1].name).toBe('Column 5');
    expect(next.rows[0]).toEqual(['Ramp', '', 'Meeting', 'Asked for a demo', 'ramp.com']);
    expect(next.logoCol).toBe(t.logoCol + 1);
  });
  it('takes a column away, but never the last one or a ranked file\'s rank', () => {
    expect(dropColumn(t, 2).columns.map((c) => c.name)).toEqual(['Company', 'Status', 'Website']);
    const one = readTable('Name\nAda\n', 'x.csv');
    expect(dropColumn(one, 0)).toBe(one);
    const ranked = readTable('#,Name,Fit\n1,Ada,High\n2,Bo,Low\n', 'x.csv');
    expect(dropColumn(ranked, 0)).toBe(ranked);
  });
  it('renames a column, and the file gets the new header', () => {
    const next = renameColumn(t, 2, 'Status');
    expect(next.columns[2].name).toBe('Status 2');
    expect(writeTable(renameColumn(t, 2, 'Why'), shapeOf(LEADS, 'x.csv')).split('\r\n')[0]).toBe('Company,Status,Why,Website');
  });
  it('turns a text column into tags from the values in it, and back', () => {
    const tags = showColumnAs(t, 3, 'tag');
    expect(tags.columns[3].values).toEqual(['ramp.com', 'mercury.com', 'deel.com', 'plaid.com']);
    expect(showColumnAs(tags, 3, 'text').columns[3].values).toEqual([]);
  });
});

describe('the Filter menu offers any column with a short list of values', () => {
  const CITIES = ['Company,Status,Based in,Employees,Note',
    ...['New York', 'London', 'New York', 'Berlin', 'London', 'new york'].map((c, i) => `Co ${i},${i % 2 ? 'New' : 'Won'},${c},${i * 10},note ${i}`)].join('\n');
  const t = readTable(CITIES, 'x.csv');
  const offered = Object.fromEntries(filterChoices(t).map((f) => [t.columns[f.col].name, f.values]));
  it('offers the tags, and a city column a tester could not filter to New York by', () => {
    expect(offered.Status).toEqual(['Won', 'New']);
    expect(offered['Based in']).toEqual(['Berlin', 'London', 'New York']);
  });
  it('leaves out names, amounts, and text that never repeats', () => {
    expect(offered.Company).toBeUndefined();
    expect(offered.Employees).toBeUndefined();
    expect(offered.Note).toBeUndefined();
  });
  it('offers the empty cells too, and filtering to them finds those rows', () => {
    const gaps = readTable('Name,Status\nAda,Won\nBo,\nCy,Won\nDi,New\nEd,\n', 'x.csv');
    const status = filterChoices(gaps).find((f) => f.col === 1);
    expect(status.values).toEqual(['Won', 'New', '']);
    expect(filterRows(gaps, '', { 1: [''] }).map((r) => r[0])).toEqual(['Bo', 'Ed']);
  });
  it('leaves out a column with more values than a menu can hold', () => {
    const many = ['Name,City', ...Array.from({ length: 120 }, (_, i) => `P${i},Town ${i % 60}`)].join('\n');
    expect(filterChoices(readTable(many, 'x.csv'), 40)).toEqual([]);
    expect(filterChoices(readTable(many, 'x.csv'), 80).map((f) => f.col)).toEqual([1]);
  });
});

describe('a number typed into a column of amounts is written the way the column writes them', () => {
  // A tester typed 7200 into MRR and it sat there as 7200 among $1,200 and $3,450.
  const mrr = ['$1,200', '$3,450', '$980', '$12,000'];
  it('takes the column\'s currency and thousands commas', () => {
    expect(likeItsColumn('7200', mrr)).toBe('$7,200');
    expect(likeItsColumn('1234567.5', mrr)).toBe('$1,234,567.5');
    expect(likeItsColumn('-40', mrr)).toBe('-$40');
  });
  it('leaves alone what was typed with its own format, or is not a plain number', () => {
    expect(likeItsColumn('$7,200', mrr)).toBe('$7,200');
    expect(likeItsColumn('7.2k', mrr)).toBe('7.2k');
    expect(likeItsColumn('n/a', mrr)).toBe('n/a');
  });
  it('adds nothing to a column of plain counts', () => {
    expect(likeItsColumn('7200', ['12', '40', '1200', '4000'])).toBe('7200');
  });
});

describe('the app lets a table be saved, and only where a markdown file could be', () => {
  const product = { slug: 'leads', name: 'Leads', dir: '/acct/leads', repoPath: '/dev/leads' };
  const fs = (files) => ({
    existsSync: (p) => p in files,
    statSync: (p) => ({ size: files[p].length, mtimeMs: 1000 }),
    readFileSync: (p) => files[p],
    writeFileSync: (p, text) => { files[p] = text; },
  });
  it('writes a csv and a tsv inside the project', () => {
    const files = { '/acct/leads/list.csv': 'a\n1\n', '/acct/leads/list.tsv': 'a\n1\n' };
    expect(writeDoc({ file: '/acct/leads/list.csv', product, text: 'a\n2\n', fs: fs(files) }).ok).toBe(true);
    expect(files['/acct/leads/list.csv']).toBe('a\n2\n');
    expect(canWrite({ file: '/acct/leads/list.tsv', product, fs: fs(files) }).ok).toBe(true);
  });
  it('still refuses a page, a script, and a table outside the project', () => {
    const files = { '/acct/leads/x.html': '', '/acct/leads/x.json': '', '/acct/other/list.csv': '' };
    expect(canWrite({ file: '/acct/leads/x.html', product, fs: fs(files) }).ok).toBe(false);
    expect(canWrite({ file: '/acct/leads/x.json', product, fs: fs(files) }).ok).toBe(false);
    expect(canWrite({ file: '/acct/other/list.csv', product, fs: fs(files) }).ok).toBe(false);
  });
});
