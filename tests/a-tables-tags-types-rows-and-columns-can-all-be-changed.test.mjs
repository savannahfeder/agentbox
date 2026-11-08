// A person editing a plan table found they could not rename or delete a tag,
// pick its colour, say a column holds dates, or move a row or a column; and a
// tag cell took two clicks to open. These pin the parts that are not the
// screen: tags renamed, merged and deleted across every cell, the colour and
// type a person picked surviving a reload of the file, a picked day written the
// way the column writes dates, and rows and columns moved with the file
// written back in the new order.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readTable, dateOf, dateWords, dayTyped } from '../renderer/src/table-file.ts';
import {
  renameTag, dropTag, withLooks, lookKind, lookTone, lookRenameColumn, lookRenameTag, NO_LOOKS,
  moveRows, moveColumns, writeTable, shapeOf, learnTag, writeCells, pinTones, newTone, lookWrap,
} from '../renderer/src/table-edit.ts';

const PLAN = [
  'Goal,Launch,Status',
  'Stable cloud,2026-11-12,At risk',
  'Phone app,2026-11-12,Hello',
  'Testers,2026-11-17,hello',
  'Video,2026-11-17,Done',
].join('\n') + '\n';
const plan = () => readTable(PLAN, 'plan.csv');
const statuses = (t) => t.rows.map((r) => r[2]);

describe('a tag is renamed, merged or deleted in every cell that holds it', () => {
  it('renames every cell, whatever its case, and keeps the tag\'s colour', () => {
    const t = plan();
    const tone = t.columns[2].tones.hello;
    const next = renameTag(t, 2, 'Hello', 'Blocked on Apple');
    expect(statuses(next)).toEqual(['At risk', 'Blocked on Apple', 'Blocked on Apple', 'Done']);
    expect(next.columns[2].values).toEqual(['At risk', 'Blocked on Apple', 'Done']);
    expect(next.columns[2].tones['blocked on apple']).toBe(tone);
    expect(next.columns[2].tones.hello).toBeUndefined();
    expect(statuses(t)).toEqual(['At risk', 'Hello', 'hello', 'Done']);
  });
  it('merges into a tag that already has the new name, written the way that tag is', () => {
    const next = renameTag(plan(), 2, 'Hello', 'done');
    expect(statuses(next)).toEqual(['At risk', 'Done', 'Done', 'Done']);
    expect(next.columns[2].values).toEqual(['At risk', 'Done']);
  });
  it('changes only the case when only the case is new', () => {
    const next = renameTag(plan(), 2, 'Hello', 'HELLO');
    expect(statuses(next)).toEqual(['At risk', 'HELLO', 'HELLO', 'Done']);
    expect(next.columns[2].values).toEqual(['At risk', 'HELLO', 'Done']);
  });
  it('leaves the table alone for a blank name, the same name, or a column that is not tags', () => {
    const t = plan();
    expect(renameTag(t, 2, 'Hello', '  ')).toBe(t);
    expect(renameTag(t, 2, 'Hello', 'Hello')).toBe(t);
    expect(renameTag(t, 0, 'Video', 'Film')).toBe(t);
  });
  it('deletes a tag from the list and empties its cells, and no other', () => {
    const next = dropTag(plan(), 2, 'hello');
    expect(statuses(next)).toEqual(['At risk', '', '', 'Done']);
    expect(next.columns[2].values).toEqual(['At risk', 'Done']);
    expect(writeTable(next, shapeOf(PLAN, 'plan.csv'))).toContain('Phone app,2026-11-12,\n');
  });
  it('a deleted tag typed again comes back in the colour it had', () => {
    const t = withLooks(plan(), lookTone(NO_LOOKS, 'Status', 'Hello', 'teal'));
    const gone = dropTag(t, 2, 'Hello');
    const back = writeCells(gone, [{ i: 1, c: 2, v: 'Hello' }]);
    expect(back.columns[2].values).toContain('Hello');
    expect(back.columns[2].tones.hello).toBe('teal');
  });
  it('a tag the column does not know is still learnt when a colour waits for it', () => {
    const col = { ...plan().columns[2], tones: { ...plan().columns[2].tones, later: 'green' } };
    expect(learnTag(col, 'Later').values).toContain('Later');
    expect(learnTag(col, 'Later').tones.later).toBe('green');
  });
});

describe('a colour and a type the person picked come back when the file is read again', () => {
  it('a picked colour wins over the guess, and the guess stays for the rest', () => {
    const looks = lookTone(NO_LOOKS, 'Status', 'At risk', 'amber');
    const t = withLooks(readTable(PLAN, 'plan.csv'), looks);
    expect(t.columns[2].tones['at risk']).toBe('amber');
    expect(t.columns[2].tones.done).toBe('green');
  });
  it('a picked type wins over the guess: tags, a date, text', () => {
    expect(plan().columns[1].kind).toBe('date');
    const asTags = withLooks(plan(), lookKind(NO_LOOKS, 'Launch', 'tag'));
    expect(asTags.columns[1].kind).toBe('tag');
    expect(asTags.columns[1].values).toEqual(['2026-11-12', '2026-11-17']);
    expect(withLooks(plan(), lookKind(NO_LOOKS, 'Status', 'text')).columns[2].kind).toBe('text');
    const words = readTable('Goal,When\nA,after the cloud\nB,once testers sign\n', 'x.csv');
    expect(words.columns[1].kind).toBe('text');
    expect(withLooks(words, lookKind(NO_LOOKS, 'When', 'date')).columns[1].kind).toBe('date');
  });
  it('choices follow a column and a tag that are renamed, and no other', () => {
    const looks = lookTone(lookKind(NO_LOOKS, 'Status', 'tag'), 'Status', 'Hello', 'teal');
    const moved = lookRenameColumn(looks, 'Status', 'State');
    expect(moved.kinds).toEqual({ State: 'tag' });
    expect(moved.tones).toEqual({ State: { hello: 'teal' } });
    expect(lookRenameColumn(looks, 'Goal', 'Aim')).toBe(looks);
    expect(lookRenameTag(moved, 'State', 'Hello', 'Waiting').tones.State).toEqual({ waiting: 'teal' });
    expect(lookRenameTag(moved, 'State', 'Done', 'Shipped')).toBe(moved);
  });
  // A tester moved three Sam rows above the Jordan ones; on reopening, Jordan
  // and Sam had swapped colours, because the guess deals them out by first row.
  it('colours the table picked itself stay put after rows move and the file is read again', () => {
    const src = 'Company,Owner\nA,Jordan\nB,Sam\nC,Jordan\nD,Sam\n';
    const t = readTable(src, 'l.csv');
    const before = { ...t.columns[1].tones };
    const moved = moveRows(t, [1, 3], 0).table;
    const fresh = readTable(writeTable(moved, shapeOf(src, 'l.csv')), 'l.csv');
    expect(fresh.columns[1].tones).not.toEqual(before);
    expect(withLooks(fresh, pinTones(t, NO_LOOKS)).columns[1].tones).toEqual(before);
    const chosen = lookTone(NO_LOOKS, 'Owner', 'Sam', 'teal');
    expect(pinTones(t, chosen).tones.Owner.sam).toBe('teal');
    expect(pinTones(readTable('A,B\n1,2\n', 'x.csv'), NO_LOOKS)).toBe(NO_LOOKS);
  });
  it('a new tag takes a colour no tag in the column has yet, unless its word means one', () => {
    const t = readTable('Lead,Stage\nA,Intro call\nB,Scoping\nC,Intro call\n', 'x.csv');
    const col = t.columns[1];
    const used = new Set(Object.values(col.tones));
    expect(used.has(newTone(col, 'Negotiating'))).toBe(false);
    expect(newTone(col, 'Won')).toBe('green');
    // Replied and Negotiating both mean purple; the second one added is told apart.
    const leads = readTable('Lead,Status\nA,Replied\nB,Won\nC,Replied\n', 'x.csv').columns[1];
    expect(leads.tones.replied).toBe('purple');
    expect(newTone(leads, 'Negotiating')).not.toBe('purple');
    expect(newTone(leads, 'Lost')).toBe('rose');
  });
  // Long notes were cut off with "..." and could only be read by opening the row.
  it('a column set to wrap stays wrapped after reading the file again, follows a rename, and turns off', () => {
    const t = readTable('Goal,Note\nA,a long note\nB,another\n', 'x.csv');
    const on = lookWrap(NO_LOOKS, 'Note', true);
    expect(withLooks(t, on).columns[1].wrap).toBe(true);
    expect(withLooks(t, on).columns[0].wrap).toBeFalsy();
    expect(lookRenameColumn(on, 'Note', 'Notes').wrap).toEqual({ Notes: true });
    const off = lookWrap(on, 'Note', false);
    expect(off.wrap).toEqual({});
    expect(withLooks(withLooks(t, on), off).columns[1].wrap).toBe(false);
  });
  it('nothing chosen leaves the table exactly as read', () => {
    const t = plan();
    expect(withLooks(t, NO_LOOKS)).toBe(t);
  });
});

describe('a day picked from the calendar is written the way the column writes dates', () => {
  const day = Date.UTC(2026, 10, 12);
  it('ISO in an ISO column, slashes in a slash column, words otherwise', () => {
    expect(dateWords(day, ['2026-11-01', '2026-10-30', ''])).toBe('2026-11-12');
    expect(dateWords(day, ['11/1/2026', '10/30/2026'])).toBe('11/12/2026');
    expect(dateWords(day, ['Nov 1, 2026', 'Oct 30, 2026'])).toBe('Nov 12, 2026');
    expect(dateWords(day, [])).toBe('Nov 12, 2026');
  });
  it('a column of "Mon Nov 9" gets a weekday and no year; one with years keeps them', () => {
    expect(dateWords(day, ['Mon Nov 9', 'Sat Nov 7', ''])).toBe('Thu Nov 12');
    expect(dateWords(day, ['Cloud Thu Nov 12', 'Multiplayer Tue Nov 17'])).toBe('Thu Nov 12');
    expect(dateWords(day, ['Nov 9', 'Oct 30'])).toBe('Nov 12');
    expect(dateWords(day, ['Mon, Nov 9, 2026'])).toBe('Thu Nov 12, 2026');
  });
  it('today, tomorrow and yesterday are days; other words are not', () => {
    const now = new Date(2026, 10, 7, 15, 0);
    expect(dayTyped('tomorrow', now)).toBe(Date.UTC(2026, 10, 8));
    expect(dayTyped(' Today ', now)).toBe(Date.UTC(2026, 10, 7));
    expect(dayTyped('yesterday', now)).toBe(Date.UTC(2026, 10, 6));
    expect(dayTyped('after the demo', now)).toBeNaN();
    expect(dayTyped('12/3', now)).toBe(Date.UTC(2026, 11, 3));
    expect(dayTyped('2/30', now)).toBeNaN();
    expect(dayTyped('Nov 30, 2026', now)).toBe(Date.UTC(2026, 10, 30));
  });
  // A tester picked a day in Launch ("Cloud Thu Nov 12") and the file lost "Cloud".
  it('a column of names with a day in them is not guessed to be dates; a column of days still is', () => {
    expect(readTable('Goal,Launch\nA,Cloud Thu Nov 12\nB,Multiplayer Tue Nov 17\nC,Cloud Thu Nov 12\nD,Both\n', 'x.csv').columns[1].kind).toBe('text');
    expect(readTable('Goal,By\nA,Mon Nov 9\nB,Sat Nov 7\nC,Thu Nov 12\n', 'x.csv').columns[1].kind).toBe('date');
    expect(readTable('Goal,Due\nA,2026-11-12T10:30:00Z\nB,2026-11-13\n', 'x.csv').columns[1].kind).toBe('date');
  });
  // A tester typed 2026-13-40; it was read as Feb 9 2027 and sorted as the newest due date.
  it('a day that is not on the calendar is not a date', () => {
    for (const v of ['2026-13-40', '2/30/2026', '2026-02-29', '13/13/2026']) expect(dateOf(v)).toBeNaN();
    expect(dateOf('2028-02-29')).toBe(Date.UTC(2028, 1, 29));
    expect(dateOf('25/03/2025')).toBe(Date.UTC(2025, 2, 25));
  });
  it('reads every way of writing a day as the same day, so the calendar marks the right one', () => {
    for (const v of ['2026-11-12', '11/12/2026', 'Nov 12, 2026', 'November 12 2026', 'Thu Nov 12 2026']) expect(dateOf(v)).toBe(day);
    expect(dateOf(dateWords(day, []))).toBe(day);
  });
});

describe('rows and columns move, and the file is written in the new order', () => {
  it('moves a row up, down, to the top and to the foot', () => {
    const t = plan();
    const names = (x) => x.rows.map((r) => r[0]);
    expect(names(moveRows(t, [2], 0).table)).toEqual(['Testers', 'Stable cloud', 'Phone app', 'Video']);
    expect(names(moveRows(t, [0], 2).table)).toEqual(['Phone app', 'Stable cloud', 'Testers', 'Video']);
    expect(names(moveRows(t, [0, 1], 4).table)).toEqual(['Testers', 'Video', 'Stable cloud', 'Phone app']);
    expect(moveRows(t, [0, 1], 4).to).toEqual([2, 3, 0, 1]);
  });
  it('rows a filter left apart move together, in their order', () => {
    const names = (x) => x.rows.map((r) => r[0]);
    expect(names(moveRows(plan(), [3, 1], 0).table)).toEqual(['Phone app', 'Video', 'Stable cloud', 'Testers']);
  });
  it('a drop onto the rows being moved, or just after them, changes nothing', () => {
    const t = plan();
    expect(moveRows(t, [1, 2], 1).table).toBe(t);
    expect(moveRows(t, [1, 2], 2).table).toBe(t);
    expect(moveRows(t, [1, 2], 3).table).toBe(t);
    expect(moveRows(t, [], 0).table).toBe(t);
  });
  it('a ranked list that counts 1, 2, 3 still counts after a move', () => {
    const t = readTable('#,Name\n1,Ada\n2,Bo\n3,Cy\n', 'r.csv');
    expect(moveRows(t, [2], 0).table.rows).toEqual([['1', 'Cy'], ['2', 'Ada'], ['3', 'Bo']]);
  });
  it('moves a column with its cells, its header and its logo', () => {
    const src = 'Company,Status,Website\nRamp,New,ramp.com\nDeel,Won,deel.com\n';
    const t = readTable(src, 'l.csv');
    expect(t.logoCol).toBe(2);
    const { table: next, to } = moveColumns(t, 2, 1, 1);
    expect(next.columns.map((c) => c.name)).toEqual(['Company', 'Website', 'Status']);
    expect(next.logoCol).toBe(1);
    expect(to).toEqual([0, 2, 1]);
    expect(writeTable(next, shapeOf(src, 'l.csv'))).toBe('Company,Website,Status\nRamp,ramp.com,New\nDeel,deel.com,Won\n');
    expect(moveColumns(t, 0, 1, 3).table.columns.map((c) => c.name)).toEqual(['Status', 'Website', 'Company']);
  });
  it('a ranked file\'s rank stays first, and a no-op drop changes nothing', () => {
    const t = readTable('#,Name,Score\n1,Ada,3\n2,Bo,4\n', 'r.csv');
    expect(moveColumns(t, 2, 1, 0).table.columns.map((c) => c.name)).toEqual(['#', 'Score', 'Name']);
    expect(moveColumns(t, 0, 1, 3).table).toBe(t);
    expect(moveColumns(t, 1, 1, 2).table).toBe(t);
  });
});

// The screen half, read off the source: a single press on a tag or date cell
// opens its list, and a picked block of rows or columns can be dragged.
describe('the view wires these up', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/TableView.tsx', import.meta.url), 'utf8');
  it('one press opens a tag or date cell, not two', () => {
    expect(src).toMatch(/opensOnClick/);
    expect(src).toMatch(/kind === 'tag' \|\| [^\n]*kind === 'date'/);
  });
  it('the tag list can rename, recolour and delete a tag', () => {
    expect(src).toMatch(/renameTag\(/);
    expect(src).toMatch(/dropTag\(/);
    expect(src).toMatch(/lookTone\(/);
  });
  it('each header and the Type list mark a column\'s type with its icon', () => {
    expect(src).toMatch(/<KindIcon kind=\{c\.kind\} \/>\{c\.name\}/);
    expect(src).toMatch(/<KindIcon kind=\{kind\} \/><span className="when-row-label">\{label\}/);
  });
  it('a cut-off cell picked shows its words whole, and a column can wrap', () => {
    expect(src).toMatch(/className="tbl-peek"/);
    expect(src).toMatch(/label="Wrap text"/);
  });
  it('rows and columns can be moved by drag and from the menu', () => {
    expect(src).toMatch(/moveRows\(/);
    expect(src).toMatch(/moveColumns\(/);
    expect(src).toMatch(/'Move up'/);
    expect(src).toMatch(/'Move left'/);
  });
});
