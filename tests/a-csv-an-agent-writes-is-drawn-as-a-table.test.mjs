// A CSV an agent writes is drawn as a table: a column of short repeated words
// becomes coloured tags, numbers line up, a website column gives each row its
// company's logo. Until this, a lead list came through as monospaced text in
// the code viewer, commas and all. What is pinned here is the reading: how the
// file is split and what each column is taken to be. The look is in
// table-view.css and was approved as designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
import { describe, it, expect } from 'vitest';
import { parseDelimited, readTable, isTablePath, tagTone, logoFor, sortRows, filterRows } from '../renderer/src/table-file.ts';

const LEADS = [
  'Company,Category,Based in,Note,Status,Website,People',
  'Ramp,Spend,New York,Asked for a demo last week,Meeting,ramp.com,1200',
  'Mercury,Banking,San Francisco,"Replied, wants pricing",Replied,https://mercury.com/,800',
  'Plaid,Payments,San Francisco,Opened the email twice,Contacted,plaid.com,1100',
  'Brex,Spend,San Francisco,No contact yet,New,www.brex.com,1000',
  'Deel,Payroll,San Francisco,"Intro through an ""investor""",New,deel.com,4000',
  'Unit,Banking,New York,No contact yet,New,unit.co,150',
].join('\r\n') + '\r\n';

describe('which files are tables', () => {
  it('takes csv and tsv, through a query or fragment', () => {
    expect(isTablePath('leads/fintech.csv')).toBe(true);
    expect(isTablePath('export.TSV')).toBe(true);
    expect(isTablePath('export.csv?v=2')).toBe(true);
    expect(isTablePath('export.csv#row-3')).toBe(true);
  });
  it('leaves every other file alone', () => {
    for (const p of ['notes.md', 'data.json', 'sheet.xlsx', 'csv', 'my.csv.bak', null, undefined]) expect(isTablePath(p), String(p)).toBe(false);
  });
});

describe('splitting the text', () => {
  it('keeps commas, doubled quotes and line breaks inside quotes', () => {
    const rows = parseDelimited('a,b\n"x, y","he said ""hi"""\n"two\nlines",z\n', ',');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['two\nlines', 'z']]);
  });
  it('drops a byte order mark and a blank last line, and reads CRLF', () => {
    expect(parseDelimited('﻿a,b\r\n1,2\r\n', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reads a tab file by its tabs even when it is named csv', () => {
    const t = readTable('name\tstatus\nA\tNew\nB\tNew\n', 'x.csv');
    expect(t.columns.map((c) => c.name)).toEqual(['name', 'status']);
  });
});

describe('what each column is', () => {
  const t = readTable(LEADS, 'fintech-leads.csv');
  const kind = (name) => t.columns.find((c) => c.name === name)?.kind;

  it('reads the header and every row', () => {
    expect(t.rows).toHaveLength(6);
    expect(t.rows[1][3]).toBe('Replied, wants pricing');
    expect(t.rows[4][3]).toBe('Intro through an "investor"');
  });
  it('makes short repeated words tags', () => {
    expect(kind('Category')).toBe('tag');
    expect(kind('Status')).toBe('tag');
  });
  it('keeps a sentence, a place and the first column as text', () => {
    expect(kind('Note')).toBe('text');
    expect(kind('Company')).toBe('name');
    // Two cities over six rows repeat like a tag would; a place is still text.
    expect(kind('Based in')).toBe('text');
  });
  it('lines numbers up and knows a website', () => {
    expect(kind('People')).toBe('number');
    expect(kind('Website')).toBe('link');
  });
  it('gives each row the logo of its own website', () => {
    expect(logoFor(t, t.rows[0])).toBe('ramp.com');
    expect(logoFor(t, t.rows[1])).toBe('mercury.com');
    expect(logoFor(t, t.rows[3])).toBe('brex.com');
  });
  it('gives no logo when there is no website column', () => {
    const plain = readTable('Name,Status\nA,New\nB,New\nC,Won\n', 'x.csv');
    expect(logoFor(plain, plain.rows[0])).toBeNull();
  });
  it('does not make tags of a column where every value is different and long', () => {
    const u = readTable('Name,Why\nA,raised a round in march\nB,hired a new head of sales\nC,opened an office in london\n', 'x.csv');
    expect(u.columns[1].kind).toBe('text');
  });
  it('makes a tag column of three rows when the header says it is one', () => {
    const u = readTable('Name,Stage\nA,Seed\nB,Series A\nC,Series B\n', 'x.csv');
    expect(u.columns[1].kind).toBe('tag');
  });
  it('fills a short row and names a blank header', () => {
    const u = readTable('Name,,Status\nA\nB,x,New\n', 'x.csv');
    expect(u.rows[0]).toEqual(['A', '', '']);
    expect(u.columns[1].name).toBe('Column 2');
  });
  it('reads an empty file as no table, not an error', () => {
    expect(readTable('', 'x.csv').rows).toEqual([]);
    expect(readTable('', 'x.csv').columns).toEqual([]);
  });
});

describe('tag colours', () => {
  it('gives the words a pipeline uses the colour they mean', () => {
    expect(tagTone('Meeting', 0)).toBe('green');
    expect(tagTone('Won', 0)).toBe('green');
    expect(tagTone('New', 3)).toBe('grey');
    expect(tagTone('Contacted', 0)).toBe('blue');
    expect(tagTone('Lost', 0)).toBe('rose');
    expect(tagTone('Researching', 0)).toBe('amber');
    expect(tagTone('Replied', 0)).toBe('purple');
  });
  it('gives any other word a colour by its place, the same each time', () => {
    expect(tagTone('Payments', 0)).toBe(tagTone('Payments', 0));
    expect(tagTone('Spend', 0)).not.toBe(tagTone('Banking', 1));
  });
  it('colours every value of a tag column, the first seen first', () => {
    const t = readTable(LEADS, 'x.csv');
    const cat = t.columns.find((c) => c.name === 'Category');
    expect(Object.keys(cat.tones)).toEqual(['Spend', 'Banking', 'Payments', 'Payroll']);
    expect(new Set(Object.values(cat.tones)).size).toBe(4);
  });
});

describe('searching, filtering and sorting', () => {
  const t = readTable(LEADS, 'x.csv');
  it('finds a word in any cell, whatever its case', () => {
    expect(filterRows(t, 'francisco', {}).map((r) => r[0])).toEqual(['Mercury', 'Plaid', 'Brex', 'Deel']);
  });
  it('keeps only the tags picked in a column', () => {
    const status = t.columns.findIndex((c) => c.name === 'Status');
    expect(filterRows(t, '', { [status]: ['New'] }).map((r) => r[0])).toEqual(['Brex', 'Deel', 'Unit']);
  });
  it('sorts numbers as numbers and words as words, both ways', () => {
    const people = t.columns.findIndex((c) => c.name === 'People');
    expect(sortRows(t, t.rows, { col: people, dir: 'asc' }).map((r) => r[0])).toEqual(['Unit', 'Mercury', 'Brex', 'Plaid', 'Ramp', 'Deel']);
    expect(sortRows(t, t.rows, { col: 0, dir: 'desc' }).map((r) => r[0])[0]).toBe('Unit');
  });
  it('leaves the order alone with no sort', () => {
    expect(sortRows(t, t.rows, null)).toBe(t.rows);
  });
});
