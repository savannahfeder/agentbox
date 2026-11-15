// A VERSION NOT ON THIS COMPUTER NEVER DRAWS ANOTHER VERSION'S BYTES.
//
// Both testers on one team (2026-11-11): "Files checkout.html marked v8 still
// shows the original prototype after the revision." Measured from the code:
// when the line's newest version had no copy and no kept bytes here (a
// teammate's revision), lineChain gave it the copies of the local file of that
// name, and open() drew that file under the newest number. Now such a version
// opens as a path that finds nothing, so the view says where it is, the
// version that is here keeps its own number, and the thread's copy is numbered
// as the version its bytes are.
import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mts';

const FIRST = '<h1>Original prototype</h1>';
const REVISED = '<h1>Revised checkout</h1>';

let root: string;
let file: string;
let store: { listProducts: () => unknown[]; listAllWorkItems: () => unknown[]; readHistory: () => unknown[] };
const make = () => appFilesPlace({ store, team: null, accountRoot: root, storeRoot: root } as unknown as Parameters<typeof appFilesPlace>[0]);
const keyOf = async (place: ReturnType<typeof make>) => (await place.list()).files[0].key;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'away-version-'));
  const dir = path.join(root, 'shop');
  file = path.join(dir, 'designs', 'checkout.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: 'Made [checkout.html](designs/checkout.html)' } }];
  store = {
    listProducts: () => [{ slug: 'shop', name: 'Shop', dir }],
    listAllWorkItems: () => [{ product: 'shop', id: 'w-1', title: 'Checkout', updatedAt: '1' }],
    readHistory: () => lines,
  };
  // v1 then v2 join the line, then v2's bytes leave this computer and the file here is the first again.
  fs.writeFileSync(file, FIRST);
  await make().list();
  fs.writeFileSync(file, REVISED);
  await make().list();
  const hash = crypto.createHash('sha256').update(REVISED).digest('hex');
  fs.rmSync(path.join(root, '.file-versions', 'version-bytes', hash), { recursive: true, force: true });
  fs.writeFileSync(file, FIRST);
});

const pathIn = (line: { patch?: { note?: unknown } }) => /\]\(([^)]+)\)/.exec(String(line.patch?.note ?? ''))?.[1] ?? '';
const textAt = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

describe('the newest version has no bytes here', () => {
  it('is still v2 of 2', async () => {
    const place = make();
    const view = (await place.open(await keyOf(place)))!;
    expect(view.versions.map((v) => v.n)).toEqual([1, 2]);
  });

  it('does not open the first version\'s bytes under v2', async () => {
    const place = make();
    const view = (await place.open(await keyOf(place)))!;
    const newest = pathIn(view.lines[1]);
    expect(textAt(newest)).toBeNull();
    expect(textAt(path.join(root, 'shop', newest))).toBeNull();
  });

  it('v1 opens the bytes that are here, under its own number', async () => {
    const place = make();
    const view = (await place.open(await keyOf(place)))!;
    expect(textAt(pathIn(view.lines[0]))).toBe(FIRST);
  });

  it("the thread's copy is numbered v1, the version its bytes are", async () => {
    const [line] = await make().lineFor({ product: 'shop', id: 'w-1' });
    expect(line.versions.map((v) => [v.n, v.here])).toEqual([[1, ['designs/checkout.html']], [2, []]]);
  });

  it("Files' tile draws the newest version that is here", async () => {
    const { files } = await make().list();
    expect(textAt(files[0].opened!)).toBe(FIRST);
  });
});

describe('the newest version is here', () => {
  it('opens its own bytes', async () => {
    fs.writeFileSync(file, REVISED);
    const place = make();
    const view = (await place.open(await keyOf(place)))!;
    expect(view.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(textAt(pathIn(view.lines[1]))).toBe(REVISED);
  });
});
