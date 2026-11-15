// THE PHONE APP OPENS A TABLE AS A TABLE, AND A TEXT FILE AS ITS TEXT.
//
// Reported from the phone: tables and other files a thread names did not open
// properly. `openingOf` knew pictures, documents, pages and films; a .csv, a
// .json or a .txt fell through to `elsewhere`, which handed the file's storage
// link to the browser sheet. A .csv goes up as text/csv, which the sheet shows
// as raw comma-separated lines or offers to download. The thread drew no card
// for a table or a PDF either, though the desktop draws both under the answer
// (`messageDocuments`, Focus.tsx `previewPaths`).
import { describe, it, expect } from 'vitest';
import { cloudPlaces } from '../renderer/src/cloud-files.ts';
import { phoneSlug } from '../renderer/src/phone-rows.ts';
import { openingOf, threadFilePaths, tableOnPhone, columnWidths } from '../mobile/src/lib/files';

const D = '0a1b2c3d4e5f';
const P = phoneSlug(D, 'agentbox');
const n = (c, ext) => `${c.repeat(64 / c.length)}.${ext}`;
const files = {
  'docs/leads.csv': { n: n('a1', 'csv'), s: 300 },
  'docs/leads.tsv': { n: n('a2', 'tsv'), s: 300 },
  'docs/config.json': { n: n('a3', 'json'), s: 40 },
  'docs/notes.txt': { n: n('a4', 'txt'), s: 40 },
  'docs/brief.pdf': { n: n('a5', 'pdf'), s: 900 },
  'docs/deck.pptx': { n: n('a6', 'pptx'), s: 900 },
};
const places = cloudPlaces([{ device: D, project: 'agentbox', snapshot: { item: { updatedAt: 1 }, attached: { dir: '~/docs/agentbox', files, folders: {} } } }], phoneSlug);
const DIR = places.get(P).dir;
const url = (name) => `https://cloud/${name}?token=t`;
const links = new Map(Object.values(files).map((e) => [e.n, { url: url(e.n), until: Date.now() + 3600_000 }]));
const open = (src) => openingOf(places, links, P, src);

describe('what a press on a table or a text file opens', () => {
  it('a csv or a tsv opens in the app as a table', () => {
    expect(open('docs/leads.csv')).toEqual({ kind: 'table', src: 'docs/leads.csv', link: url(n('a1', 'csv')), name: 'leads.csv' });
    expect(open('docs/leads.tsv')).toMatchObject({ kind: 'table', name: 'leads.tsv' });
  });

  it('a text file opens in the app as its text', () => {
    expect(open('docs/config.json')).toMatchObject({ kind: 'text', name: 'config.json', link: url(n('a3', 'json')) });
    expect(open('docs/notes.txt')).toMatchObject({ kind: 'text', name: 'notes.txt' });
  });

  it('a PDF or a slide deck still goes to the browser, which draws them itself', () => {
    expect(open('docs/brief.pdf')).toEqual({ kind: 'elsewhere', link: url(n('a5', 'pdf')) });
    expect(open('docs/deck.pptx')).toEqual({ kind: 'elsewhere', link: url(n('a6', 'pptx')) });
  });

  it('a table that is not on the phone still says why', () => {
    expect(open('docs/missing.csv')).toEqual({ kind: 'refused', error: 'This file is on your computer.' });
  });
});

describe('the cards under a thread', () => {
  it('carry the tables and PDFs it names, as the desktop does, and no other file', () => {
    const item = { result: 'The list is `docs/leads.csv`, the brief `docs/brief.pdf`, the config `docs/config.json`, notes in `STATE.md`.' };
    expect(threadFilePaths(item, DIR)).toEqual(['docs/leads.csv', 'docs/brief.pdf']);
  });
});

describe('a table read on the phone', () => {
  const csv = 'Company,Stage,Raised,Website\nAcme,Seed,"$1,200,000",acme.com\nBolt,Series A,$8m,bolt.io\n';
  const read = async (u) => { if (u === url(n('a1', 'csv'))) return csv; throw new Error('not here'); };

  it('is its columns and rows, with quoted commas kept inside their cell', async () => {
    const out = await tableOnPhone(places, links, P, 'docs/leads.csv', read);
    expect(out.ok).toBe(true);
    expect(out.table.columns.map((c) => c.name)).toEqual(['Company', 'Stage', 'Raised', 'Website']);
    expect(out.table.rows).toEqual([['Acme', 'Seed', '$1,200,000', 'acme.com'], ['Bolt', 'Series A', '$8m', 'bolt.io']]);
    expect(out.table.columns[1].kind).toBe('tag');
    expect(out.table.columns[2].kind).toBe('number');
  });

  it('says why when it cannot be read', async () => {
    expect(await tableOnPhone(places, links, P, 'docs/missing.csv', read)).toEqual({ ok: false, error: 'This file is on your computer.' });
    expect(await tableOnPhone(places, links, P, 'docs/leads.tsv', read)).toEqual({ ok: false, error: 'This file could not be read.' });
  });

  it('gives each column room for its longest cell, within a floor and a ceiling', async () => {
    const { table } = await tableOnPhone(places, links, P, 'docs/leads.csv', read);
    const w = columnWidths(table);
    expect(w).toHaveLength(4);
    // "Company" is the longest thing in its column and fits whole.
    expect(w[0]).toBeGreaterThan(60);
    // A tag's chip is wider than its words: "Series A" in its chip is wider than "Series A" as text.
    const asText = columnWidths({ ...table, columns: table.columns.map((c) => ({ ...c, kind: 'text' })) });
    expect(w[1]).toBe(asText[1] + 30);
    const long = columnWidths({ ...table, rows: [['x'.repeat(400), '', '', '']] });
    expect(long[0]).toBe(260);
    const tiny = columnWidths({ ...table, columns: table.columns.map((c) => ({ ...c, name: 'a' })), rows: [['b', 'c', 'd', 'e']] });
    expect(tiny.every((x) => x === 64)).toBe(true);
  });
});
