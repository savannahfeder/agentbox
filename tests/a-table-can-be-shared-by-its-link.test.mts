// A TABLE CAN BE SHARED BY ITS LINK, AND THE LINK DRAWS IT AS A TABLE.
//
// The launch film (Agent Docs, 2026-11-09) says "docs, tables, videos,
// designs" and then shares one. Measured on the app as it was: the Share globe
// was missing on a .csv (canShareFile and linkKindOf named no table), so the
// owner opened a file the film names and found no Share at all. A table goes
// up as text, the way a document does, so the database's kinds need no change:
// its type says it is a table, and the page and the worker draw it as one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { linkKindOf, fileForLink } from '../main/file-link.mts';
import { canShareFile } from '../renderer/src/components/ShareLink.tsx';
import { readSharedFile, titleOf, isTable } from '../renderer/src/shared-file/shared-file.ts';
import { FilePage } from '../renderer/src/shared-file/SharedFilePage.tsx';
import { sharedFileWorker } from '../cloud/web/shared-file-worker.mjs';

const TOK = '0123456789abcdef0123456789abcdef01234567';
const CSV = 'Company,Fit,Status\nLedger,9,New\nPilot,7,Replied\n';

describe('the desktop offers Share on a table', () => {
  it('names .csv and .tsv as text a link can carry, typed as tables', () => {
    expect(linkKindOf('leads.csv')).toEqual({ kind: 'markdown', type: 'text/csv' });
    expect(linkKindOf('LEADS.TSV')).toEqual({ kind: 'markdown', type: 'text/tab-separated-values' });
    expect(linkKindOf('plan.md')).toEqual({ kind: 'markdown', type: 'text/markdown' });
  });
  it('draws the globe on a table and still not on a spreadsheet it cannot read', () => {
    expect(canShareFile('/x/leads.csv')).toBe(true);
    expect(canShareFile('/x/leads-v3.tsv?at=1')).toBe(true);
    expect(canShareFile('/x/leads.xlsx')).toBe(false);
    expect(canShareFile('/x/notes.txt')).toBe(false);
  });
  it('puts the table in the link as it is on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-link-'));
    const file = path.join(dir, 'leads.csv');
    fs.writeFileSync(file, CSV);
    const made = fileForLink(file);
    expect(made).toMatchObject({ kind: 'markdown', type: 'text/csv', body: CSV });
  });
});

describe('the link page draws a table as a table', () => {
  const row = (extra = {}) => ({ name: 'leads.csv', kind: 'markdown', type: 'text/csv', body: CSV, version: 1, created_at: '2026-11-09T10:00:00Z', updated_at: '2026-11-09T10:00:00Z', owner_name: 'Maya Chen', ...extra });
  const read = (r) => readSharedFile(async (name) => (name === 'file_link_view' ? [r] : false), TOK);

  it('reads it as a table, titled by its name rather than by a first line that is no heading', async () => {
    const shown = await read(row({ body: '# not a heading,Fit\nA,1\n' }));
    expect(shown.state).toBe('file');
    const file = (shown as { file: Parameters<typeof titleOf>[0] & { type: string } }).file;
    expect(isTable(file)).toBe(true);
    expect(titleOf(file).title).toBe('leads.csv');
  });
  it('a markdown document is still a document', async () => {
    const shown = await read(row({ name: 'plan.md', type: 'text/markdown', body: '# Plan\n\nWords.' }));
    const file = (shown as { file: Parameters<typeof titleOf>[0] & { type: string } }).file;
    expect(isTable(file)).toBe(false);
    expect(titleOf(file).title).toBe('Plan');
  });
  it('draws the rows in the app\'s table, not as words in a document', () => {
    const file = { name: 'leads.csv', kind: 'markdown', type: 'text/csv', body: CSV, version: 1, createdAt: 0, updatedAt: 0, ownerName: 'Maya Chen', ownerAvatar: null, mine: false } as const;
    const html = renderToStaticMarkup(h(FilePage, { token: TOK, file }));
    expect(html).toContain('<h1>leads.csv</h1>');
    expect(html).toMatch(/class="[^"]*\btbl\b/);
    expect(html).toContain('Ledger');
    expect(html).not.toContain('doc-prose');
    expect(html).toContain('Download');
  });
});

describe('the worker hands the table over as a table', () => {
  const env = { ASSETS: { fetch: async () => new Response('<html><head><title>x</title></head><body></body></html>') } };
  const worker = (r) => sharedFileWorker({ cloud: 'https://db.test', anonKey: 'anon' }, { fetchImpl: async () => new Response(JSON.stringify([r]), { status: 200 }) });
  const table = { name: 'leads.csv', kind: 'markdown', type: 'text/csv', body: CSV, owner_name: 'Maya Chen' };

  it('as text/csv, downloadable under its name, and inert', async () => {
    const res = await worker(table).fetch(new Request(`https://app.test/f/${TOK}/raw`), env);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="leads.csv"');
    expect(res.headers.get('content-security-policy')).toMatch(/^sandbox;/);
    expect(await res.text()).toBe(CSV);
  });
  it('a document stays plain text with no download name', async () => {
    const res = await worker({ ...table, name: 'plan.md', type: 'text/markdown', body: '# Plan' }).fetch(new Request(`https://app.test/f/${TOK}/raw`), env);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBeNull();
  });
  it('heads the link preview with the table\'s name', async () => {
    const res = await worker({ ...table, body: '# Fake title,Fit\nA,1' }).fetch(new Request(`https://app.test/f/${TOK}`), env);
    expect(await res.text()).toContain('<title>leads.csv · Agentbox</title>');
  });
});
