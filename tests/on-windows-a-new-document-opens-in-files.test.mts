// ON WINDOWS A NEW DOCUMENT OPENS IN FILES.
//
// On Windows Server 2022, a document made with New > Document was listed on the
// Files page and was on disk, but opening it said "journal.md: Not on this
// computer yet." The list found the file; the big view did not. The view reads
// its versions from lines the main process writes as markdown links to the path
// each version opens from, and that path was C:\Users\...\journal.md. The link
// reader takes no colon in a link, so it skipped the link and kept only the bare
// "journal.md" at its end, which named no version the view held. An edited
// version's line carried the backslashes too, and its name became the whole path.
//
// Measured on Windows Server 2022, node 24, browser mode: the view's line was
//   [journal.md](C:\Users\...\my-workspace\documents\journal.md)
// and filesInLines read it as ["journal.md"].

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace, linkPath } from '../main/files-place.mts';
import { filesInLines, threadFiles } from '../shared/artifact-marks.mts';

const said = (note: string): string[] => filesInLines([{ ts: 1, by: null, source: 'system', patch: { note } }]).map((f) => f.path);

describe('a link to a file on a Windows drive', () => {
  it('is read whole', () => {
    expect(said('[journal.md](C:/Users/me/Agentbox/ws/documents/journal.md)')).toEqual(['C:/Users/me/Agentbox/ws/documents/journal.md']);
    expect(said('[a.png](d:/shots/a.png)')).toEqual(['d:/shots/a.png']);
  });

  it('still reads a Mac or Linux path and a relative one as before', () => {
    expect(said('[journal.md](/home/me/ws/documents/journal.md)')).toEqual(['/home/me/ws/documents/journal.md']);
    expect(said('[journal.md](documents/journal.md)')).toEqual(['documents/journal.md']);
  });

  it('is not a web address or a colon anywhere but after one drive letter', () => {
    expect(said('[spec](https://example.com/spec.md)')).not.toContain('https://example.com/spec.md');
    expect(said('[spec](ab:/x/spec.md)')).not.toContain('ab:/x/spec.md');
    expect(said('[spec](C:/x:y/spec.md)')).not.toContain('C:/x:y/spec.md');
  });
});

describe('the path a big view line links to', () => {
  it('goes in forward slashes from a Windows path', () => {
    expect(linkPath(String.raw`C:\Users\me\ws\documents\journal.md`, path.win32.sep)).toBe('C:/Users/me/ws/documents/journal.md');
  });

  it('is a Mac or Linux path unchanged', () => {
    expect(linkPath('/home/me/ws/documents/journal.md', path.posix.sep)).toBe('/home/me/ws/documents/journal.md');
  });
});

describe('a new document opened from Files', () => {
  let place: ReturnType<typeof appFilesPlace>;

  beforeEach(async () => {
    disk._internals.forgetFolds();
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'win-new-doc-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    const dir = path.join(accountRoot, 'company');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'company', name: 'Company' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    place = appFilesPlace({ store, accountRoot, storeRoot });
  });

  const opened = async (key: string) => {
    const [file] = (await place.list()).files;
    return { file, view: await place.open(key) };
  };

  it('names the file it opens from, whole', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    const { file, view } = await opened(out.key);
    expect(said(String(view.lines[0].patch.note))).toEqual([linkPath(file.opened)]);
  });

  it('keeps every version under the file name once it is edited', async () => {
    const out = await place.newDocument({ project: 'Company', name: 'Journal' });
    await place.edit(out.key, 'one\n');
    await place.edit(out.key, 'two\n');
    const { view } = await opened(out.key);
    const families = threadFiles(filesInLines(view.lines));
    expect(families).toHaveLength(1);
    expect(families[0].versions.map((v) => v.name)).toEqual(['journal.md', 'journal-v2.md']);
    for (const v of families[0].versions) expect(path.isAbsolute(v.path)).toBe(true);
  });
});
