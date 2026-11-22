// OLD PICTURES AND FILMS NO THREAD NAMES MOVE TO THE CLOUD.
//
// Files in the cloud only weighed the files a thread's messages name. On the
// founder's Mac on 2026-11-22 that left about 60,000 pictures, films and sound
// files (45 GB) in her projects' folders that never moved: an agent's frames,
// takes and stills are rarely named one by one, and the threads made before
// 13 October had dropped off the list the app reads, so 542 of its design
// folders (14 GB) were unseen. Their kept old versions sat beside them as
// second full copies. Measured through the real Files place, a real store and
// a cloud in memory.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';
import { filesKeeper } from '../main/files-cloud.mts';

const DAY = 24 * 60 * 60_000;
const sha = (b: string) => crypto.createHash('sha256').update(b).digest('hex');

let storeRoot: string;
let realRoot: string;
let dir: string;
let place: ReturnType<typeof appFilesPlace>;
let keeper: ReturnType<typeof filesKeeper>;
let held: Map<string, Buffer>;
let keptRoot: string;
const ids: Record<string, string> = {};

const put = (rel: string, body: string, ageDays = 40, root = dir): string => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  const t = (Date.now() - ageDays * DAY) / 1000;
  fs.utimesSync(p, t, t);
  return p;
};
const here = (p: string) => fs.existsSync(p);
const sent = (body: string) => held.has(`files/${sha(body)}`);

beforeEach(async () => {
  disk._internals.forgetFolds();
  // Reached through a link, as a Mac's temporary folder is (/var is /private/var):
  // the first ship of this change failed there and passed everywhere else.
  realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loose-files-'));
  storeRoot = `${realRoot}-link`;
  fs.symlinkSync(realRoot, storeRoot);
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'product');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'product', name: 'Product' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  for (const [name, status] of [['closed', 'done'], ['open', 'open'], ['blocked', 'blocked']] as const) {
    ids[name] = disk.createWorkItem(dir, { title: name }).id;
    if (status !== 'open') disk.updateWorkItem(dir, ids[name], { status }, { source: 'founder' });
  }
  held = new Map();
  const storage = {
    async putFile(k: string, f: string) { held.set(k, fs.readFileSync(f)); },
    async getToFile(k: string, f: string) { const b = held.get(k); if (!b) return false; fs.writeFileSync(f, b); return true; },
    async exists(k: string) { return held.has(k); },
    async del(k: string) { held.delete(k); },
  };
  keeper = filesKeeper({
    dir: path.join(accountRoot, '.files-cloud'),
    storage: async () => storage,
    account: async () => ({ bytes: 0, cap: 2 ** 40, full: false }),
    settings: () => ({ on: true, offAfterDays: 7 }),
  });
  place = appFilesPlace({ store, accountRoot, storeRoot, keeper });
  keptRoot = path.join(store.teammates?.dir?.() ?? storeRoot, '.file-versions', 'version-bytes');
});
afterEach(() => { fs.rmSync(storeRoot, { force: true }); fs.rmSync(realRoot, { recursive: true, force: true }); });

describe('a picture, film or sound file in a project folder that no thread names', () => {
  it('leaves the Mac for the cloud once it is a week old, from a closed thread, a thread no longer listed, or no thread', async () => {
    const frame = put(`designs/${ids.closed}/frame.png`, 'closed frame');
    const voice = put(`designs/${ids.closed}/voice.wav`, 'closed voice');
    const gone = put('designs/w-0123456789/old.mp4', 'a thread nobody lists any more');
    const pasted = put('attachments/pasted.png', 'pasted picture');
    await place.considerNow();
    for (const [p, body] of [[frame, 'closed frame'], [voice, 'closed voice'], [gone, 'a thread nobody lists any more'], [pasted, 'pasted picture']]) {
      expect(here(p), p).toBe(false);
      expect(sent(body), p).toBe(true);
    }
  });

  it('stays, and is not sent, while it is under a week old', async () => {
    const fresh = put(`designs/${ids.closed}/fresh.png`, 'fresh', 6);
    await place.considerNow();
    expect(here(fresh)).toBe(true);
    expect(sent('fresh')).toBe(false);
  });

  it('stays in an open or blocked thread\'s folder, however old, where its agent works', async () => {
    const take = put(`designs/${ids.open}/take.mp4`, 'open take', 90);
    const still = put(`designs/${ids.blocked}/still.png`, 'blocked still', 90);
    await place.considerNow();
    expect(here(take)).toBe(true);
    expect(here(still)).toBe(true);
    expect(held.size).toBe(0);
  });

  it('never leaves when it is a document, or sits in a code checkout, node_modules or a hidden folder', async () => {
    const kept = [
      put(`designs/${ids.closed}/cut.html`, '<p>cut</p>'),
      put(`designs/${ids.closed}/notes.md`, '# notes'),
      put(`designs/${ids.closed}/site/logo.png`, 'logo in a checkout'),
      put(`designs/${ids.closed}/node_modules/pkg/icon.png`, 'icon in node_modules'),
      put(`designs/${ids.closed}/.cache/thumb.png`, 'thumb in a hidden folder'),
    ];
    fs.mkdirSync(path.join(dir, 'designs', ids.closed, 'site', '.git'), { recursive: true });
    await place.considerNow();
    for (const p of kept) expect(here(p), p).toBe(true);
    expect(held.size).toBe(0);
  });

  it('comes back byte for byte when its thread starts again', async () => {
    const frame = put(`designs/${ids.closed}/shots/frame.png`, 'closed frame');
    const other = put('designs/w-0123456789/old.mp4', 'another thread\'s film');
    await place.considerNow();
    expect(here(frame)).toBe(false);
    expect(await place.bringBackFor({ product: 'product', id: ids.closed })).toBe(true);
    expect(fs.readFileSync(frame, 'utf8')).toBe('closed frame');
    expect(here(other)).toBe(false);
  });
});

// From the second review of the change, 2026-11-22: a picture a thread names
// still left an open thread's folder, and a project's own icon could leave.
describe('what stays however old', () => {
  it('a picture a thread names stays in an open thread\'s folder, and leaves a closed one\'s', async () => {
    const open = put(`designs/${ids.open}/hero.png`, 'open hero');
    const closed = put(`designs/${ids.closed}/hero.png`, 'closed hero');
    const long = Date.now() - 40 * DAY;
    disk.updateWorkItem(dir, ids.open, { note: `Saved [the hero](designs/${ids.open}/hero.png)` }, { source: 'agent', now: long });
    disk.updateWorkItem(dir, ids.closed, { note: `Saved [the hero](designs/${ids.closed}/hero.png)` }, { source: 'agent', now: long });
    await place.considerNow();
    expect(here(open)).toBe(true);
    expect(here(closed)).toBe(false);
  });

  it('the project\'s own icon', async () => {
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'product', name: 'Product', logo: 'icon.png' }));
    const icon = put('icon.png', 'the icon');
    const other = put('marketing/banner.png', 'a banner');
    await place.considerNow();
    expect(here(icon)).toBe(true);
    expect(here(other)).toBe(false);
  });
});

describe('an old version kept beside its file', () => {
  it('leaves with the file of the same bytes and comes back with it', async () => {
    const frame = put(`designs/${ids.closed}/frame.png`, 'closed frame');
    const copy = put(path.join(sha('closed frame'), 'frame.png'), 'closed frame', 40, keptRoot);
    await place.considerNow();
    expect(here(frame)).toBe(false);
    expect(here(copy)).toBe(false);
    await place.bringBackFor({ product: 'product', id: ids.closed });
    expect(fs.readFileSync(copy, 'utf8')).toBe('closed frame');
  });

  it('leaves on its own when nothing else holds its bytes, as an old cut written over', async () => {
    const copy = put(path.join(sha('first cut'), 'cut.mp4'), 'first cut', 40, keptRoot);
    await place.considerNow();
    expect(here(copy)).toBe(false);
    expect(sent('first cut')).toBe(true);
    expect(keeper.hashAt(copy)).toBe(sha('first cut'));
  });
});
