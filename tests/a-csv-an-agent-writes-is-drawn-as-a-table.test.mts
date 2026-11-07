// A CSV an agent writes is drawn as a table: a column of short repeated words
// becomes coloured tags, numbers line up, a website column gives each row its
// company's logo. Until this, a lead list came through as monospaced text in
// the code viewer, commas and all. What is pinned here is the reading: how the
// file is split and what each column is taken to be. The look is in
// table-view.css and was approved as designs/w-690551d7ea/tags-6-colour-on-status-only-v2.png.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDelimited, readTable, isTablePath, tagTone, logoFor, sortRows, filterRows, dateOf } from '../renderer/src/table-file.ts';
import { besideDocument, messageDocuments } from '../renderer/src/message-artifacts.ts';
import { readsInPlace } from '../renderer/src/components/OneThingAtATime.tsx';
import { viewKind, opensBigInAGroup } from '../shared/artifact-marks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('where a table shows', () => {
  it('opens beside the message when its path is on a line of its own', () => {
    expect(besideDocument('**Pick who I write to first.**\n\nleads/fintech.csv\n')).toBe('leads/fintech.csv');
    expect(besideDocument('Done.\n\n`export.tsv`')).toBe('export.tsv');
  });
  it('stays shut when it is only named in a sentence', () => {
    expect(besideDocument('I saved the list as leads/fintech.csv for later.')).toBeNull();
  });
  it('is previewed in the message that names it, and read in place there', () => {
    expect(messageDocuments({ result: 'The list is leads/fintech.csv.' })).toContain('leads/fintech.csv');
    expect(readsInPlace('leads/fintech.csv')).toBe(true);
    expect(readsInPlace('main/ipc.mts')).toBe(false);
  });
  it('opens full screen as a table, while a script stays code', () => {
    expect(viewKind('leads/fintech.csv')).toBe('table');
    expect(viewKind('export.tsv')).toBe('table');
    expect(viewKind('main/ipc.mts')).toBe('code');
    expect(viewKind('notes.txt')).toBe('code');
  });
  it('is in the brief, so an agent knows to make one', () => {
    const rules = fs.readFileSync(path.join(root, 'briefs/message-rules.md'), 'utf8').replace(/\s+/g, ' ');
    expect(rules).toMatch(/write a \.csv with a header row/);
  });
});

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

// Found by a tester playing a founder who lives in lists, with files an agent
// really writes (w-690551d7ea): each case below drew wrong before its fix.
describe('files the way agents really write them', () => {
  const kinds = (text) => readTable(text, 'x.csv').columns.map((c) => c.kind);
  it('keeps a quoted value whole when a space follows the comma', () => {
    const t = readTable('Company, Website, Status, ARR\nAcme, acme.com, New, "$1,200,000"\nBeta, beta.io, New, "$90,000"\n', 'x.csv');
    expect(t.columns).toHaveLength(4);
    expect(t.rows[0][3]).toBe('$1,200,000');
  });
  it('reads a semicolon file and a markdown table saved as csv', () => {
    expect(readTable('Name;Status\nA;New\nB;Won\n', 'x.csv').columns.map((c) => c.name)).toEqual(['Name', 'Status']);
    const md = readTable('| Company | Website |\n|---|---|\n| Ramp | ramp.com |\n| Plaid | plaid.com |\n', 'x.csv');
    expect(md.columns.map((c) => c.name)).toEqual(['Company', 'Website']);
    expect(md.rows).toEqual([['Ramp', 'ramp.com'], ['Plaid', 'plaid.com']]);
  });
  it('drops an empty column a trailing comma makes', () => {
    expect(readTable('A,B,\n1,x,\n2,y,\n', 'x.csv').columns.map((c) => c.name)).toEqual(['A', 'B']);
  });
  it('names a repeated header apart', () => {
    expect(readTable('Name,Email,Email\nA,a@x.com,b@x.com\n', 'x.csv').columns.map((c) => c.name)).toEqual(['Name', 'Email', 'Email 2']);
  });
  it('keeps a number column whole when some cells say N/A, and sorts those last', () => {
    const t = readTable('Name,ARR\nA,$5k\nB,N/A\nC,-$5k\nD,$0\nE,—\n', 'x.csv');
    expect(t.columns[1].kind).toBe('number');
    expect(sortRows(t, t.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['C', 'D', 'A', 'B', 'E']);
  });
  it('knows a date column and sorts it by time', () => {
    const t = readTable('Name,Last touch\nA,Mar 3 2026\nB,Dec 1 2025\nC,Mar 3 2026\nD,1/15/2026\n', 'x.csv');
    expect(t.columns[1].kind).toBe('date');
    expect(sortRows(t, t.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['B', 'D', 'A', 'C']);
  });
  it('keeps a Status column as tags even with twenty values', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `R${i},Stage ${i % 20}`).join('\n');
    expect(kinds(`Name,Status\n${rows}\n`)[1]).toBe('tag');
  });
  it('does not make tags of names, or numbers of phones and zip codes', () => {
    expect(kinds('Name,Investor,Phone,Zip\nA,Sequoia,+1 415 555 0100,94107\nB,Sequoia,415-555-0101,94107\nC,Accel,(415) 555 0102,10001\nD,Accel,4155550103,10001\n'))
      .toEqual(['name', 'text', 'text', 'text']);
  });
  it('takes no logo from a LinkedIn column', () => {
    const t = readTable('Name,LinkedIn,Status\nAna,https://linkedin.com/in/ana,New\nBo,https://linkedin.com/in/bo,New\n', 'x.csv');
    expect(logoFor(t, t.rows[0])).toBeNull();
  });
  it('treats New, new and NEW as one tag', () => {
    const t = readTable('Name,Status\nA,New\nB,new\nC,NEW\nD,Won\n', 'x.csv');
    expect(t.columns[1].values).toEqual(['New', 'Won']);
    expect(filterRows(t, '', { 1: ['New'] }).map((r) => r[0])).toEqual(['A', 'B', 'C']);
  });
});

// Found by a Codex review (gpt-6-luna, w-690551d7ea), each reproduced first.
describe('what a second model found', () => {
  it('reads a 150,000-row file without running out of stack', () => {
    const big = 'Name,Status\n' + Array.from({ length: 150_000 }, (_, i) => `R${i},${i % 2 ? 'New' : 'Won'}`).join('\n') + '\n';
    const t = readTable(big, 'x.csv');
    expect(t.rows).toHaveLength(150_000);
    expect(t.columns.map((c) => c.name)).toEqual(['Name', 'Status']);
  });
  it('counts separators outside quotes when it picks one', () => {
    const t = readTable('"Company, Inc";Status\nAcme;Won\nBeta;Lost\n', 'x.csv');
    expect(t.columns.map((c) => c.name)).toEqual(['Company, Inc', 'Status']);
    // and a comma file whose quoted header holds semicolons stays a comma file
    expect(readTable('"A; B",C\n1,2\n', 'x.csv').columns.map((c) => c.name)).toEqual(['A; B', 'C']);
  });
  it('does not read every word starting with un as bad', () => {
    for (const v of ['Unassigned', 'Under review', 'Unicorn']) expect(tagTone(v, 0), v).not.toBe('rose');
    for (const v of ['Unqualified', 'Uninterested', 'Unresponsive', 'Unsubscribed']) expect(tagTone(v, 0), v).toBe('rose');
  });
  it('opens a csv shared in a group in the big view, as it does a document', () => {
    expect(opensBigInAGroup('leads.csv')).toBe(true);
    expect(opensBigInAGroup('export.tsv')).toBe(true);
    expect(opensBigInAGroup('plan.md')).toBe(true);
    expect(opensBigInAGroup('script.mjs')).toBe(false);
    expect(opensBigInAGroup('sheet.xlsx')).toBe(false);
  });
});

// Found by the power-user loop after the Codex review, each reproduced first.
describe('what the last power-user loop found', () => {
  it('gives a word it does not know a colour that cannot pass for green', () => {
    for (let i = 0; i < 8; i++) expect(['green', 'teal', 'rose']).not.toContain(tagTone(`Thing ${i}`, i));
  });
  it('reads a yes under Churn risk as bad, and Critical as worse than Medium', () => {
    expect(tagTone('TRUE', 0, 'Churn risk')).toBe('rose');
    expect(tagTone('FALSE', 0, 'Churn risk')).toBe('green');
    expect(tagTone('Critical', 0, 'Risk level')).toBe('rose');
  });
  it('reads a candidate who passed a screen as good, and an industry by no outcome at all', () => {
    expect(tagTone('Passed phone screen', 0, 'Stage')).toBe('green');
    for (const v of ['Non-profit', 'Customer Success', 'Win-back']) expect(['green', 'rose'], v).not.toContain(tagTone(v, 0, 'Industry'));
  });
  it('knows the words investors and account health use', () => {
    expect(tagTone('Committed', 0, 'Status')).toBe('green');
    expect(tagTone('Soft circle', 0, 'Status')).toBe('purple');
    expect(tagTone('Positive', 0, 'Sentiment')).toBe('green');
    expect(tagTone('Healthy', 0, 'Health')).toBe('green');
    expect(tagTone('At risk', 0, 'Health')).toBe('rose');
  });
  it('reads 25/03/2025 as March, and a date with no year as this year', () => {
    const t = readTable('Name,Signed\nA,25/03/2025\nB,2025-11-01\nC,14/03/2025\nD,2026-01-02\n', 'x.csv');
    expect(t.columns[1].kind).toBe('date');
    expect(sortRows(t, t.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['C', 'A', 'B', 'D']);
    const y = readTable('Name,Next call\nA,Dec 12\nB,Jan 5\n', 'x.csv');
    const year = new Date().getFullYear();
    expect(new Date(dateOf('Jan 5')).getFullYear()).toBe(year);
    expect(sortRows(y, y.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['B', 'A']);
  });
  it('sorts money written as a range, an estimate or in European form as money', () => {
    const t = readTable('Investor,Check size\nA,$250k-$1M\nB,~$1M\nC,TBD\nD,$1.5M\nE,$500K\n', 'x.csv');
    expect(t.columns[1].kind).toBe('number');
    expect(sortRows(t, t.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['A', 'E', 'B', 'D', 'C']);
    const eu = readTable('Name;Salary\nA;€80.000\nB;€120.000\nC;€9.500,50\n', 'x.csv');
    expect(eu.columns[1].kind).toBe('number');
    expect(sortRows(eu, eu.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['C', 'A', 'B']);
  });
  it('keeps an escaped pipe inside its markdown cell', () => {
    const t = readTable('| Company | Stage | Website |\n|---|---|---|\n| Pipe \\| Inc | New | pipe.com |\n| Ramp | Won | ramp.com |\n', 'x.csv');
    expect(t.columns.map((c) => c.name)).toEqual(['Company', 'Stage', 'Website']);
    expect(t.rows[0][0]).toBe('Pipe | Inc');
  });
  it('never names two columns the same', () => {
    const names = readTable('Name,Email,Email,Email 2\nA,a,b,c\n', 'x.csv').columns.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('tag colours', () => {
  it('reads a no as a no', () => {
    for (const v of ['Not a fit', 'Passed', 'FALSE', 'Declined']) expect(tagTone(v, 0), v).toBe('rose');
    expect(tagTone('TRUE', 3)).toBe('green');
    expect(tagTone('Nurture', 0)).toBe('amber');
  });
  it('reads High and Low by what the column measures', () => {
    expect(tagTone('High', 0, 'Churn risk')).toBe('rose');
    expect(tagTone('Low', 0, 'Churn risk')).toBe('green');
    expect(tagTone('High', 0, 'Fit')).toBe('green');
    expect(tagTone('Medium', 0, 'Fit')).toBe('amber');
  });
  // Round two of the same test: a word not on the list got green by its place.
  it('reads a bad outcome as bad even when it is not one of the listed words', () => {
    for (const v of ['Unqualified', 'Wrong person', 'Not interested', 'Closed - Lost', 'Negative', 'Ghosted', 'Bad', 'Weak'])
      expect(tagTone(v, 4), v).toBe('rose');
    expect(tagTone('Not now', 4)).toBe('amber');
    for (const v of ['Closed-Won', 'Strong', 'Good']) expect(tagTone(v, 1), v).toBe('green');
  });
  it('never hands green to a word it does not know', () => {
    for (let i = 0; i < 12; i++) expect(tagTone(`Thing ${i}`, i)).not.toBe('green');
  });
  it('reads a yes as bad under a header that names something bad', () => {
    expect(tagTone('TRUE', 0, 'Bounced')).toBe('rose');
    expect(tagTone('FALSE', 0, 'Bounced')).toBe('green');
    expect(tagTone('Yes', 0, 'Unsubscribed')).toBe('rose');
    expect(tagTone('Yes', 0, 'Warm intro?')).toBe('green');
  });
  it('makes tags of Outcome and Reply columns', () => {
    const rows = ['Won', 'Lost', 'Ghosted', 'Not now', 'Won', 'Bad timing', 'Lost', 'Signed', 'Passed', 'Won', 'Pilot', 'Churned'];
    const t = readTable(`Name,Outcome,Reply\n${rows.map((r, i) => `C${i},${r},${['Yes', 'No', 'Later'][i % 3]}`).join('\n')}\n`, 'x.csv');
    expect(t.columns.map((c) => c.kind)).toEqual(['name', 'tag', 'tag']);
  });
  it('never hands red to a word that means nothing bad', () => {
    for (let i = 0; i < 12; i++) expect(tagTone(`Thing ${i}`, i)).not.toBe('rose');
  });
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
    expect(cat.values).toEqual(['Spend', 'Banking', 'Payments', 'Payroll']);
    expect(new Set(cat.values.map((v) => cat.tones[v.toLowerCase()])).size).toBe(4);
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
