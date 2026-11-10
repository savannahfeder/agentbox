// FILES AND THE BIG VIEW COUNT THE SAME VERSIONS OF A FILE.
//
// Sofia: Files said "group-seat-picker.png v5" while the picture opened
// "v4 of 4", and no v5 had been made (her v5 run died). Dev saw the same file as
// "v5 of 5", its fifth showing v4's picture. Measured from the code: another
// thread named v4 bare and then carried it as an attachment, which threadFiles
// keeps as a second version of that name, so Files counted v4 twice. A copy with
// the very bytes of the version before it is now that version.
//
// Maya's investor update inside its own thread showed v5 after v6 was made on
// another thread. The root was that each copy counted for itself.
// Every surface now reads the file's version line (shared/version-line.mts), so
// a name whose bytes no computer has is no version, and a thread's view gets
// every version the line holds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

async function aMac() {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-count-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  const dir = path.join(accountRoot, 'app');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const place = appFilesPlace({ store, accountRoot, storeRoot });
  const put = (rel, bytes) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
  const thread = async (title, ...notes) => {
    const t = store.composeItem('app', { title, body: 'x' });
    for (const note of notes) await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
    return t;
  };
  return { place, put, thread };
}
const tile = (list) => list.files.find((f) => f.name === 'seat.png');

describe('a version whose bytes no computer has', () => {
  it('is not counted, though a thread names it', async () => {
    const m = await aMac();
    m.put('designs/seat.png', 'one');
    await m.thread('Seat', '[seat.png](designs/seat.png)', '[seat-v2.png](designs/seat-v2.png)');
    const list = await m.place.list();
    expect(tile(list).versions).toBe(1);
    expect((await m.place.open(tile(list).key)).versions).toHaveLength(1);
  });
});

describe('a second copy of the same version', () => {
  it('with the same bytes is that version, not the next', async () => {
    const m = await aMac();
    m.put('designs/seat.png', 'one');
    m.put('designs/seat-v2.png', 'two');
    m.put('attachments/0123456789ab-seat-v2.png', 'two');
    await m.thread('Seat', '[seat.png](designs/seat.png)', 'seat-v2.png is at [seat-v2.png](designs/seat-v2.png)');
    await m.thread('Dev', 'Building from seat-v2.png', 'Here it is: [seat-v2.png](attachments/0123456789ab-seat-v2.png)');
    const list = await m.place.list();
    expect(tile(list).versions).toBe(2);
    expect((await m.place.open(tile(list).key)).versions).toHaveLength(2);
  });

  it('with other bytes is a new version', async () => {
    const m = await aMac();
    m.put('designs/seat.png', 'one');
    m.put('designs/seat-v2.png', 'two');
    m.put('attachments/0123456789ab-seat-v2.png', 'two, redrawn');
    await m.thread('Seat', '[seat.png](designs/seat.png)', 'seat-v2.png is at [seat-v2.png](designs/seat-v2.png)');
    await m.thread('Dev', 'Building from seat-v2.png', 'Here it is: [seat-v2.png](attachments/0123456789ab-seat-v2.png)');
    expect(tile(await m.place.list()).versions).toBe(3);
  });
});

describe("a thread's files, asked by the thread", () => {
  it('hold the version another thread made, numbered as Files numbers it', async () => {
    const m = await aMac();
    m.put('designs/plan.md', 'one');
    m.put('designs/plan-v2.md', 'two');
    m.put('designs/plan-v3.md', 'three');
    const mine = await m.thread('Plan', '[plan.md](designs/plan.md)', '[plan-v2.md](designs/plan-v2.md)');
    await m.thread('Fix', 'Read plan-v2.md. Saved [plan-v3.md](designs/plan-v3.md).');
    const [file] = await m.place.lineFor({ product: 'app', id: mine.id });
    expect(file.versions.map((v) => [v.n, v.here])).toEqual([[1, ['designs/plan.md']], [2, ['designs/plan-v2.md']], [3, []]]);
    expect(fs.readFileSync(file.versions[2].path, 'utf8')).toBe('three');
  });

  it('is not a file that only shares a folder', async () => {
    const m = await aMac();
    m.put('designs/plan.md', 'one');
    m.put('designs/other-v2.md', 'two');
    const mine = await m.thread('Plan', '[plan.md](designs/plan.md)');
    await m.thread('Other', '[other.md](designs/other.md) [other-v2.md](designs/other-v2.md)');
    expect((await m.place.lineFor({ product: 'app', id: mine.id })).map((f) => f.versions.map((v) => v.name))).toEqual([['plan.md']]);
  });
});

describe("a thread's big view opens what it was sent, with a way to the newest", () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
  it("asks Files for each file's line", () => {
    const own = read('renderer/src/components/ThreadArtifacts.tsx');
    expect(own).toContain('useFileLine(');
    expect(read('renderer/src/file-numbers.ts')).toContain('api.fileLine(');
    expect(read('shared/artifact-marks.mts')).toMatch(/newer: true/);
  });
  it('offers the newest from an older version', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/className="av-newest"[^\n]*>Show v\{/);
  });
  it('a version from elsewhere is edited where it lives, not here', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/const canEdit = [^\n]*!version\.newer/);
  });
});
