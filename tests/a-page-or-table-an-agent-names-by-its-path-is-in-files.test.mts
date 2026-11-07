// A PAGE OR TABLE AN AGENT NAMES BY ITS PATH IS IN FILES.
//
// "Artifacts the agent makes do not show up in Files." The brief tells an agent
// to put a page or a table it made on a line of its own, by its path, and the
// message draws it beside the thread. Files only counted a page or a table
// named as a link or a code span, so those never reached it. Measured with
// otherFilesInLines on an answer naming designs/w-1/files-page.html and
// leads.csv bare: it found neither, while a .png named the same way was found.
// A bare word with no folder ("node.js", "index.html") is still no file.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { otherFilesInLines } from '../shared/artifact-marks.mts';

const found = (text, source = 'agent') => otherFilesInLines([{ ts: 1, source, patch: { result: text } }]).map((f) => f.path);
const DIR = '/Users/x/Zero/accounts/a/app';

describe('a page or table an agent names bare', () => {
  it('counts a page written out in full on a line of its own', () => {
    expect(found(`**Pick one.**\n\n${DIR}/designs/w-1/files-page.html\n`)).toEqual([`${DIR}/designs/w-1/files-page.html`]);
  });

  it('counts a table, and a relative path inside a sentence', () => {
    expect(found(`The list is in ${DIR}/leads.csv.`)).toEqual([`${DIR}/leads.csv`]);
    expect(found('The page is at designs/w-1/page.html and the rows at reports/rows.tsv.')).toEqual(['designs/w-1/page.html', 'reports/rows.tsv']);
  });

  it('still counts a link and a code span once each', () => {
    expect(found('[The page](designs/a.html), again `designs/a.html`, and designs/a.html')).toEqual(['designs/a.html']);
  });

  it('counts no bare word without a folder', () => {
    expect(found('Built with node.js; index.html and data.csv are the usual names.')).toEqual([]);
  });

  it('counts no script named bare, which a sentence about code names all the time', () => {
    expect(found('I changed main/files-place.mts and scripts/ship.sh.')).toEqual([]);
  });

  it('counts no bare path in a person\'s own words, only what they attached', () => {
    expect(found('Can you make designs/w-1/page.html?', 'founder')).toEqual([]);
  });

  it('counts no address on the web', () => {
    expect(found('See https://example.com/docs/page.html and http://x.io/a/b.csv')).toEqual([]);
  });
});

describe('Files', () => {
  async function aMac() {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-page-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    const dir = path.join(accountRoot, 'app');
    fs.mkdirSync(path.join(dir, 'designs', 'w-1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const t = store.composeItem('app', { title: 'Files page', body: 'x' });
    const answer = (result) => disk.updateWorkItem(dir, t.id, { result }, { source: 'agent' });
    return { place: appFilesPlace({ store, accountRoot, storeRoot }), dir, answer };
  }

  it('lists the page and the table an answer names by their full paths', async () => {
    const m = await aMac();
    fs.writeFileSync(path.join(m.dir, 'designs', 'w-1', 'files-page.html'), '<h1>Files</h1>');
    fs.writeFileSync(path.join(m.dir, 'leads.csv'), 'name,company\nA,B\n');
    await m.answer(`**Pick one.**\n\n${m.dir}/designs/w-1/files-page.html\n\nThe leads: ${m.dir}/leads.csv`);
    const files = (await m.place.list()).files;
    expect(files.map((f) => [f.name, f.kind]).sort()).toEqual([['files-page.html', 'page'], ['leads.csv', 'table']]);
  });

  it('lists no page that is not on disk', async () => {
    const m = await aMac();
    await m.answer('I will draw it at designs/w-1/later.html once you pick.');
    expect((await m.place.list()).files).toEqual([]);
  });
});
