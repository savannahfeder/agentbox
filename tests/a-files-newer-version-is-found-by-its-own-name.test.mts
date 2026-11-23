// A FILE'S NEWER VERSION IS FOUND BY ITS OWN NAME.
//
// A power tester (2026-11-23) opened payment-amounts-v2.md from Codex's link in
// his thread, then searched "payment-amounts-v2" in Attach from Files and read
// "No file matches". Files lists a file once, under its first version's name
// (payment-amounts.md, v2), and its search read only that name, so the name the
// thread showed him found nothing. Measured on his ledger: the v2 note resolves
// in payment-amounts-v2.md on the same thread as payment-amounts.md.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mts';
import { filesShown } from '../renderer/src/files/files-shown.ts';
import { filesToAttach } from '../renderer/src/files/from-files.ts';
import type { PlacedFile } from '../renderer/src/types.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'newer-version-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function listed(): Promise<PlacedFile[]> {
  const dir = fs.mkdtempSync(path.join(root, 'p-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'payment-amounts.md'), '# Cents\n');
  fs.writeFileSync(path.join(dir, 'docs', 'payment-amounts-v2.md'), '# Cents, with USD\n');
  const lines = [
    { id: 'w-1', ts: 1, source: 'agent', patch: { result: 'I drafted [docs/payment-amounts.md](docs/payment-amounts.md).' } },
    { id: 'w-1', ts: 2, source: 'agent', patch: { result: 'The [updated draft](docs/payment-amounts-v2.md) has all five fields.' } },
    { id: 'w-1', ts: 3, source: 'agent', patch: { note: 'Saved [payment-amounts-v2.md](docs/payment-amounts-v2.md) as the next version of [payment-amounts.md](docs/payment-amounts.md).' } },
  ];
  const product = { slug: 'payments-api', name: 'Payments API', dir };
  const store = {
    listProducts: () => [product],
    listAllWorkItems: () => [{ id: 'w-1', product: 'payments-api', title: 'Payment amounts', updatedAt: 3 }],
    readHistory: () => lines,
    teammates: { dir: () => dir },
  };
  const place = appFilesPlace({ store, team: null, accountRoot: dir, storeRoot: dir } as never);
  return (await place.list()).files as unknown as PlacedFile[];
}

describe('a file with a newer version', () => {
  it('is listed once, under its first name', async () => {
    const files = await listed();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'payment-amounts.md', versions: 2 });
  });

  it("is found by the newer version's own name, in Files and in Attach from Files", async () => {
    const files = await listed();
    expect(filesShown(files, { query: 'payment-amounts-v2' }).map((f) => f.name)).toEqual(['payment-amounts.md']);
    expect(filesToAttach(files, 'payment-amounts-v2').map((f) => f.name)).toEqual(['payment-amounts.md']);
  });

  it('is still found by its first name, and not by a word in neither', async () => {
    const files = await listed();
    expect(filesShown(files, { query: 'payment-amounts' })).toHaveLength(1);
    expect(filesShown(files, { query: 'payment-amounts-v3' })).toHaveLength(0);
  });
});
