// EVERY KIND OF FILE A THREAD NAMES GOES TO THE PHONE, NOT ONLY PICTURES.
//
// What she asked (2026-10-19): "Needs to apply for all files, not just
// images." The Mac sent a thread's pictures, films, sounds, pages, PDFs and
// Markdown to the hosted phone and nothing else, so a document, a text file,
// a spreadsheet or an archive a thread named opened on the phone as "This file
// is on your computer".
//
// Now any file a thread names goes: a document kind named anywhere in the
// words, and any kind at all in a markdown link (how a reply's attachments are
// written) or in backticks. What still never goes: key and credential files,
// a file named for a secret, and a bare name of an unknown kind in prose,
// which the screens draw as words and not as a file. A text file goes with its
// keys hidden, and a spreadsheet with its password, secret, token and key
// columns emptied.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneUploads, filesNamed, typeOf, hideCsvSecrets } from '../main/phone-uploads.mjs';

const T = Date.UTC(2026, 9, 19, 9, 0);
let home; let docs;
const put = (rel, data = 'x') => { const file = path.join(docs, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); return file; };
const snap = (text) => ({ v: 3, item: { id: 'w-aaaaaaaaaa', result: text, updatedAt: T }, history: [] });
const named = (text) => filesNamed(snap(text), { dir: docs, home }).map((f) => f.key).sort();

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-every-file-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

describe('which files go', () => {
  it('a document, text file, spreadsheet, slide deck or archive named in the words', () => {
    for (const f of ['report.docx', 'notes.txt', 'data.json', 'export.csv', 'deck.pptx', 'sheet.xlsx', 'designs/w-aaaaaaaaaa/bundle.zip']) put(f);
    expect(named('Wrote report.docx and notes.txt; data.json, export.csv, deck.pptx, sheet.xlsx and designs/w-aaaaaaaaaa/bundle.zip')).toEqual(
      ['data.json', 'deck.pptx', 'designs/w-aaaaaaaaaa/bundle.zip', 'export.csv', 'notes.txt', 'report.docx', 'sheet.xlsx'],
    );
  });

  it('any kind at all in a markdown link or in backticks', () => {
    put('attachments/mv1-abc-scene.blend');
    put('out/trace.log2');
    expect(named('[scene.blend](attachments/mv1-abc-scene.blend) and `out/trace.log2`')).toEqual(['attachments/mv1-abc-scene.blend', 'out/trace.log2']);
  });

  it('not a bare name of an unknown kind in prose, which the screens draw as words', () => {
    put('scene.blend');
    put('example.com');
    expect(named('see scene.blend on example.com')).toEqual([]);
  });

  it('never a key or credential file, whatever way it is named', () => {
    for (const f of ['key.pem', 'server.key', 'cert.p12', 'id.pfx', 'vault.kdbx', 'app.keystore', 'secrets.json', 'credentials.txt', '.env', 'prod.env']) put(f);
    expect(named('`key.pem` [k](server.key) `cert.p12` `id.pfx` `vault.kdbx` `app.keystore` secrets.json credentials.txt `.env` `prod.env`')).toEqual([]);
  });

  it('opens on the phone as what it is', () => {
    expect(typeOf('a/notes.txt')).toBe('text/plain; charset=utf-8');
    expect(typeOf('a/report.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(typeOf('a/scene.blend')).toBe('application/octet-stream');
    expect(typeOf('a/key.pem')).toBe(null);
  });
});

describe('what goes of them', () => {
  function uploader() {
    const stored = new Map();
    const up = createPhoneUploads({
      backend: { async putPhoneFile({ name, data, type }) { stored.set(name, { data: Buffer.from(data).toString(), type }); }, async dropPhoneFiles() {} },
      owner: 'o', device: 'a1b2c3d4e5f6', state: {}, save() {}, home, now: () => T,
    });
    return { up, stored };
  }

  it('a text file with its keys hidden, and a spreadsheet with its secret columns emptied', async () => {
    const key = 'sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // a made-up key, to prove it is hidden. public-check: allow
    put('config.json', `{ "token": "${key}", "folder": "${home}/x" }`);
    put('users.csv', 'name,Password,api key,city\nana,hunter22,abc123,Lisbon\nbo,"pa,ss",zzz,Porto\n');
    const { up, stored } = uploader();
    up.manifest('t', snap('config.json and users.csv'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    const sent = [...stored.values()];
    const json = sent.find((s) => s.data.includes('folder')).data;
    expect(json).not.toContain(key);
    expect(json).not.toContain(home);
    const csv = sent.find((s) => s.data.includes('city')).data;
    expect(csv).toContain('ana,[hidden],[hidden],Lisbon');
    expect(csv).not.toContain('hunter22');
    expect(csv).not.toContain('pa,ss');
    expect(csv).toContain('Porto');
  });

  it('a document as its own bytes, with its kind', async () => {
    put('report.docx', 'PK\u0003\u0004 binary');
    const { up, stored } = uploader();
    up.manifest('t', snap('report.docx'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    expect([...stored.values()]).toEqual([{ data: 'PK\u0003\u0004 binary', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]);
  });
});

describe('a spreadsheet\'s secret columns', () => {
  it('empties every column whose heading names a secret, quoted cells and all, and leaves a sheet with none as it was', () => {
    expect(hideCsvSecrets('a,secret_value,b\n1,"x,y",2\n')).toBe('a,secret_value,b\n1,[hidden],2\n');
    expect(hideCsvSecrets('city,count\nLisbon,3\n')).toBe('city,count\nLisbon,3\n');
    expect(hideCsvSecrets('name\ttoken\nana\tabc\n')).toBe('name\ttoken\nana\t[hidden]\n');
    expect(hideCsvSecrets('')).toBe('');
  });
});

describe('on the screens', () => {
  it('a document named in the words is a file to open, and a version number or a site is not', async () => {
    const { linkArtifactPaths } = await import('../renderer/src/remark-artifact-paths.ts');
    const links = (text) => {
      const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }] };
      linkArtifactPaths(tree);
      return tree.children[0].children.filter((n) => n.type === 'link').map((n) => n.url);
    };
    expect(links('Wrote report.docx, notes.txt, data.json, deck.pptx and designs/x/sheet.xlsx')).toEqual(['report.docx', 'notes.txt', 'data.json', 'deck.pptx', 'designs/x/sheet.xlsx']);
    expect(links('version 1.2 on example.com, see scene.blend')).toEqual([]);
  });
});
