// On 2026-11-16 a power tester opened onboarding-next-step-copy-and-ticket.md
// in a thread, saw "v2 of 2", wrote a note, and the viewer jumped to "v3 of 3"
// with chat saying "Note on ..., v3". On disk the agent had rewritten the file
// in place at 19:55:54, 25 s before the note (19:56:19), but the version line
// only took the new bytes at 19:56:19: a thread's file versions were kept for
// 30 s keyed on what the threads say, so a write over the same path went
// unseen and its bytes were shown, and noted, as v2.
//
// Measured with lineFor, which the thread's file viewer reads.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace, filesOfInternals } from '../main/files-place.mts';

let place, dir, id, file;

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-in-place-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'product');
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'product', name: 'Product' }));
  file = path.join(dir, 'notes', 'ticket.md');
  fs.writeFileSync(file, '# Ticket\n\nTwo options, A and B.\n');
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  place = appFilesPlace({ store, accountRoot, storeRoot });
  id = disk.createWorkItem(dir, { title: 'Onboarding' }).id;
  disk.updateWorkItem(dir, id, { note: 'Saved [the ticket](notes/ticket.md)' }, { source: 'agent' });
});

const versions = async () => (await place.lineFor({ product: 'product', id }))[0].versions;
const read = (v) => fs.readFileSync(v.path, 'utf8');

it('shows the bytes an agent just wrote over the file as the next version, not the one before', async () => {
  expect((await versions()).map((v) => v.n)).toEqual([1]);
  fs.writeFileSync(file, '# Ticket\n\nDecision: A.\n');
  disk.updateWorkItem(dir, id, { result: 'Recorded A in `notes/ticket.md`.' }, { source: 'agent' });
  expect((await versions()).map((v) => v.n)).toEqual([1, 2]);

  fs.writeFileSync(file, '# Ticket: make the next step obvious\n\nBlockers first.\n');
  const now = await versions();
  expect(now.map((v) => v.n)).toEqual([1, 2, 3]);
  expect(read(now[2])).toContain('make the next step obvious');
  expect(now[2].here).toEqual(['notes/ticket.md']);
});

it('keeps the latest version the latest while nothing writes over it', async () => {
  await versions();
  fs.writeFileSync(file, '# Ticket\n\nDecision: A.\n');
  await versions();
  const before = filesOfInternals.chains;
  disk.updateWorkItem(dir, id, { result: 'The ticket is at `notes/ticket.md`.' }, { source: 'agent' });
  const now = await versions();
  expect(now.map((v) => v.n)).toEqual([1, 2]);
  expect(read(now[1])).toContain('Decision: A.');
  expect(filesOfInternals.chains - before).toBe(0);
});

it('leaves an older version its number and its own bytes after the rewrite', async () => {
  await versions();
  fs.writeFileSync(file, '# Ticket\n\nDecision: A.\n');
  const now = await versions();
  expect(now.map((v) => v.n)).toEqual([1, 2]);
  expect(read(now[0])).toContain('Two options, A and B.');
  expect(read(now[1])).toContain('Decision: A.');
});
