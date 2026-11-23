// A SHARED FILE'S DOWNLOAD KEEPS ITS WHOLE NAME, AND A LONG NAME STILL SHARES.
//
// Found on the live site 2026-11-12: the worker's raw address named every
// download with only ASCII letters, so `Résumé – final 🚀.pdf` came down as
// `R_sum_ _ final _.pdf` and `שלום report.pdf` as `_ report.pdf`. And a name
// over 200 characters failed to share with the database's own words, because
// file_links.name holds at most 200. Measured on the worker's headers, and on
// what linkCopyOf hands the cloud for a name of 255 characters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sharedFileWorker } from '../cloud/web/shared-file-worker.mjs';
import { linkCopyOf } from '../main/file-link.mts';

const TOK = '0123456789abcdef0123456789abcdef01234567';
const env = { ASSETS: { fetch: async () => new Response('<html><head><title>x</title></head></html>') } };
const workerFor = (row: object) => sharedFileWorker({ cloud: 'https://db.test', anonKey: 'anon' }, {
  fetchImpl: async (url: string) => (url.endsWith('/rpc/file_link_view') ? new Response(JSON.stringify([row])) : new Response(new Uint8Array([1, 2, 3]))),
});
const dispositionOf = async (row: object) => (await workerFor(row).fetch(new Request(`https://app.test/f/${TOK}/raw`), env)).headers.get('content-disposition');
const pdf = (name: string) => ({ name, kind: 'pdf', type: 'application/pdf', body: 'JVBERg==' });

// What a browser saves it as: filename* when there is one, as RFC 6266 says.
const savedAs = (d: string | null) => {
  const star = /filename\*=UTF-8''([^;]+)/.exec(d ?? '')?.[1];
  return star ? decodeURIComponent(star) : /filename="([^"]*)"/.exec(d ?? '')?.[1];
};

describe('the download\'s name', () => {
  it('keeps accents, dashes, emoji, other scripts and quotes', async () => {
    for (const name of ['Résumé – final 🚀.pdf', 'שלום report.pdf', 'quote"s and \'apostrophes\'.pdf', '報告書 (最終).pdf']) {
      expect(savedAs(await dispositionOf(pdf(name))), name).toBe(name);
    }
  });

  it('gives a plain name too, for a browser that reads no filename*', async () => {
    const d = await dispositionOf(pdf('Résumé – final 🚀.pdf'));
    expect(d).toMatch(/^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(/filename="([^"]*)"/.exec(d!)![1]).not.toMatch(/["\\]/);
  });

  it('leaves a plain ASCII name exactly as it was', async () => {
    expect(await dispositionOf(pdf('notes v2.pdf'))).toBe('inline; filename="notes v2.pdf"');
    expect(await dispositionOf({ name: 'leads.csv', kind: 'markdown', type: 'text/csv', body: 'a,b' })).toBe('attachment; filename="leads.csv"');
  });

  it('cannot break out of the header with a line break or a semicolon', async () => {
    const d = await dispositionOf(pdf('a\r\nset-cookie: x;y.pdf'));
    expect(d).not.toMatch(/[\r\n]/);
    expect(savedAs(d)).toBe('a  set-cookie: x;y.pdf');
  });
});

describe('a long name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'long-name-'));
  const named = (name: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, '# Hi\n');
    return linkCopyOf(p) as { name: string };
  };

  it('is cut to 200 characters, keeping its ending', () => {
    const name = named(`${'a'.repeat(252)}.md`).name;
    expect([...name].length).toBe(200);
    expect(name.endsWith('….md')).toBe(true);
  });

  it('counts an emoji as one character and never cuts one in half', () => {
    // 241 bytes on disk, under the 255 Linux and macOS allow, and 205 characters.
    const name = named(`${'a'.repeat(190)}${'🚀'.repeat(12)}.md`).name;
    expect([...name].length).toBe(200);
    expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('leaves a name of 200 characters as it is', () => {
    const exact = `${'b'.repeat(197)}.md`;
    expect(named(exact).name).toBe(exact);
  });
});
