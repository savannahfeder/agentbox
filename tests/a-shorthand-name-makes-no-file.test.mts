// A SHORTHAND NAME MAKES NO FILE.
//
// Dev: an agent wrote "onboarding-b-1-start, -2-link-live and
// -3-done, each as -desktop.png and -390.png", and the reply grew two dead
// cards, "missing image: -desktop.png" and "-390.png", and Files two junk
// tiles at the top. Measured from the code: any word ending in .png was a
// file. A name that starts with a dash is the end of another name, never a
// file, and a name whose bytes are on no computer is not a version in Files.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { filesInLines, otherFilesInLines } from '../shared/artifact-marks.mts';

const said = (result) => [{ ts: 1, source: 'agent', patch: { result } }];

describe('a name that starts with a dash', () => {
  it('is no file in a message', () => {
    const lines = said('Saved onboarding-b-1-start, -2-link-live and -3-done, each as -desktop.png and -390.png. The other five as `-tight.png` files.');
    expect(filesInLines(lines).map((f) => f.path)).toEqual([]);
  });

  it('a link to one is no file either', () => {
    expect(filesInLines(said('[-390.png](designs/-390.png)')).map((f) => f.path)).toEqual([]);
    expect(otherFilesInLines(said('`-page.html`')).map((f) => f.path)).toEqual([]);
  });

  it('a whole name with a dash inside is still a file', () => {
    expect(filesInLines(said('Saved onboarding-b-1-start-390.png')).map((f) => f.path)).toEqual(['onboarding-b-1-start-390.png']);
  });
});

describe('Files', () => {
  async function aMac() {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shorthand-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    const dir = path.join(accountRoot, 'app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const t = store.composeItem('app', { title: 'Onboarding', body: 'x' });
    const note = (n) => disk.updateWorkItem(dir, t.id, { note: n }, { source: 'agent' });
    return { place: appFilesPlace({ store, accountRoot, storeRoot }), dir, note };
  }

  it('lists no entry for "-390.png" with no known base', async () => {
    const m = await aMac();
    await m.note('Each as -desktop.png and -390.png');
    expect((await m.place.list()).files.map((f) => f.name)).toEqual([]);
  });

  it('lists no entry for a name no computer has bytes for', async () => {
    const m = await aMac();
    await m.note('I will save it as seat-picker-21-v3.png once it is drawn');
    expect((await m.place.list()).files.map((f) => f.name)).toEqual([]);
  });

  it('still lists a picture that is there', async () => {
    const m = await aMac();
    fs.mkdirSync(path.join(m.dir, 'designs'), { recursive: true });
    fs.writeFileSync(path.join(m.dir, 'designs', 'onboarding-b-1-start-390.png'), 'png');
    await m.note('Saved [onboarding-b-1-start-390.png](designs/onboarding-b-1-start-390.png), and -desktop.png');
    expect((await m.place.list()).files.map((f) => f.name)).toEqual(['onboarding-b-1-start-390.png']);
  });
});
