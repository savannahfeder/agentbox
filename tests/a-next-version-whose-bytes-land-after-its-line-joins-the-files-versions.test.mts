// On 2026-11-16 a power tester kept checkpoint-order-audit-v3.md open beside
// a cloud thread and asked for a Reproduce section. The answer said v4 was
// saved, but the panel stayed on "v3" with no v4 to step to, for minutes. A
// cloud run's answer reaches the thread before its files reach this Mac, so
// the first look at the line found no bytes for -v4; the line kept from that
// look was then reused while its older versions' bytes were unchanged, and a
// version that had no bytes yet was never looked for again.
//
// Measured with lineFor, which the thread's file viewer reads.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

let place, dir, id;

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bytes-after-line-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'product');
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'product', name: 'Product' }));
  fs.writeFileSync(path.join(dir, 'reports', 'audit.md'), '# Audit\n\nOrder holds.\n');
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
  id = disk.createWorkItem(dir, { title: 'Checkpoint audit' }).id;
  disk.updateWorkItem(dir, id, { note: 'Saved [the audit](reports/audit.md)' }, { source: 'agent' });
});

const versions = async () => (await place.lineFor({ product: 'product', id }))[0].versions;

it('takes a next version in once its bytes land, though the thread said nothing more', async () => {
  expect((await versions()).map((v) => v.n)).toEqual([1]);
  disk.updateWorkItem(dir, id, { result: 'Saved `reports/audit-v2.md` with a Reproduce section.' }, { source: 'agent' });
  expect((await versions()).map((v) => v.n)).toEqual([1]);

  fs.writeFileSync(path.join(dir, 'reports', 'audit-v2.md'), '# Audit\n\nOrder holds.\n\n## Reproduce\n');
  const now = await versions();
  expect(now.map((v) => v.n)).toEqual([1, 2]);
  expect(fs.readFileSync(now[1].path, 'utf8')).toContain('## Reproduce');
});

it('keeps the line as it was while the named version still has no bytes', async () => {
  disk.updateWorkItem(dir, id, { result: 'Saved `reports/audit-v2.md`.' }, { source: 'agent' });
  expect((await versions()).map((v) => v.n)).toEqual([1]);
  expect((await versions()).map((v) => v.n)).toEqual([1]);
});
